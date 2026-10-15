import { describe, expect, it } from "vitest";
import { createRng, generateRally, type PlayerProfile } from "@/domain/dev/rally-generator";
import { LedgerDraft, planRally } from "@/domain/rally/plan-events";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import { drillDown, factsIn } from "@/domain/stats/drill";
import { buildFacts, type FactsMatch } from "@/domain/stats/facts";
import { tournamentReport } from "@/domain/stats/report";
import { athleteColumns } from "@/domain/stats/stat-columns";
import type { Athlete, Match, TeamSide } from "@/domain/types";

/**
 * Fase 15 — o motor de analytics precisa aguentar uma temporada inteira no tablet. Temporada
 * sintética: 200 partidas completas de beach (≈ 16 mil ralis), 40 atletas. Orçamentos folgados para
 * máquina lenta/CI; o tempo real medido aparece no console.
 */

const PROFILE: PlayerProfile = { serve: 0.5, pass: 0.5, attack: 0.5, block: 0.5, dig: 0.5 };

function season(matches: number): FactsMatch[] {
  const rng = createRng(15);
  let clock = 1_700_000_000_000;
  let id = 0;
  const out: FactsMatch[] = [];
  for (let m = 0; m < matches; m++) {
    const p = (k: number) => `p${(m * 2 + k) % 40}`;
    const athletes: Record<TeamSide, [string, string]> = { A: [p(0), p(1)], B: [p(2), p(3)] };
    const match: Match = {
      id: `m${m}`,
      tenant_id: "t1",
      modality: "beach",
      rules_version: "beach-2026",
      team_a: { name: `Dupla ${m}A`, athlete_ids: athletes.A },
      team_b: { name: `Dupla ${m}B`, athlete_ids: athletes.B },
      first_server: "A",
      created_at: m,
    };
    const profiles = Object.fromEntries([...athletes.A, ...athletes.B].map((a) => [a, PROFILE]));
    const draft = new LedgerDraft([], { scope: { tenant_id: "t1", match_id: match.id }, match, device_id: "perf", newId: () => `e${++id}`, now: () => ++clock });
    for (let r = 0; r < 200 && !draft.state().winner; r++) {
      const serving = draft.state().serving_team;
      const rally = generateRally({ serving_team: serving, server_id: athletes[serving][r % 2], athletes, profiles }, rng);
      planRally(draft, rally.touches, rally.end);
    }
    out.push({ match, events: draft.added, tournament_id: `t${m % 10}` });
  }
  return out;
}

const time = <T,>(fn: () => T): [T, number] => {
  const t0 = performance.now();
  const v = fn();
  return [v, performance.now() - t0];
};

describe("performance do motor de analytics", () => {
  it("temporada de 200 partidas: fatos + agregação + relatório + drill dentro do orçamento", () => {
    const matches = season(200);
    const [facts, tFacts] = time(() => buildFacts(matches));
    const [stats, tAgg] = time(() => aggregateCompetition(matches));
    const athletes = new Map<string, Athlete>(Object.keys(stats.athletes).map((id, i) => [id, { id, tenant_id: "t1", name: id, created_at: 0, gender: i % 2 ? "F" : "M" }]));
    const [report, tReport] = time(() => tournamentReport(stats, facts, { athletes, nameOf: (x) => x, teamNameOf: (x) => x }));
    const errors = athleteColumns({ modality: "beach", aggregated: true }).find((c) => c.key === "errors")!;
    const [drill, tDrillAll] = time(() => drillDown(facts, errors.drill!, "type", { errors: true }));
    const one = factsIn(facts, { athlete_id: "p7" });
    const [, tDrillOne] = time(() => drillDown(one, errors.drill!, "moment"));

    const rallies = stats.totals.rallies;
    console.info(
      `[perf] ${matches.length} partidas · ${rallies} ralis · ${facts.length} lances — fatos ${tFacts.toFixed(0)} ms · agregação ${tAgg.toFixed(0)} ms · relatório ${tReport.toFixed(0)} ms · drill (todos) ${tDrillAll.toFixed(1)} ms · drill (1 atleta) ${tDrillOne.toFixed(2)} ms`,
    );
    expect(rallies).toBeGreaterThan(10_000);
    expect(report.sections.length).toBeGreaterThan(0);
    expect(drill.total).toBe(Object.values(stats.athletes).reduce((s, a) => s + a.errors, 0));
    expect(tFacts + tAgg + tReport).toBeLessThan(6_000);
    expect(tDrillAll).toBeLessThan(500);
    expect(tDrillOne).toBeLessThan(50);
    // O tempo do teste inclui GERAR a temporada sintética (não medida); só o motor tem orçamento.
  }, 120_000);
});
