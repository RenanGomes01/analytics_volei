import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { createMatch, createMatchWithRoster } from "@/services/match-service";
import { listPending, markAcked } from "@/services/outbox-service";
import {
  appendRallyEnd,
  appendTouch,
  getMatchState,
  listMatchEvents,
  undoLastAction,
  voidEvent,
  type MatchScope,
} from "@/services/rally-ledger-service";
import type { Modality } from "@/domain/types";

let dbName: string;
let db: ScoutDB;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutDB(dbName);
});

afterEach(async () => {
  await db.delete();
});

async function newMatch(modality: Modality = "beach", tenant_id = "t1"): Promise<MatchScope> {
  const match = await createMatch(db, {
    tenant_id,
    modality,
    team_a: { name: "Dupla A", athlete_ids: ["a1", "a2"] },
    team_b: { name: "Dupla B", athlete_ids: ["b1", "b2"] },
    first_server: "A",
  });
  return { tenant_id, match_id: match.id };
}

const q = "+" as const;

describe("rally-ledger-service", () => {
  it("appendTouch grava o evento e 1 entrada pending no outbox, na mesma transação", async () => {
    const scope = await newMatch();
    const event = await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q });

    expect(await db.rally_events.count()).toBe(1);
    const pending = await listPending(db, "t1");
    expect(pending.map((p) => p.entity)).toEqual(["match", "rally_event"]);
    expect(pending[1]).toMatchObject({ entity_id: event.id, status: "pending", server_seq: null });
    expect(event).toMatchObject({ local_seq: 1, set_number: 1, rally_number: 1, phase: "counter_attack" });
  });

  it("se o outbox falha depois do insert do evento, a transação inteira é desfeita", async () => {
    const scope = await newMatch();
    vi.spyOn(db.outbox, "add").mockRejectedValueOnce(new Error("QuotaExceededError"));

    await expect(
      appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q }),
    ).rejects.toThrow("QuotaExceededError");
    expect(await db.rally_events.count()).toBe(0);
    expect(await db.outbox.count()).toBe(1); // só o da partida
  });

  it("deriva rali, fase e sacador a partir do ledger", async () => {
    const scope = await newMatch();
    const serve = await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q });
    const reception = await appendTouch(db, scope, { team: "B", athlete_id: "b1", skill: "reception", quality: q });
    await appendRallyEnd(db, scope, { point_to: "B", reason: "kill" });
    const nextServe = await appendTouch(db, scope, { team: "B", athlete_id: "b2", skill: "serve", quality: q });

    expect(reception).toMatchObject({ rally_id: serve.rally_id, phase: "side_out" });
    expect(nextServe.rally_id).not.toBe(serve.rally_id);
    expect(nextServe.rally_number).toBe(2);
    const state = await getMatchState(db, scope);
    expect(state.sets[0].score).toEqual({ A: 0, B: 1 });
    expect(state.serving_team).toBe("B");
  });

  it("fechar e reabrir o banco reconstrói o mesmo estado (replay)", async () => {
    const scope = await newMatch();
    await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q });
    await appendTouch(db, scope, { team: "B", athlete_id: "b1", skill: "reception", quality: q });
    await appendRallyEnd(db, scope, { point_to: "A", reason: "error" });
    await appendTouch(db, scope, { team: "A", athlete_id: "a2", skill: "serve", quality: q });
    const before = await getMatchState(db, scope);

    db.close();
    db = new ScoutDB(dbName);
    expect(await getMatchState(db, scope)).toEqual(before);
  });

  it("BEACH ponta a ponta: o 4º toque após o bloqueio dá o ponto ao adversário", async () => {
    const scope = await newMatch("beach");
    const seq = [
      ["A", "a1", "serve"],
      ["B", "b1", "reception"],
      ["B", "b2", "set"],
      ["B", "b1", "attack"],
      ["A", "a2", "block"],
      ["A", "a1", "dig"],
      ["A", "a2", "set"],
      ["A", "a1", "attack"],
    ] as const;
    for (const [team, athlete_id, skill] of seq) await appendTouch(db, scope, { team, athlete_id, skill, quality: q });

    const state = await getMatchState(db, scope);
    expect(state.rallies[0]).toMatchObject({ point_to: "B", reason: "four_touches" });
    expect(state.sets[0].score).toEqual({ A: 0, B: 1 });
  });

  it("INDOOR ponta a ponta: a mesma sequência mantém o rali aberto", async () => {
    const scope = await newMatch("indoor");
    const seq = [
      ["A", "serve"],
      ["B", "reception"],
      ["B", "set"],
      ["B", "attack"],
      ["A", "block"],
      ["A", "dig"],
      ["A", "set"],
      ["A", "attack"],
    ] as const;
    for (const [team, skill] of seq) await appendTouch(db, scope, { team, athlete_id: `${team}1`, skill, quality: q });

    const state = await getMatchState(db, scope);
    expect(state.open_rally?.touch_count.violation).toBeUndefined();
    expect(state.sets[0].score).toEqual({ A: 0, B: 0 });
  });

  it("correção não altera o evento original: o ledger só cresce", async () => {
    const scope = await newMatch();
    await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q });
    const end = await appendRallyEnd(db, scope, { point_to: "A", reason: "ace" });
    const snapshot = structuredClone(await db.rally_events.get(end.id));

    const correction = await voidEvent(db, scope, end.id);

    expect(await db.rally_events.count()).toBe(3);
    expect(await db.rally_events.get(end.id)).toEqual(snapshot);
    expect(correction).toMatchObject({ kind: "void", voids_event_id: end.id, rally_id: end.rally_id, local_seq: 3 });
    expect((await getMatchState(db, scope)).sets[0].score).toEqual({ A: 0, B: 0 });
    await expect(voidEvent(db, scope, end.id)).rejects.toThrow(/já foi anulado/);
    await expect(voidEvent(db, scope, correction.id)).rejects.toThrow(/anulação/);
  });

  it("isolamento de tenant: eventos e outbox de outro tenant não aparecem", async () => {
    const mine = await newMatch("beach", "t1");
    const theirs = await newMatch("beach", "t2");
    await appendTouch(db, theirs, { team: "A", athlete_id: "x", skill: "serve", quality: q });

    expect(await listMatchEvents(db, { ...theirs, tenant_id: "t1" })).toEqual([]);
    await expect(appendTouch(db, { ...theirs, tenant_id: "t1" }, { team: "A", athlete_id: "a1", skill: "serve", quality: q })).rejects.toThrow();
    expect((await listPending(db, "t1")).every((e) => e.tenant_id === "t1")).toBe(true);
    expect(await listMatchEvents(db, mine)).toEqual([]);
  });

  it("markAcked grava o server_seq só no outbox", async () => {
    const scope = await newMatch();
    const event = await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: q });
    const entry = (await listPending(db, "t1")).find((e) => e.entity_id === event.id)!;

    await markAcked(db, entry.mutation_id, 42);

    expect(await db.outbox.get(entry.mutation_id)).toMatchObject({ status: "acked", server_seq: 42 });
    expect(await db.rally_events.get(event.id)).toEqual(event);
  });

  it("undoLastAction desfaz em sequência, inclusive o ponto implícito, e para quando não há o que desfazer", async () => {
    const scope = await newMatch();
    await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" });
    await appendTouch(db, scope, { team: "B", athlete_id: "b1", skill: "attack", quality: "#" }); // kill
    expect((await getMatchState(db, scope)).sets[0].score).toEqual({ A: 0, B: 1 });

    await undoLastAction(db, scope);
    let state = await getMatchState(db, scope);
    expect(state.sets[0].score).toEqual({ A: 0, B: 0 });
    expect(state.open_rally?.touches).toHaveLength(1);

    await undoLastAction(db, scope);
    expect(await undoLastAction(db, scope)).toBeNull();
    state = await getMatchState(db, scope);
    expect(state.open_rally).toBeNull();
    expect(await db.rally_events.count()).toBe(4); // 2 lances + 2 anulações: nada foi apagado
  });

  it("undoLastAction reabre uma partida encerrada", async () => {
    const scope = await newMatch();
    for (let i = 0; i < 42; i++) await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "#" });
    expect((await getMatchState(db, scope)).winner).toBe("A");
    await expect(appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "#" })).rejects.toThrow(/encerrada/);

    await undoLastAction(db, scope);
    const state = await getMatchState(db, scope);
    expect(state.winner).toBeNull();
    expect(state.sets[1].score).toEqual({ A: 20, B: 0 });
  });

  it("createMatchWithRoster grava atletas e partida juntos; falha no meio não deixa sobras", async () => {
    const match = await createMatchWithRoster(db, {
      tenant_id: "t1",
      modality: "beach",
      first_server: "B",
      team_a: { name: "A", athletes: [{ name: "Ana", jersey_number: 1 }, { name: "Bia", jersey_number: 2 }] },
      team_b: { name: "B", athletes: [{ name: "Carla" }, { name: "Duda" }] },
    });
    expect(match.team_a.athlete_ids).toHaveLength(2);
    expect(await db.athletes.bulkGet(match.team_b.athlete_ids)).toMatchObject([{ name: "Carla" }, { name: "Duda" }]);

    vi.spyOn(db.matches, "add").mockRejectedValueOnce(new Error("falhou"));
    const athletesBefore = await db.athletes.count();
    await expect(
      createMatchWithRoster(db, {
        tenant_id: "t1",
        modality: "beach",
        first_server: "A",
        team_a: { name: "A", athletes: [{ name: "X" }] },
        team_b: { name: "B", athletes: [{ name: "Y" }] },
      }),
    ).rejects.toThrow("falhou");
    expect(await db.athletes.count()).toBe(athletesBefore);
  });
});

