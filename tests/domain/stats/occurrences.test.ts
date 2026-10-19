import { describe, expect, it } from "vitest";
import { athleteMatchSeries } from "@/domain/stats/athlete-dashboard";
import { attackDrill, lethalLabel, pointsDrill } from "@/domain/stats/athlete-insights";
import { drillDown, factsIn, scoredBreakdown, scoredLabel } from "@/domain/stats/drill";
import { buildAnalytics } from "@/domain/stats/facts";
import { groupByMatch, rallyOccurrences, touchOccurrences } from "@/domain/stats/occurrences";
import { causeRows, pointsConceded, pointsWon } from "@/domain/stats/rally-facts";
import { athleteColumns } from "@/domain/stats/stat-columns";
import { randomMatch } from "./random-ledger";

/** Fase 19 — toda barra abre os lances: a quantidade de ocorrências é sempre o número da barra. */

const ATHLETES = ["A1", "A2", "B1", "B2"];

describe("ocorrências por jogo e placar (ledgers aleatórios)", () => {
  const matches = [randomMatch(7, 140, "m7"), randomMatch(19, 140, "m19"), randomMatch(2026, 140, "m2026")];
  const { touches, rallies } = buildAnalytics(matches);

  it("cada causa de 'Pontos cedidos' abre exatamente as suas ocorrências, com o placar de quem cedeu", () => {
    for (const pair of ["A1|A2", "B1|B2"]) {
      const lost = pointsConceded(rallies, { pair_key: pair });
      for (const row of causeRows(lost, "conceded")) {
        const facts = lost.filter((f) => f.code === row.code);
        const occ = rallyOccurrences(facts, "conceded");
        expect(occ.reduce((n, o) => n + o.count, 0)).toBe(row.count);
        occ.forEach((o, i) => {
          expect(o.label).toBe(row.label);
          expect([o.score_own, o.score_opp]).toEqual([facts[i].score_loser, facts[i].score_winner]);
        });
      }
      for (const row of causeRows(pointsWon(rallies, { pair_key: pair }), "merit")) {
        const facts = rallies.filter((f) => f.winner_key === pair && f.code === row.code);
        const occ = rallyOccurrences(facts, "merit");
        expect(occ).toHaveLength(row.count);
        occ.forEach((o, i) => expect([o.score_own, o.score_opp]).toEqual([facts[i].score_winner, facts[i].score_loser]));
      }
    }
  });

  it("cada linha de 'Como cada ponto saiu' abre exatamente os seus pontos", () => {
    for (const id of ATHLETES) {
      const facts = factsIn(touches, { athlete_id: id });
      const occ = touchOccurrences(facts, pointsDrill, { label: scoredLabel });
      for (const row of scoredBreakdown(facts).rows) {
        expect(occ.filter((o) => o.label === row.key).reduce((n, o) => n + o.count, 0)).toBe(row.count);
      }
    }
  });

  it("os ataques de um tipo ('mais letal') são o volume daquele tipo no drill", () => {
    for (const id of ATHLETES) {
      const facts = factsIn(touches, { athlete_id: id });
      for (const row of drillDown(facts, attackDrill, "type", { label: lethalLabel, limit: 0 }).rows) {
        expect(touchOccurrences(facts.filter((f) => lethalLabel(f) === row.label), attackDrill)).toHaveLength(row.count);
      }
    }
  });

  it("barras jogo a jogo: acertos e erros são o total do drill de 'Pts' e 'PE' naquela partida", () => {
    const season = matches.map((m) => ({ ...m, tournament: null }));
    const cols = athleteColumns({ modality: "beach", aggregated: true });
    const points = cols.find((c) => c.key === "points")!;
    const given = cols.find((c) => c.key === "points_given")!;
    for (const id of ATHLETES) {
      for (const p of athleteMatchSeries(season, id, new Map())) {
        const facts = factsIn(touches, { athlete_id: id }).filter((f) => f.match_id === p.match_id);
        expect(drillDown(facts, points.drill!, "type").total).toBe(p.hits);
        expect(drillDown(facts, given.drill!, "type", { errors: true }).total).toBe(p.errors);
      }
    }
  });

  it("agrupa por jogo na ordem pedida e, dentro do jogo, por set e rali", () => {
    const occ = rallyOccurrences(rallies, "conceded");
    const order = ["m2026", "m7", "m19"];
    const groups = groupByMatch(occ, (id) => order.indexOf(id));
    expect(groups.map((g) => g.match_id)).toEqual(order);
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(rallies.length);
    for (const g of groups) {
      for (let i = 1; i < g.items.length; i++) {
        const [a, b] = [g.items[i - 1], g.items[i]];
        expect(a.set_number < b.set_number || (a.set_number === b.set_number && a.rally_number <= b.rally_number)).toBe(true);
      }
    }
  });
});
