import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detailedPointOutcomes, resolveDetailedPoint, type OpenTouch } from "@/domain/rally/resolve-detailed-point";
import { activeEvents } from "@/domain/rally/replay";
import { BEACH_RULES } from "@/domain/rules/modality";
import { computeBoxScore } from "@/domain/stats/box-score";
import { validateExportData } from "@/domain/export/validate-export-data";
import type { Quality, Skill, TeamSide, TouchEvent } from "@/domain/types";
import { ScoutDB } from "@/db/schema";
import { createMatch } from "@/services/match-service";
import { appendTouch, getMatchState, listMatchEvents, resolvePoint, undoLastAction, type MatchScope } from "@/services/rally-ledger-service";

/**
 * Modo detalhado: "Ponto X" com o rali aberto pergunta "Como foi o ponto?". O levantamento que caiu
 * do outro lado vira bola de segunda (ataque # da levantadora), sem alterar nada do ledger.
 */

const t = (id: string, athlete_id: string, skill: Skill, quality: Quality = "+"): OpenTouch => ({ id, team: athlete_id[0] as TeamSide, athlete_id, skill, quality });

describe("resolveDetailedPoint (puro)", () => {
  const rally = [t("e1", "A1", "serve"), t("e2", "B1", "reception"), t("e3", "B2", "set")];

  it("levantamento + ponto da mesma equipe: a 1ª opção é bola de segunda, que vira ataque # da levantadora", () => {
    const options = detailedPointOutcomes(rally, "B");
    expect(options[0]).toMatchObject({ id: "kill", label: "Bola de segunda (ponto)" });
    expect(options.at(-1)?.id).toBe("unseen");

    const plan = resolveDetailedPoint(rally, "B", { outcome: "kill" });
    expect(plan.void_ids).toEqual(["e3"]);
    expect(plan.touches).toEqual([{ team: "B", athlete_id: "B2", skill: "attack", quality: "#", replaces_event_id: "e3" }]);
    expect(plan.end).toEqual({ point_to: "B", reason: "kill" });
  });

  it("levantamento + ponto do adversário: bola de segunda fora / na rede / bloqueada", () => {
    expect(detailedPointOutcomes(rally, "A").slice(0, 3).map((o) => o.label)).toEqual([
      "Bola de segunda fora",
      "Bola de segunda na rede",
      "Bola de segunda bloqueada →",
    ]);
    const plan = resolveDetailedPoint(rally, "A", { outcome: "attack_error", detail: "net", as_attack: true });
    expect(plan.touches).toEqual([{ team: "B", athlete_id: "B2", skill: "attack", quality: "=", detail: "net", replaces_event_id: "e3" }]);
    expect(plan.end).toEqual({ point_to: "A", reason: "error", detail: "net" });
  });

  it("bloqueada: regrava o levantamento como ataque e acrescenta a bloqueadora (toque novo, sem substituição)", () => {
    const plan = resolveDetailedPoint(rally, "A", { outcome: "blocked", detail: "blocked", athlete_id: "A2", as_attack: true });
    expect(plan.void_ids).toEqual(["e3"]);
    expect(plan.touches.map((x) => [x.athlete_id, x.skill, x.quality, x.replaces_event_id])).toEqual([
      ["B2", "attack", "+", "e3"],
      ["A2", "block", "#", undefined],
    ]);
  });

  it("'Não vi como foi' só fecha o rali, sem tocar nos lances", () => {
    expect(resolveDetailedPoint(rally, "A", { outcome: "unseen" })).toEqual({ void_ids: [], touches: [], end: { point_to: "A", reason: "manual" } });
  });

  it("mudança no penúltimo toque regrava o trecho final inteiro, na ordem", () => {
    const attacked = [t("e1", "A1", "serve"), t("e2", "B1", "reception"), t("e3", "B2", "set"), t("e4", "B1", "attack", "!"), t("e5", "A2", "dig", "-")];
    const plan = resolveDetailedPoint(attacked, "B", { outcome: "kill_through_defense" });
    expect(plan.void_ids).toEqual(["e4", "e5"]);
    expect(plan.touches.map((x) => `${x.athlete_id}:${x.skill}${x.quality}<${x.replaces_event_id}`)).toEqual(["B1:attack#<e4", "A2:dig=<e5"]);
  });

  it("nunca é beco sem saída: todo último toque de qualquer fundamento tem opções além de 'Não vi'", () => {
    const skills: Skill[] = ["serve", "reception", "set", "attack", "block", "dig", "freeball"];
    for (const skill of skills)
      for (const team of ["A", "B"] as TeamSide[])
        for (const winner of ["A", "B"] as TeamSide[]) {
          const o = detailedPointOutcomes([t("e1", "A1", "serve"), { ...t("e2", `${team}1`, skill) }], winner);
          expect(o.at(-1)?.id).toBe("unseen");
          expect(o.length, `${team}:${skill} → ${winner}`).toBeGreaterThan(1);
        }
  });
});

