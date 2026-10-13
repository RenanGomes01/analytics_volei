import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuickRally, inferSkills, pointOutcomes, tapsFromTouches, type QuickChoice, type QuickTap } from "@/domain/rally/quick-rally";
import { BEACH_RULES } from "@/domain/rules/modality";
import { computeBoxScore } from "@/domain/stats/box-score";
import type { TeamSide } from "@/domain/types";
import { ScoutDB } from "@/db/schema";
import { createMatch } from "@/services/match-service";
import { appendRally, getMatchState, listMatchEvents, undoLastRally, type MatchScope } from "@/services/rally-ledger-service";

const tap = (id: string, block = false): QuickTap => ({ team: id[0] as TeamSide, athlete_id: id, ...(block ? { block } : {}) });
const taps = (...ids: string[]) => ids.map((id) => (id.endsWith("*") ? tap(id.slice(0, -1), true) : tap(id)));
const skills = (t: QuickTap[]) => inferSkills(t).map((x) => `${x.athlete_id}:${x.skill}`);

describe("inferSkills — fundamentos deduzidos pela sequência", () => {
  it("rali clássico de virada de bola e contra-ataque", () => {
    expect(skills(taps("A1", "B1", "B2", "B1", "A2", "A1", "A2"))).toEqual([
      "A1:serve",
      "B1:reception",
      "B2:set",
      "B1:attack",
      "A2:dig",
      "A1:set",
      "A2:attack",
    ]);
  });

  it("ataque de segunda: posse de 2 toques que cruzou termina em ataque", () => {
    expect(skills(taps("A1", "B1", "B2", "A1"))).toEqual(["A1:serve", "B1:reception", "B2:attack", "A1:dig"]);
  });

  it("posse final em andamento: 2 toques = passe + levantamento; 3 toques = … + ataque", () => {
    expect(skills(taps("A1", "B1", "B2"))).toEqual(["A1:serve", "B1:reception", "B2:set"]);
    expect(skills(taps("A1", "B1", "B2", "B1"))).toEqual(["A1:serve", "B1:reception", "B2:set", "B1:attack"]);
  });

  it("bloqueio marcado pelo analista; passe que voltou direto continua sendo passe", () => {
    expect(skills(taps("A1", "B1", "B2", "B1", "A2*", "A1"))).toEqual([
      "A1:serve", "B1:reception", "B2:set", "B1:attack", "A2:block", "A1:set",
    ]);
    expect(skills(taps("A1", "B1", "A2"))).toEqual(["A1:serve", "B1:reception", "A2:dig"]);
  });

  it("toques ficam 'não avaliados' (?) até o ponto", () => {
    expect(inferSkills(taps("A1", "B1")).every((t) => t.quality === "?")).toBe(true);
  });
});

describe("pointOutcomes — 'como foi o ponto?' (vôlei de praia)", () => {
  const opts = (t: QuickTap[], w: TeamSide) => pointOutcomes(t, w).map((o) => (o.detail ? `${o.id}:${o.detail}` : o.id));
  it.each([
    [["A1"], "A", ["ace"]],
    [["A1"], "B", ["serve_error:out", "serve_error:net"]],
    [["A1", "B1"], "A", ["reception_error"]],
    [["A1", "B1", "B2", "B1"], "B", ["kill", "kill:shot", "kill:block_out"]],
    [["A1", "B1", "B2", "B1"], "A", ["attack_error:out", "attack_error:net", "blocked:blocked"]],
    [["A1", "B1", "B2", "B1", "A2"], "B", ["kill_through_defense", "dig_error"]],
    [["A1", "B1", "B2", "B1", "A2*"], "A", ["block_point"]],
    [["A1", "B1", "B2", "B1", "A2*"], "B", ["block_error:out", "block_error:net"]],
    [["A1", "B1", "B2"], "A", ["ball_error:double", "ball_error:lift", "ball_error:out"]],
    [[], "A", []],
  ] as [string[], TeamSide, string[]][])("%j, ponto %s → %j", (seq, winner, expected) => {
    expect(opts(taps(...seq), winner)).toEqual(expected);
  });

  it("'Bloqueado' pede o bloqueador (um toque a mais)", () => {
    expect(pointOutcomes(taps("A1", "B1", "B2", "B1"), "A").find((o) => o.id === "blocked")).toMatchObject({ pick: "blocker" });
  });
});

