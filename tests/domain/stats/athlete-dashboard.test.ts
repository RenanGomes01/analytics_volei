import { describe, expect, it } from "vitest";
import { athleteDashboard, athleteMatchSeries } from "@/domain/stats/athlete-dashboard";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import { buildFacts } from "@/domain/stats/facts";
import { drillDown, factsIn } from "@/domain/stats/drill";
import { athleteColumns } from "@/domain/stats/stat-columns";
import { ledger, matchFixture } from "../../helpers";

/** Fase 18 — painel da atleta: um jogo montado à mão, conferido rali a rali. */
function game() {
  const l = ledger("m1");
  // 1. B vira de primeira: B1 recebe, B2 levanta, B1 ataca #.
  l.rally();
  l.touch("A", "serve", { athlete_id: "A1" });
  l.touch("B", "reception", { athlete_id: "B1" });
  l.touch("B", "set", { athlete_id: "B2" });
  l.touch("B", "attack", { athlete_id: "B1", quality: "#" });
  l.end("B", "kill");
  // 2. A1 recebe e ataca no 3º toque; B devolve e erra o contra-ataque: A vence na 1ª posse.
  l.rally();
  l.touch("B", "serve", { athlete_id: "B1" });
  l.touch("A", "reception", { athlete_id: "A1" });
  l.touch("A", "set", { athlete_id: "A2" });
  l.touch("A", "attack", { athlete_id: "A1" });
  l.touch("B", "dig", { athlete_id: "B2" });
  l.touch("B", "set", { athlete_id: "B1" });
  l.touch("B", "attack", { athlete_id: "B2", quality: "=" });
  l.end("A", "error");
  // 3. B2 explora o bloqueio de A1 (block-out).
  l.rally();
  l.touch("A", "serve", { athlete_id: "A2" });
  l.touch("B", "reception", { athlete_id: "B2" });
  l.touch("B", "set", { athlete_id: "B1" });
  l.touch("B", "attack", { athlete_id: "B2", quality: "#" }).detail = "block_out";
  l.touch("A", "block", { athlete_id: "A1", quality: "-" });
  l.end("B", "kill");
  // 4. A2 recebe e A1 ataca de segunda: ponto.
  l.rally();
  l.touch("B", "serve", { athlete_id: "B2" });
  l.touch("A", "reception", { athlete_id: "A2" });
  l.touch("A", "attack", { athlete_id: "A1", quality: "#" });
  l.end("A", "kill");
  // 5. A2 erra o saque (A perde 1).
  l.rally();
  l.touch("A", "serve", { athlete_id: "A2", quality: "=" });
  l.end("B", "error");
  // 6. Ace em A1 (A perde 2 seguidos).
  l.rally();
  l.touch("B", "serve", { athlete_id: "B1" });
  l.touch("A", "reception", { athlete_id: "A1", quality: "=" });
  l.end("B", "ace");
  // 7. Sob pressão: A1 recebe e vira de primeira.
  l.rally();
  l.touch("B", "serve", { athlete_id: "B1" });
  l.touch("A", "reception", { athlete_id: "A1" });
  l.touch("A", "set", { athlete_id: "A2" });
  l.touch("A", "attack", { athlete_id: "A1", quality: "#" });
  l.end("A", "kill");
  // 8. Rali longo: B1 recebe, o primeiro ataque não decide, B vence na 2ª posse.
  l.rally();
  l.touch("A", "serve", { athlete_id: "A1" });
  l.touch("B", "reception", { athlete_id: "B1" });
  l.touch("B", "set", { athlete_id: "B2" });
  l.touch("B", "attack", { athlete_id: "B1" });
  l.touch("A", "dig", { athlete_id: "A2" });
  l.touch("A", "set", { athlete_id: "A1" });
  l.touch("A", "attack", { athlete_id: "A2" });
  l.touch("B", "dig", { athlete_id: "B2" });
  l.touch("B", "set", { athlete_id: "B1" });
  l.touch("B", "attack", { athlete_id: "B2", quality: "#" });
  l.end("B", "kill");
  return [{ match: { ...matchFixture("beach"), created_at: Date.UTC(2026, 9, 17, 15) }, events: l.events }];
}

describe("painel da atleta (Fase 18)", () => {
  const matches = game();
  const stats = aggregateCompetition(matches);
  const a1 = athleteDashboard(stats.athletes.A1);

  it("alvo do saque: recepções dela ÷ saques que chegaram à dupla", () => {
    expect(a1.serveTarget).toMatchObject({ num: 3, den: 4 });
  });

  it("identidade ofensiva: 1ª/2ª/3ª bola e participação no ataque da dupla", () => {
    expect(a1.attack).toMatchObject({ attempts: 3, first: 0, second: 1, third: 2, secondKills: 1 });
    expect(a1.attack.share).toMatchObject({ num: 3, den: 4 });
  });

  it("paredão: o block-out sobre ela conta como bloqueio explorado dela", () => {
    expect(a1.wall).toEqual({ touches: 1, points: 0, errors: 0, exploited: 1 });
    expect(stats.teams["A1|A2"].counters.blocks_exploited).toBe(1);
  });

  it("balanço: acertos (ataque + ace + bloqueio) × pontos entregues", () => {
    expect(a1.balance).toMatchObject({ hits: 2, kills: 2, aces: 0, blocks: 0, errors: 1, net: 1 });
  });

  it("virada de bola em detalhe: de primeira, sob pressão e no rali longo", () => {
    expect(a1.sideOut.total).toMatchObject({ num: 2, den: 3 });
    expect(a1.sideOut.firstBall).toMatchObject({ num: 2, den: 3 });
    expect(a1.sideOut.pressure).toMatchObject({ num: 1, den: 1 });
    expect(a1.sideOut.longRally.pct).toBeNull(); // nenhum rali voltou: "–", nunca 0%
    const b1 = athleteDashboard(stats.athletes.B1);
    expect(b1.sideOut.longRally).toMatchObject({ num: 1, den: 1 });
    expect(b1.sideOut.firstBall).toMatchObject({ num: 1, den: 2 });
  });

  it("as novas colunas de contagem fecham com o detalhamento (drill)", () => {
    const facts = buildFacts(matches);
    const cols = athleteColumns({ modality: "beach", aggregated: true }).filter((c) => ["blk_exploited"].includes(c.key));
    expect(cols).toHaveLength(1);
    for (const id of ["A1", "A2", "B1", "B2"]) {
      expect(drillDown(factsIn(facts, { athlete_id: id }), cols[0].drill!, "type").total).toBe(cols[0].value(stats.athletes[id]));
    }
  });

  it("evolução jogo a jogo: um ponto por partida, com resultado e eficiência", () => {
    const season = matches.map((m) => ({ ...m, tournament: null }));
    const [point] = athleteMatchSeries(season, "A1", new Map());
    // 3×5: o set não acabou, então ainda não há resultado (null, nunca derrota).
    expect(point).toMatchObject({ label: "17/10 × Time B", won: null, hits: 2, errors: 1, attackAttempts: 3 });
    expect(point.attackEfficiency).toBeCloseTo(2 / 3);
    expect(athleteMatchSeries(season, "Z9", new Map())).toEqual([]);
  });
});
