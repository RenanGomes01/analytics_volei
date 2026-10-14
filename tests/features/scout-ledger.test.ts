import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { createRng } from "@/domain/dev/rally-generator";
import {
  LedgerDraft,
  planRally,
  planRallyEnd,
  planResolvePoint,
  planTouch,
  planUndoLastAction,
  planUndoLastRally,
  type MatchScope,
  type PlanContext,
} from "@/domain/rally/plan-events";
import { buildQuickRally, pointOutcomes, type QuickTap } from "@/domain/rally/quick-rally";
import { replayMatch } from "@/domain/rally/replay";
import { detailedPointOutcomes, resolveDetailedPoint } from "@/domain/rally/resolve-detailed-point";
import { rulesFor } from "@/domain/rules/modality";
import type { Match, Quality, RallyEvent, Skill, TeamSide } from "@/domain/types";
import { ScoutLedger } from "@/features/scout/scout-ledger";
import { createMatch } from "@/services/match-service";
import { listMatchEvents, persistEvents } from "@/services/rally-ledger-service";

/**
 * Fase 14 — UI otimista do scout. O ledger em memória mostra o lance no mesmo toque e grava em
 * segundo plano; ao fim, o IndexedDB tem exatamente o que a tela mostrou, na ordem dos toques.
 */

let db: ScoutDB;
let match: Match;
let scope: MatchScope;