describe("finishMatch — encerramento manual (lesão, chuva, W.O., set único)", () => {
  it("encerra com o vencedor escolhido, descarta o rali aberto e interrompe o set; Desfazer reabre", async () => {
    const scope = await newMatch();
    for (let i = 0; i < 3; i++) await appendRallyEnd(db, scope, { point_to: "B", reason: "manual" });
    await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" }); // rali aberto

    const { finishMatch } = await import("@/services/rally-ledger-service");
    const end = await finishMatch(db, scope, { winner: "B", reason: "retirement", note: "  lesão no tornozelo " });
    expect(end).toMatchObject({ kind: "match_end", winner: "B", reason: "retirement", note: "lesão no tornozelo" });

    const state = await getMatchState(db, scope);
    expect(state.winner).toBe("B");
    expect(state.end).toEqual({ reason: "retirement", note: "lesão no tornozelo" });
    expect(state.open_rally).toBeNull();
    expect(state.rallies).toHaveLength(3);
    expect(state.sets).toEqual([expect.objectContaining({ score: { A: 0, B: 3 }, winner: null, interrupted: true })]);
    // Invariante: pontos do Box Score = placar, mesmo com o rali aberto descartado.
    const { computeBoxScore } = await import("@/domain/stats/box-score");
    const { BEACH_RULES } = await import("@/domain/rules/modality");
    const box = computeBoxScore(await listMatchEvents(db, scope), { rules: BEACH_RULES, first_server: "A", roster: { A: ["a1", "a2"], B: ["b1", "b2"] } });
    expect([box.teams.A.points.total, box.teams.B.points.total]).toEqual([0, 3]);

    await expect(appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" })).rejects.toThrow(/encerrada/);
    await expect(finishMatch(db, scope, { winner: "A", reason: "other" })).rejects.toThrow(/já está encerrada/);

    await undoLastAction(db, scope); // anula o match_end
    const reopened = await getMatchState(db, scope);
    expect(reopened.winner).toBeNull();
    expect(reopened.end).toBeNull();
    expect(reopened.open_rally?.touches).toHaveLength(1); // o rali aberto volta
  });

  it("vai para o outbox e entra no export (o validador aceita match_end)", async () => {
    const scope = await newMatch();
    const { finishMatch } = await import("@/services/rally-ledger-service");
    const { validateExportData } = await import("@/domain/export/validate-export-data");
    await appendRallyEnd(db, scope, { point_to: "A", reason: "manual" });
    const end = await finishMatch(db, scope, { winner: "A", reason: "score" });
    expect((await listPending(db, "t1")).some((e) => e.entity_id === end.id)).toBe(true);
    const match = await db.matches.get(scope.match_id);
    const athletes = ["a1", "a2", "b1", "b2"].map((id) => ({ id, tenant_id: "t1", name: id, created_at: 0 }));
    expect(validateExportData({ match, athletes, events: await listMatchEvents(db, scope) })).toEqual([]);
    expect(validateExportData({ match, athletes, events: [{ ...end, reason: "nope" }] })).toContain("Evento 1: encerramento de partida inválido.");
  });
});