describe("buildQuickRally — o ponto define a qualidade e o crédito estatístico", () => {
  const box = (t: QuickTap[], w: TeamSide, o: QuickChoice) => {
    const { touches, end } = buildQuickRally(t, w, o);
    let seq = 0;
    const base = { tenant_id: "t", match_id: "m", set_id: "m:s1", set_number: 1, rally_id: "r", rally_number: 1, device_id: "d" };
    const events = [
      ...touches.map((x) => ({ ...base, ...x, id: `e${seq}`, local_seq: ++seq, timestamp: seq, kind: "touch" as const, phase: "side_out" as const })),
      { ...base, ...end, id: "end", local_seq: ++seq, timestamp: seq, kind: "rally_end" as const },
    ];
    return computeBoxScore(events, { rules: BEACH_RULES, first_server: "A", roster: { A: ["A1", "A2"], B: ["B1", "B2"] } });
  };

  it("ponto de ataque: PA para quem atacou; ataque de segunda vira ataque", () => {
    const b = box(taps("A1", "B1", "B2"), "B", { outcome: "kill" }); // B2 atacou de segunda
    expect(b.athletes.B2.attack).toMatchObject({ attempts: 1, kills: 1 });
    expect(b.teams.B.points).toMatchObject({ total: 1, kills: 1 });
  });

  it("ponto de ataque com defesa que não segurou: PA do atacante, erro de defesa do outro lado", () => {
    const b = box(taps("A1", "B1", "B2", "B1", "A2"), "B", { outcome: "kill_through_defense" });
    expect(b.athletes.B1.attack.kills).toBe(1);
    expect(b.athletes.A2).toMatchObject({ errors: 1, digs: 0 });
    expect(b.teams.B.points.kills).toBe(1);
  });

  it("ace por passe que não segurou: ace para quem sacou", () => {
    const b = box(taps("A1", "B1"), "A", { outcome: "reception_error" });
    expect(b.athletes.A1.serve.aces).toBe(1);
    expect(b.teams.A.points.aces).toBe(1);
  });

  it("ponto de bloqueio, erro de saque e falta", () => {
    expect(box(taps("A1", "B1", "B2", "B1", "A2*"), "A", { outcome: "block_point" }).athletes.A2.blocks).toBe(1);
    expect(box(taps("A1"), "B", { outcome: "serve_error" }).athletes.A1.serve.errors).toBe(1);
    expect(box(taps("A1", "B1"), "B", { outcome: "fault" }).teams.B.points.opponent_errors).toBe(1);
  });

  it("bloqueado: ponto de bloqueio para quem bloqueou e erro para quem atacou", () => {
    const b = box(taps("A1", "B1", "B2", "B1"), "A", { outcome: "blocked", detail: "blocked", athlete_id: "A2" });
    expect(b.athletes.A2.blocks).toBe(1);
    expect(b.athletes.B1.attack).toMatchObject({ attempts: 1, errors: 1 });
    expect(b.teams.A.points).toMatchObject({ total: 1, blocks: 1 });
    expect(() => buildQuickRally(taps("A1", "B1", "B2", "B1"), "A", { outcome: "blocked" })).toThrow(/quem bloqueou/);
  });

  it("falta com atleta: lance 'falta =' dela com o detalhe; sem atleta: só o fim do rali", () => {
    const withWho = buildQuickRally(taps("A1", "B1", "B2"), "A", { outcome: "fault", detail: "net_touch", athlete_id: "B2" });
    expect(withWho.touches.at(-1)).toEqual({ team: "B", athlete_id: "B2", skill: "fault", quality: "=", detail: "net_touch" });
    expect(withWho.end).toEqual({ point_to: "A", reason: "error", detail: "net_touch" });
    expect(box(taps("A1", "B1", "B2"), "A", { outcome: "fault", detail: "net_touch", athlete_id: "B2" }).athletes.B2.errors).toBe(1);

    const unknown = buildQuickRally(taps("A1", "B1"), "A", { outcome: "fault", detail: "invasion" });
    expect(unknown.end).toEqual({ point_to: "A", reason: "manual", detail: "invasion" });
    expect(unknown.touches).toHaveLength(2);
  });

  it("o detalhe vai para o lance final (ex.: dois toques no levantamento)", () => {
    const r = buildQuickRally(taps("A1", "B1", "B2"), "A", { outcome: "ball_error", detail: "double" });
    expect(r.touches.at(-1)).toMatchObject({ skill: "set", quality: "=", detail: "double" });
  });

  it("desfazer: a falta não volta como toque; o bloqueio volta marcado", () => {
    const fault = buildQuickRally(taps("A1", "B1"), "A", { outcome: "fault", detail: "net_touch", athlete_id: "B2" });
    expect(tapsFromTouches(fault.touches)).toEqual(taps("A1", "B1"));
    const blocked = buildQuickRally(taps("A1", "B1", "B2", "B1"), "A", { outcome: "blocked", athlete_id: "A2" });
    expect(tapsFromTouches(blocked.touches)).toEqual(taps("A1", "B1", "B2", "B1", "A2*"));
  });

  it("recepções '?' ficam fora da % de passe na mão", () => {
    const b = box(taps("A1", "B1", "B2", "B1"), "B", { outcome: "kill" });
    expect(b.athletes.B1.reception).toEqual({ attempts: 1, positive: { num: 0, den: 0, pct: null }, errors: 0 });
  });

  it("tapsFromTouches devolve os toques (com bloqueio) para corrigir o ponto", () => {
    const t = taps("A1", "B1", "B2", "B1", "A2*");
    expect(tapsFromTouches(inferSkills(t))).toEqual(t);
  });
});