beforeEach(async () => {
  db = new ScoutDB(`scout-ledger-${crypto.randomUUID()}`);
  match = await createMatch(db, {
    tenant_id: "t1",
    modality: "beach",
    team_a: { name: "Dupla A", athlete_ids: ["a1", "a2"] },
    team_b: { name: "Dupla B", athlete_ids: ["b1", "b2"] },
    first_server: "A",
  });
  scope = { tenant_id: "t1", match_id: match.id };
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

function harness(ledger: ScoutLedger) {
  let clock = 1_700_000_000_000;
  const ctx: PlanContext = { scope, match, device_id: "tablet", newId: () => crypto.randomUUID(), now: () => ++clock };
  /** O mesmo que o `exec` de use-match-data: planeja sobre o ledger em memória e entrega à fila. */
  const exec = <T,>(plan: (d: LedgerDraft) => T): T => {
    const draft = new LedgerDraft(ledger.events, ctx);
    const result = plan(draft);
    ledger.submit(draft.added);
    return result;
  };
  const state = () => replayMatch(ledger.events, { rules: rulesFor("beach"), first_server: "A" });
  return { exec, state };
}

const SKILLS: Skill[] = ["serve", "reception", "set", "attack", "block", "dig", "freeball"];
const QUALITIES: Quality[] = ["#", "+", "!", "-", "/", "=", "?"];
const roster = (t: TeamSide) => (t === "A" ? ["a1", "a2"] : ["b1", "b2"]);

const byLedgerOrder = (a: RallyEvent, b: RallyEvent) => a.local_seq - b.local_seq || a.timestamp - b.timestamp;

describe("ScoutLedger (UI otimista)", () => {
  it("stress: 500 toques sem esperar o banco — tela atualiza no toque e o IndexedDB termina igual", async () => {
    const ledger = new ScoutLedger((events) => persistEvents(db, events), { slowWriteMs: Infinity });
    ledger.setPersisted(await listMatchEvents(db, scope));
    const { exec, state } = harness(ledger);
    const pick = createRng(14);
    const any = <T,>(xs: readonly T[]) => xs[Math.floor(pick() * xs.length)];
    const submittedOrder: string[] = [];

    for (let i = 0; i < 500; i++) {
      const before = ledger.events.length;
      const team: TeamSide = pick() < 0.5 ? "A" : "B";
      const roll = pick();
      let added = 0;
      try {
        if (roll < 0.55) {
          added = exec((d) => (planTouch(d, { team, athlete_id: any(roster(team)), skill: any(SKILLS), quality: any(QUALITIES) }), d.added.length));
        } else if (roll < 0.65) {
          added = exec((d) => (planRallyEnd(d, { point_to: team, reason: "manual" }), d.added.length));
        } else if (roll < 0.75) {
          added = exec((d) => (planUndoLastAction(d), d.added.length));
        } else if (roll < 0.85) {
          const open = state().open_rally?.touches ?? [];
          if (open.length === 0) continue;
          const option = any(detailedPointOutcomes(open, team));
          const choice = { outcome: option.id, detail: option.detail, as_attack: option.as_attack, athlete_id: option.pick ? any(roster(team)) : undefined };
          added = exec((d) => (planResolvePoint(d, resolveDetailedPoint(open, team, choice)), d.added.length));
        } else if (roll < 0.95) {
          // Modo rápido: rali inteiro num lote.
          const server = state().serving_team;
          const taps: QuickTap[] = [{ team: server, athlete_id: any(roster(server)) }];
          for (let t = 0; t < Math.floor(pick() * 4); t++) {
            const side: TeamSide = pick() < 0.5 ? "A" : "B";
            taps.push({ team: side, athlete_id: any(roster(side)) });
          }
          const option = any(pointOutcomes(taps, team));
          const { touches, end } = buildQuickRally(taps, team, { outcome: option.id, detail: option.detail, as_attack: option.as_attack });
          added = exec((d) => (planRally(d, touches, end), d.added.length));
        } else {
          added = exec((d) => (planUndoLastRally(d), d.added.length));
        }
      } catch {
        // Recusado (ex.: partida encerrada): nada pode ter entrado no ledger.
        expect(ledger.events.length).toBe(before);
        continue;
      }
      // Aparece no MESMO toque, sem nenhum await.
      expect(ledger.events.length).toBe(before + added);
      submittedOrder.push(...ledger.events.slice(before).map((e) => e.id));
    }

    expect(submittedOrder.length).toBeGreaterThan(300);
    expect(ledger.getSnapshot().unsaved).toBeGreaterThan(0); // nada esperou o banco
    await ledger.whenIdle();
    expect(ledger.getSnapshot()).toMatchObject({ unsaved: 0, error: null });

    const stored = await listMatchEvents(db, scope);
    ledger.setPersisted(stored);
    // O banco tem exatamente o que a tela mostrou, na ordem dos toques e sem posição repetida.
    expect(stored.map((e) => e.id)).toEqual(submittedOrder);
    const seqs = stored.map((e) => e.local_seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect([...ledger.events].sort(byLedgerOrder)).toEqual([...stored].sort(byLedgerOrder));
    const rules = rulesFor("beach");
    expect(replayMatch(stored, { rules, first_server: "A" })).toEqual(state());
    // Cada evento gravado entrou no outbox junto.
    expect((await db.outbox.toArray()).filter((e) => e.entity === "rally_event").length).toBe(stored.length);
  });

  it("o placar nunca 'volta': entre o fim da gravação e a releitura do banco o lance continua na tela", async () => {
    const ledger = new ScoutLedger((events) => persistEvents(db, events));
    ledger.setPersisted([]);
    const { exec } = harness(ledger);
    exec((d) => planTouch(d, { team: "A", athlete_id: "a1", skill: "serve", quality: "#" }));
    await ledger.whenIdle();
    ledger.setPersisted([]); // releitura antiga chegando atrasada
    expect(ledger.events).toHaveLength(1);
    ledger.setPersisted(await listMatchEvents(db, scope));
    expect(ledger.events).toHaveLength(1); // sem duplicar
  });

  it("falha de gravação: a fila para no lote, mantém a ordem, avisa e grava na retentativa", async () => {
    vi.useFakeTimers();
    const written: string[][] = [];
    let failures = 2;
    const ledger = new ScoutLedger(
      async (events) => {
        if (failures-- > 0) throw new Error("QuotaExceededError");
        written.push(events.map((e) => e.id));
        await persistEvents(db, events);
      },
      { retryDelaysMs: [1_000] },
    );
    ledger.setPersisted([]);
    const { exec } = harness(ledger);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = exec((d) => planTouch(d, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" }));
    const second = exec((d) => planTouch(d, { team: "B", athlete_id: "b1", skill: "reception", quality: "+" }));

    await vi.advanceTimersByTimeAsync(0);
    expect(ledger.getSnapshot()).toMatchObject({ unsaved: 2, error: "QuotaExceededError" });
    expect(ledger.events).toHaveLength(2); // nada sumiu da tela

    await vi.advanceTimersByTimeAsync(1_000); // 2ª falha
    expect(ledger.getSnapshot().error).toBe("QuotaExceededError");
    ledger.retry(); // "Tentar de novo"
    vi.useRealTimers();
    await ledger.whenIdle();

    expect(written).toEqual([[first.id], [second.id]]);
    expect(ledger.getSnapshot()).toMatchObject({ unsaved: 0, error: null });
    expect((await listMatchEvents(db, scope)).map((e) => e.id)).toEqual([first.id, second.id]);
    warn.mockRestore();
  });

  it("persistEvents é idempotente: retentativa de um lote já gravado não duplica lance nem outbox", async () => {
    const ledger = new ScoutLedger(() => Promise.resolve());
    ledger.setPersisted([]);
    const { exec } = harness(ledger);
    const { touches, end } = buildQuickRally([{ team: "A", athlete_id: "a1" }], "A", { outcome: "ace" });
    exec((d) => planRally(d, touches, end));
    const batch = ledger.events;
    await persistEvents(db, batch);
    await persistEvents(db, batch);
    expect(await db.rally_events.count()).toBe(batch.length);
    expect((await db.outbox.toArray()).filter((e) => e.entity === "rally_event").length).toBe(batch.length);
  });

  it("a gravação do lance toca só rally_events e outbox (não disputa matches/meta)", async () => {
    const spy = vi.spyOn(db, "transaction");
    const ledger = new ScoutLedger((events) => persistEvents(db, events));
    ledger.setPersisted([]);
    harness(ledger).exec((d) => planTouch(d, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" }));
    await ledger.whenIdle();
    const tables = spy.mock.calls.map((args) => args.slice(1, -1).map((t) => (t as { name: string }).name));
    expect(tables).toEqual([["rally_events", "outbox"]]);
  });
});
