import { describe, expect, it } from "vitest";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES } from "@/domain/rules/modality";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import { drillDown, factsIn } from "@/domain/stats/drill";
import { attackLabel, errorLabel } from "@/domain/stats/fact-labels";
import { buildFacts } from "@/domain/stats/facts";
import { pointSources } from "@/domain/stats/point-sources";
import { tournamentReport } from "@/domain/stats/report";
import { athleteColumns, teamColumns } from "@/domain/stats/stat-columns";
import type { Athlete, Match, PointDetail, Quality, RallyEvent, Skill, TeamSide } from "@/domain/types";
import { ledger, matchFixture } from "../../helpers";

/** Fase 15 — motor de fatos, drill-down e relatório. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKILLS: Skill[] = ["reception", "set", "attack", "block", "dig", "freeball", "fault"];
const QUALITIES: Quality[] = ["#", "+", "!", "-", "/", "="];
const DETAILS: (PointDetail | undefined)[] = [undefined, undefined, "shot", "block_out", "out", "net", "net_touch"];

/** Ledger aleatório com detalhes de lance e fases K1/K2 variadas. */
function randomMatch(seed: number, rallies: number, id = `m${seed}`): { match: Match; events: RallyEvent[] } {
  const random = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const team = (): TeamSide => (random() < 0.5 ? "A" : "B");
  const l = ledger(id);
  for (let r = 0; r < rallies; r++) {
    l.rally();
    const server = team();
    l.touch(server, "serve", { athlete_id: `${server}${1 + Math.floor(random() * 2)}`, quality: pick(QUALITIES) });
    for (let i = 0; i < Math.floor(random() * 7); i++) {
      const t = team();
      l.touch(t, pick(SKILLS), { athlete_id: `${t}${1 + Math.floor(random() * 2)}`, quality: pick([...QUALITIES, "?"] as Quality[]) });
    }
    if (random() < 0.15) l.end(team(), "manual");
    if (random() < 0.1) l.void(pick(l.events).id);
  }
  for (const e of l.events) {
    if (e.kind !== "touch") continue;
    const d = pick(DETAILS);
    if (d) e.detail = d;
    if (random() < 0.5) e.phase = "side_out";
  }
  return { match: { ...matchFixture("beach"), id }, events: l.events };
}

describe("drill-down = número da tabela (ledgers aleatórios)", () => {
  it.each([1, 7, 42, 2026])("semente %i: toda coluna de contagem fecha com a soma do detalhamento", (seed) => {
    const matches = [randomMatch(seed, 150), randomMatch(seed + 1000, 90, "outra")];
    const stats = aggregateCompetition(matches);
    const facts = buildFacts(matches);
    const cols = athleteColumns({ modality: "beach", aggregated: true }).filter((c) => c.drill && c.format === "count");
    expect(cols.length).toBeGreaterThan(20);
    for (const a of Object.values(stats.athletes)) {
      const mine = factsIn(facts, { athlete_id: a.athlete_id });
      for (const col of cols) {
        expect(drillDown(mine, col.drill!, "type").total, `${a.athlete_id} · ${col.key}`).toBe(col.value(a));
        // Qualquer dimensão soma o mesmo total.
        const bySet = drillDown(mine, col.drill!, "set");
        expect(bySet.rows.reduce((s, r) => s + r.count, 0)).toBe(col.value(a));
      }
    }
    const teamCols = teamColumns({ modality: "beach" }).filter((c) => c.drill && c.format === "count");
    for (const t of Object.values(stats.teams)) {
      const mine = factsIn(facts, { pair_key: t.pair_key });
      for (const col of teamCols) expect(drillDown(mine, col.drill!, "moment").total, `${t.pair_key} · ${col.key}`).toBe(col.value(t));
    }
  });

  it("origem dos pontos: a soma das fontes é o placar de cada dupla e os pontos de cada atleta", () => {
    const matches = [randomMatch(5, 200)];
    const stats = aggregateCompetition(matches);
    const state = replayMatch(matches[0].events, { rules: BEACH_RULES, first_server: "A" });
    const score = (side: TeamSide) => state.sets.reduce((s, set) => s + set.score[side], 0);
    for (const side of ["A", "B"] as const) {
      const key = side === "A" ? "A1|A2" : "B1|B2";
      expect(pointSources(stats.teams[key].points).total).toBe(score(side));
    }
    for (const a of Object.values(stats.athletes)) {
      const ps = pointSources({ kills: a.attack.kills, aces: a.serve.aces, blocks: a.blocks });
      expect(ps.total).toBe(a.points);
      if (a.points > 0) expect(ps.dominant).not.toBeNull();
    }
  });
});

describe("rótulos: tipo de ataque × toque na posse", () => {
  const f = (skill: Skill, touch: number, detail?: PointDetail, delta = {}) =>
    ({ skill, touch_in_possession: touch, detail, delta, quality: "#" as Quality });

  it("cruza largada/ataque com o nº do toque", () => {
    expect(attackLabel(f("attack", 2, "shot"))).toBe("Largada de segunda");
    expect(attackLabel(f("attack", 2))).toBe("Ataque de segunda");
    expect(attackLabel(f("attack", 3))).toBe("Ataque (3º toque)");
    expect(attackLabel(f("attack", 1))).toBe("Ataque de primeira");
    expect(attackLabel(f("attack", 3, "shot"))).toBe("Largada (3º toque)");
  });

  it("onde foi o erro", () => {
    expect(errorLabel(f("serve", 1, "net"))).toBe("Saque na rede");
    expect(errorLabel(f("serve", 1, "out"))).toBe("Saque fora");
    expect(errorLabel(f("attack", 3, undefined, { attack_blocked: 1 }))).toBe("Ataque bloqueado no 3º toque");
    expect(errorLabel(f("fault", 1, "net_touch"))).toBe("Falta: toque na rede");
  });
});