describe("appendRally / undoLastRally (ledger)", () => {
  let db: ScoutDB;
  let scope: MatchScope;
  beforeEach(async () => {
    db = new ScoutDB(`quick-${crypto.randomUUID()}`);
    const m = await createMatch(db, { tenant_id: "t", modality: "beach", team_a: { name: "A", athlete_ids: ["A1", "A2"] }, team_b: { name: "B", athlete_ids: ["B1", "B2"] }, first_server: "A" });
    scope = { tenant_id: "t", match_id: m.id };
  });
  afterEach(async () => {
    await db.delete();
  });

  it("grava o rali inteiro numa transação, com fase e ordem, e o placar anda", async () => {
    const { touches, end } = buildQuickRally(taps("A1", "B1", "B2", "B1"), "B", { outcome: "kill" });
    await appendRally(db, scope, touches, end);
    const events = await listMatchEvents(db, scope);
    expect(events.map((e) => e.local_seq)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(events.map((e) => e.rally_id)).size).toBe(1);
    expect(events.filter((e) => e.kind === "touch").map((e) => e.kind === "touch" && e.phase)).toEqual(["counter_attack", "side_out", "side_out", "side_out"]);
    const state = await getMatchState(db, scope);
    expect(state.sets[0].score).toEqual({ A: 0, B: 1 });
    expect(state.serving_team).toBe("B");
    expect(await db.outbox.count()).toBe(6); // partida + 5 eventos
  });

  it("é atômico: falha no meio não grava nada", async () => {
    vi.spyOn(db.outbox, "add").mockResolvedValueOnce("ok").mockRejectedValueOnce(new Error("falhou"));
    const { touches, end } = buildQuickRally(taps("A1", "B1"), "A", { outcome: "reception_error" });
    await expect(appendRally(db, scope, touches, end)).rejects.toThrow("falhou");
    expect(await db.rally_events.count()).toBe(0);
  });

  it("desfazer o ponto anula o rali inteiro e devolve os toques para corrigir", async () => {
    const t = taps("A1", "B1", "B2", "B1");
    const { touches, end } = buildQuickRally(t, "B", { outcome: "kill" });
    await appendRally(db, scope, touches, end);

    const back = await undoLastRally(db, scope);
    expect(tapsFromTouches(back)).toEqual(t);
    expect((await getMatchState(db, scope)).sets[0].score).toEqual({ A: 0, B: 0 });
    expect((await getMatchState(db, scope)).open_rally).toBeNull();
    expect(await db.rally_events.count()).toBe(10); // 5 eventos + 5 anulações: nada apagado
    expect(await undoLastRally(db, scope)).toEqual([]);
  });
});