describe("resolvePoint + Desfazer (ledger)", () => {
  let db: ScoutDB;
  let scope: MatchScope;

  beforeEach(async () => {
    db = new ScoutDB(`test-${crypto.randomUUID()}`);
    const match = await createMatch(db, {
      tenant_id: "t1",
      modality: "beach",
      team_a: { name: "Dupla A", athlete_ids: ["A1", "A2"] },
      team_b: { name: "Dupla B", athlete_ids: ["B1", "B2"] },
      first_server: "A",
    });
    scope = { tenant_id: "t1", match_id: match.id };
  });

  afterEach(async () => {
    await db.delete();
  });

  async function openRally() {
    await appendTouch(db, scope, { team: "A", athlete_id: "A1", skill: "serve", quality: "+" });
    await appendTouch(db, scope, { team: "B", athlete_id: "B1", skill: "reception", quality: "+" });
    await appendTouch(db, scope, { team: "B", athlete_id: "B2", skill: "set", quality: "+" });
    return (await getMatchState(db, scope)).open_rally!.touches;
  }

  const box = async () =>
    computeBoxScore(await listMatchEvents(db, scope), { rules: BEACH_RULES, first_server: "A", roster: { A: ["A1", "A2"], B: ["B1", "B2"] } });

  it("bola de segunda: anula o levantamento, grava o ataque # e o ponto; a levantadora ganha o ponto de ataque (2ª)", async () => {
    const open = await openRally();
    await resolvePoint(db, scope, resolveDetailedPoint(open, "B", { outcome: "kill" }));

    const state = await getMatchState(db, scope);
    expect(state.sets[0].score).toEqual({ A: 0, B: 1 });
    expect(state.open_rally).toBeNull();
    const touches = state.rallies[0].touches.map((x) => `${x.athlete_id}:${x.skill}${x.quality}`);
    expect(touches).toEqual(["A1:serve+", "B1:reception+", "B2:attack#"]);

    const events = await listMatchEvents(db, scope);
    expect(events.filter((e) => e.kind === "void")).toHaveLength(1); // nada apagado: o levantamento só foi anulado
    const s = await box();
    const b2 = s.athletes.B2;
    expect(b2.attack.kills).toBe(1);
    expect(b2.attack.second_ball).toEqual({ attempts: 1, kills: 1 });
    expect(s.teams.B.points.total).toBe(state.sets[0].score.B);
    const athletes = ["A1", "A2", "B1", "B2"].map((id) => ({ id, name: id }));
    expect(validateExportData({ match: (await db.matches.get(scope.match_id))!, athletes, events })).toEqual([]);
  });

  it("Desfazer volta exatamente ao rali de antes do 'Ponto' (levantamento original regravado)", async () => {
    const open = await openRally();
    await resolvePoint(db, scope, resolveDetailedPoint(open, "A", { outcome: "blocked", detail: "blocked", athlete_id: "A2", as_attack: true }));
    expect((await getMatchState(db, scope)).sets[0].score).toEqual({ A: 1, B: 0 });

    await undoLastAction(db, scope);
    const state = await getMatchState(db, scope);
    expect(state.sets[0].score).toEqual({ A: 0, B: 0 });
    const back = state.open_rally!.touches.map((x) => `${x.athlete_id}:${x.skill}${x.quality}`);
    expect(back).toEqual(["A1:serve+", "B1:reception+", "B2:set+"]);
    expect(state.open_rally!.touches.every((x: TouchEvent) => !x.via_point && !x.replaces_event_id)).toBe(true);
    // E dá para marcar de novo.
    await resolvePoint(db, scope, resolveDetailedPoint(state.open_rally!.touches, "B", { outcome: "kill" }));
    expect((await getMatchState(db, scope)).sets[0].score).toEqual({ A: 0, B: 1 });
  });

  it("Desfazer de um ponto comum continua anulando só o fim do rali", async () => {
    const open = await openRally();
    await resolvePoint(db, scope, resolveDetailedPoint(open, "B", { outcome: "unseen" }));
    await undoLastAction(db, scope);
    const active = activeEvents(await listMatchEvents(db, scope));
    expect(active.map((e) => e.kind)).toEqual(["touch", "touch", "touch"]);
  });

  it("plano velho (rali mudou entre abrir o sheet e escolher) é recusado sem gravar nada", async () => {
    const open = await openRally();
    const plan = resolveDetailedPoint(open, "B", { outcome: "kill" });
    await undoLastAction(db, scope); // anula o levantamento
    const before = await db.rally_events.count();
    await expect(resolvePoint(db, scope, plan)).rejects.toThrow(/rali mudou/);
    expect(await db.rally_events.count()).toBe(before);
  });
});
