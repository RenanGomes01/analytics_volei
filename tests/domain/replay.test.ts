import { describe, expect, it } from "vitest";
import { phaseForTouch } from "@/domain/rally/phase";
import { activeEvents, replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES, INDOOR_RULES } from "@/domain/rules/modality";
import type { Quality, Skill, TeamSide } from "@/domain/types";
import { ledger, touches } from "../helpers";

const beach = { rules: BEACH_RULES, first_server: "A" as const };

describe("replay do ledger", () => {
  it("placar e sacador: quem vence o rali saca o próximo", () => {
    const l = ledger().point("A", "A").point("A", "B").point("B", "B");
    const state = replayMatch(l.events, beach);
    expect(state.sets[0].score).toEqual({ A: 1, B: 2 });
    expect(state.serving_team).toBe("B");
    expect(state.rallies.map((r) => r.serving_team)).toEqual(["A", "A", "B"]);
    expect(state.open_rally).toBeNull();
  });

  it("é determinístico e independe da ordem de leitura do banco", () => {
    const l = ledger().point("A", "B").point("B", "B").point("B", "A");
    const shuffled = [...l.events].reverse();
    expect(replayMatch(shuffled, beach)).toEqual(replayMatch(l.events, beach));
  });

  it("BEACH: 4 toques após o bloqueio encerram o rali com ponto para o adversário", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception");
    l.touch("B", "set");
    l.touch("B", "attack");
    l.touch("A", "block");
    l.touch("A", "dig");
    l.touch("A", "set");
    l.touch("A", "attack"); // 4º toque de A (bloqueio contou)
    const state = replayMatch(l.events, beach);
    expect(state.rallies[0]).toMatchObject({ point_to: "B", reason: "four_touches" });
    expect(state.sets[0].score).toEqual({ A: 0, B: 1 });
  });

  it("um VoidEvent anula um toque e muda o resultado da contagem", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception");
    const extra = l.touch("B", "freeball"); // lançado por engano
    l.touch("B", "set");
    l.touch("B", "attack");
    expect(replayMatch(l.events, beach).rallies[0].point_to).toBe("A");

    l.void(extra.id);
    const state = replayMatch(l.events, beach);
    expect(state.rallies[0].touch_count.violation).toBeUndefined();
    expect(state.open_rally?.rally_id).toBe("r1");
    expect(activeEvents(l.events).map((e) => e.id)).not.toContain(extra.id);
  });

  it("anular o rally_end reabre o rali e devolve o ponto", () => {
    const l = ledger().point("A", "A");
    l.void(l.events.at(-1)!.id);
    const state = replayMatch(l.events, beach);
    expect(state.sets[0].score).toEqual({ A: 0, B: 0 });
    expect(state.open_rally?.rally_id).toBe("r1");
  });

  it("BEACH: set a 21 com 2 de vantagem, troca de sacador inicial e jogo em 2 sets", () => {
    const l = ledger();
    for (let i = 0; i < 20; i++) l.point("A", "A").point("A", "B");
    expect(replayMatch(l.events, beach).sets[0]).toMatchObject({ score: { A: 20, B: 20 }, winner: null });

    l.point("B", "A").point("A", "A"); // 22 × 20
    let state = replayMatch(l.events, beach);
    expect(state.sets[0]).toMatchObject({ score: { A: 22, B: 20 }, winner: "A" });
    expect(state).toMatchObject({ current_set: 2, serving_team: "B", sets_won: { A: 1, B: 0 } });

    for (let i = 0; i < 21; i++) l.point("A", "A");
    state = replayMatch(l.events, beach);
    expect(state.winner).toBe("A");
    expect(state.sets.map((s) => s.score)).toEqual([{ A: 22, B: 20 }, { A: 21, B: 0 }]);
  });

  it("INDOOR: set termina em 25", () => {
    const l = ledger();
    for (let i = 0; i < 25; i++) l.point("A", "A");
    const state = replayMatch(l.events, { rules: INDOOR_RULES, first_server: "A" });
    expect(state.sets[0]).toMatchObject({ score: { A: 25, B: 0 }, winner: "A" });
    expect(state.winner).toBeNull();
  });
});