describe("micro-métricas em cenários fixos", () => {
  it("pressão do saque, alvo do saque, K1×K2 e bloqueio explorado", () => {
    const l = ledger("fix");
    // Rali 1: A1 saca, B1 recebe mal (-), B2 ataca de 3º toque no K1 e erra fora.
    l.rally();
    l.touch("A", "serve", { athlete_id: "A1" });
    l.touch("B", "reception", { athlete_id: "B1", quality: "-" });
    l.touch("B", "set", { athlete_id: "B2" });
    const atk = l.touch("B", "attack", { athlete_id: "B1", quality: "=" });
    atk.detail = "out";
    atk.phase = "side_out";
    // Rali 2: A1 saca de novo, B1 recebe bem (#), B2 ataca explorando o bloqueio de A2 e faz o ponto.
    l.rally();
    l.touch("A", "serve", { athlete_id: "A1" });
    l.touch("B", "reception", { athlete_id: "B1", quality: "#" });
    const kill = l.touch("B", "attack", { athlete_id: "B2", quality: "#" });
    kill.detail = "block_out";
    kill.phase = "side_out";
    l.end("B", "kill");
    const stats = aggregateCompetition([{ match: { ...matchFixture("beach"), id: "fix" }, events: l.events }]);

    const a1 = stats.athletes.A1.counters;
    expect([a1.serve_pressure_forced, a1.serve_pressure_rated]).toEqual([1, 2]);
    expect(a1.serve_won).toBe(1); // rali 1: o erro de B deu o ponto ao saque de A1
    const b1 = stats.athletes.B1;
    expect([b1.reception.attempts, b1.counters.serves_faced]).toEqual([2, 2]); // B1 foi alvo dos 2 saques
    expect(stats.athletes.B2.counters.serves_faced).toBe(2);
    expect(b1.counters.attack_third).toBe(1);
    expect(b1.counters.attack_k1_errors).toBe(1);
    expect(b1.counters.points_given).toBe(1);
    expect(stats.athletes.B2.counters.attack_block_out_kills).toBe(1);
    expect(stats.teams["A1|A2"].counters.blocks_exploited).toBe(1);
    expect(stats.athletes.B2.counters.attack_first).toBe(0);
    expect(stats.athletes.B2.attack.second_ball.attempts).toBe(1);
  });
});

describe("relatório de torneio", () => {
  const people = (entries: [string, "F" | "M" | undefined][]) =>
    new Map<string, Athlete>(entries.map(([id, gender]) => [id, { id, tenant_id: "t1", name: id, created_at: 0, ...(gender ? { gender } : {}) }]));

  it("separa por gênero, dá prêmios só com volume mínimo e acha a maior fonte de erros", () => {
    const fem = randomMatch(11, 180, "fem");
    const masc = { ...randomMatch(12, 180, "masc") };
    masc.match = { ...masc.match, team_a: { name: "M1", athlete_ids: ["C1", "C2"] }, team_b: { name: "M2", athlete_ids: ["D1", "D2"] } };
    masc.events = masc.events.map((e) => ({ ...e, ...(e.kind === "touch" ? { athlete_id: e.athlete_id.replace("A", "C").replace("B", "D") } : {}) }));
    const matches = [fem, masc];
    const stats = aggregateCompetition(matches);
    const facts = buildFacts(matches);
    const athletes = people([["A1", "F"], ["A2", "F"], ["B1", "F"], ["B2", "F"], ["C1", "M"], ["C2", "M"], ["D1", "M"], ["D2", undefined]]);
    const report = tournamentReport(stats, facts, { athletes, nameOf: (id) => id, teamNameOf: (k) => k });

    expect(report.sections.map((s) => s.key)).toEqual(["F", "M", "none"]);
    expect(report.missingGender).toBe(1);
    const f = report.sections[0];
    expect(f.athletes.map((a) => a.athlete_id).sort()).toEqual(["A1", "A2", "B1", "B2"]);
    // Prêmio de taxa nunca vai para quem não tem o volume mínimo.
    const attack = f.awards.find((a) => a.key === "attack")!;
    for (const w of attack.podium) expect(stats.athletes[w.id].attack.attempts).toBeGreaterThanOrEqual(10);
    // Fontes de erro: ordenadas e somando os pontos entregues da seção.
    const given = f.athletes.reduce((s, a) => s + a.counters.points_given, 0);
    expect(f.errorSources.reduce((s, e) => s + e.count, 0)).toBe(given);
    expect(f.errorSources[0].count).toBeGreaterThanOrEqual(f.errorSources.at(-1)!.count);
    expect(f.errorSources[0].leader).not.toBeNull();
    // Dupla com uma atleta sem gênero cai em "sem gênero".
    expect(report.sections[2].teams.map((t) => t.pair_key)).toEqual(["D1|D2"]);
  });
});