describe("fase do toque (side-out × contra-ataque)", () => {
  it("primeira posse da equipe que recebe é side-out; o resto é contra-ataque", () => {
    const rally = touches(["A", "serve"], ["B", "reception"], ["B", "set"], ["B", "attack"], ["A", "dig"]);
    expect(phaseForTouch(rally.slice(0, 1), "B", "A", BEACH_RULES)).toBe("side_out"); // recepção
    expect(phaseForTouch(rally.slice(0, 3), "B", "A", BEACH_RULES)).toBe("side_out"); // ataque de K1
    expect(phaseForTouch(rally.slice(0, 4), "A", "A", BEACH_RULES)).toBe("counter_attack"); // defesa de A
    expect(phaseForTouch(rally, "B", "A", BEACH_RULES)).toBe("counter_attack"); // 2ª posse de B
  });
});

describe("ponto implícito pela qualidade terminal", () => {
  const rallyWith = (...seq: (readonly [TeamSide, Skill, Quality])[]) => {
    const l = ledger().rally();
    for (const [team, skill, quality] of seq) l.touch(team, skill, { quality });
    return l;
  };

  it.each([
    ["saque #: ace do sacador", [["A", "serve", "#"]], "A", "ace"],
    ["saque =: erro, ponto do receptor", [["A", "serve", "="]], "B", "error"],
    ["ataque #: kill", [["A", "serve", "+"], ["B", "reception", "+"], ["B", "set", "+"], ["B", "attack", "#"]], "B", "kill"],
    ["bloqueio #: ponto de bloqueio", [["A", "serve", "+"], ["B", "reception", "+"], ["B", "attack", "+"], ["A", "block", "#"]], "A", "kill"],
    ["recepção = logo após o saque: ace de quem sacou", [["A", "serve", "+"], ["B", "reception", "="]], "A", "ace"],
    ["recepção = de bola de graça: erro, não ace", [["A", "serve", "+"], ["B", "reception", "+"], ["B", "freeball", "+"], ["A", "reception", "="]], "B", "error"],
  ] as const)("%s", (_, seq, point_to, reason) => {
    const state = replayMatch(rallyWith(...seq).events, beach);
    expect(state.rallies[0]).toMatchObject({ point_to, reason });
    expect(state.open_rally).toBeNull();
    expect(state.serving_team).toBe(point_to);
  });

  it("rally_end manual tem precedência sobre a recepção = (ace)", () => {
    const l = rallyWith(["A", "serve", "+"], ["B", "reception", "="]);
    l.end("B", "manual"); // arbitragem: falta de quem sacou
    expect(replayMatch(l.events, beach).rallies[0]).toMatchObject({ point_to: "B", reason: "manual" });
  });

  it("levantamento # não encerra o rali", () => {
    const state = replayMatch(rallyWith(["A", "serve", "+"], ["B", "reception", "#"], ["B", "set", "#"]).events, beach);
    expect(state.open_rally?.point_to).toBeNull();
  });

  it("rally_end explícito tem precedência sobre a qualidade terminal", () => {
    const l = rallyWith(["A", "serve", "#"]);
    l.end("B", "manual"); // ex.: arbitragem marcou falta de pé no saque
    expect(replayMatch(l.events, beach).rallies[0]).toMatchObject({ point_to: "B", reason: "manual" });
  });

  it("violação de 4 toques tem precedência sobre um ataque #", () => {
    const l = rallyWith(["A", "serve", "+"], ["B", "reception", "+"], ["B", "dig", "+"], ["B", "set", "+"], ["B", "attack", "#"]);
    expect(replayMatch(l.events, beach).rallies[0]).toMatchObject({ point_to: "A", reason: "four_touches" });
  });

  it("anular o toque terminal reabre o rali e devolve o ponto", () => {
    const l = rallyWith(["A", "serve", "+"], ["B", "reception", "+"], ["B", "attack", "#"]);
    l.void(l.events.at(-1)!.id);
    const state = replayMatch(l.events, beach);
    expect(state.sets[0].score).toEqual({ A: 0, B: 0 });
    expect(state.open_rally?.touches).toHaveLength(2);
  });
});
