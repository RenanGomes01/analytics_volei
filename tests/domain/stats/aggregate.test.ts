import { describe, expect, it } from "vitest";
import { replayMatch } from "@/domain/rally/replay";
import { pairKey } from "@/domain/roster/identity";
import { BEACH_RULES } from "@/domain/rules/modality";
import { aggregateCompetition, type CompetitionMatch } from "@/domain/stats/aggregate";
import { computeBoxScore } from "@/domain/stats/box-score";
import { rankAthletes, rankingSpecs } from "@/domain/stats/rankings";
import type { Match, Quality, TeamSide } from "@/domain/types";
import { ledger } from "../../helpers";

function match(id: string, a: string[], b: string[], created_at = 0, names = ["Dupla A", "Dupla B"]): Match {
  return {
    id,
    tenant_id: "t1",
    modality: "beach",
    rules_version: "beach-2026",
    team_a: { name: names[0], athlete_ids: a },
    team_b: { name: names[1], athlete_ids: b },
    first_server: "B",
    created_at,
  };
}

/** Uma partida em que `attacker` (time A) faz uma sequência de ataques, cada um num rali. */
function attacksMatch(m: Match, attacker: string, qualities: Quality[]): CompetitionMatch {
  const l = ledger(m.id);
  for (const quality of qualities) {
    l.rally();
    l.touch("B", "serve", { athlete_id: m.team_b.athlete_ids[0] });
    l.touch("A", "attack", { athlete_id: attacker, quality });
  }
  return { match: m, events: l.events };
}

/** Partida terminada por aces de quem saca primeiro (B). */
function sweep(m: Match, winner: TeamSide, points: number): CompetitionMatch {
  const l = ledger(m.id);
  for (let i = 0; i < points; i++) l.point(winner, winner);
  return { match: m, events: l.events };
}

describe("aggregateCompetition — regra estatística", () => {
  it("soma numeradores e denominadores: 40% (10 ataques) + 100% (2 ataques) = 50%, não a média 70%", () => {
    const m1 = attacksMatch(match("m1", ["R", "P"], ["X", "Y"]), "R", ["#", "#", "#", "#", "#", "=", "+", "+", "+", "+"]);
    const m2 = attacksMatch(match("m2", ["R", "P"], ["X", "Y"]), "R", ["#", "#"]);

    const perMatch = [m1, m2].map(({ match: mm, events }) =>
      computeBoxScore(events, { rules: BEACH_RULES, first_server: "B", roster: { A: mm.team_a.athlete_ids, B: mm.team_b.athlete_ids } })
        .athletes.R.attack.efficiency,
    );
    expect(perMatch).toEqual([0.4, 1]);

    const agg = aggregateCompetition([m1, m2]);
    expect(agg.athletes.R.attack).toEqual({ attempts: 12, kills: 7, errors: 1, in_play: 4, efficiency: 0.5 });
    expect(agg.athletes.R.matches).toBe(2);
  });

  it("taxas de equipe também somam numeradores e denominadores (virada de bola)", () => {
    /** Ralis com vencedores dados; o sacador segue a regra (quem vence o rali saca o próximo). */
    const rallies = (m: Match, winners: TeamSide[]): CompetitionMatch => {
      const l = ledger(m.id);
      let server: TeamSide = m.first_server;
      for (const winner of winners) {
        l.point(server, winner);
        server = winner;
      }
      return { match: m, events: l.events };
    };
    // Jogo 1: B saca r1 (A vira), A saca r2 (B vence), B saca r3 (B vence), B saca r4 (A vira) → A: 2 de 3.
    const m1 = rallies(match("m1", ["R", "P"], ["X", "Y"]), ["A", "B", "B", "A"]);
    // Jogo 2: B saca e vence → A: 0 de 1.
    const m2 = rallies(match("m2", ["R", "P"], ["X", "Y"]), ["B"]);
    const team = aggregateCompetition([m1, m2]).teams[pairKey(["R", "P"])];
    expect(team.side_out).toEqual({ num: 2, den: 4, pct: 0.5 }); // e não (66,7% + 0%) / 2 = 33,3%
  });

  it("um jogo só: o agregado é igual ao Box Score daquele jogo", () => {
    const m1 = attacksMatch(match("m1", ["R", "P"], ["X", "Y"]), "R", ["#", "=", "+", "#"]);
    const box = computeBoxScore(m1.events, { rules: BEACH_RULES, first_server: "B", roster: { A: ["R", "P"], B: ["X", "Y"] } });
    const agg = aggregateCompetition([m1]);
    /** Só os campos que existem no Box Score de uma partida. */
    const pick = <T extends object>(source: T, shape: object) =>
      Object.fromEntries(Object.keys(shape).map((k) => [k, source[k as keyof T]]));
    for (const id of ["R", "P", "X", "Y"]) {
      const { team, ...lines } = box.athletes[id];
      expect(team).toBe(id === "R" || id === "P" ? "A" : "B");
      expect(pick(agg.athletes[id], lines)).toEqual(lines);
      expect(agg.athletes[id].matches).toBe(1);
    }
    expect(pick(agg.teams[pairKey(["R", "P"])], box.teams.A)).toEqual(box.teams.A);
  });
});

describe("aggregateCompetition — identidade entre partidas", () => {
  it("aliases unem o mesmo atleta cadastrado duas vezes (jogos do MVP)", () => {
    const m1 = attacksMatch(match("m1", ["R1", "P1"], ["X", "Y"]), "R1", ["#"]);
    const m2 = attacksMatch(match("m2", ["P2", "R2"], ["X", "Y"]), "R2", ["#", "#"]);
    const aliases = new Map([["R2", "R1"], ["P2", "P1"]]);

    const agg = aggregateCompetition([m1, m2], { aliases });
    expect(agg.athletes.R1).toMatchObject({ matches: 2, attack: { kills: 3 } });
    expect(agg.athletes.R2).toBeUndefined();
    // A dupla é a mesma (ordem e ids antigos não importam): um registro só, com 2 jogos.
    expect(Object.keys(agg.teams).sort()).toEqual([pairKey(["P1", "R1"]), pairKey(["X", "Y"])].sort());
    expect(agg.teams[pairKey(["R1", "P1"])].matches).toBe(2);

    expect(aggregateCompetition([m1, m2]).athletes.R1.matches).toBe(1); // sem alias: dois "Renans"
  });

  it("atleta do elenco sem nenhum lance conta o jogo disputado", () => {
    const agg = aggregateCompetition([attacksMatch(match("m1", ["R", "P"], ["X", "Y"]), "R", ["#"])]);
    expect(agg.athletes.P).toMatchObject({ matches: 1, points: 0 });
  });
});

describe("aggregateCompetition — resultados", () => {
  it("V/D, sets e pontos pró/contra; partida em andamento não entra em V/D", () => {
    const done = sweep(match("m1", ["R", "P"], ["X", "Y"], 1), "B", 42); // B vence 21-0, 21-0
    const live = sweep(match("m2", ["R", "P"], ["X", "Y"], 2), "A", 5); // em andamento
    const agg = aggregateCompetition([done, live]);
    const rp = agg.teams[pairKey(["R", "P"])];
    const xy = agg.teams[pairKey(["X", "Y"])];
    expect(rp).toMatchObject({ matches: 2, wins: 0, losses: 1, sets_won: 0, sets_lost: 2, points_for: 5, points_against: 42 });
    expect(xy).toMatchObject({ matches: 2, wins: 1, losses: 0, sets_won: 2, sets_lost: 0, points_for: 42, points_against: 5 });
    expect(agg.totals).toEqual({ matches: 2, finished: 1, sets: 3, rallies: 47, points: 47 });
    expect(replayMatch(live.events, { rules: BEACH_RULES, first_server: "B" }).winner).toBeNull();
  });

  it("o nome da dupla vem do jogo mais recente", () => {
    const old = sweep(match("m1", ["R", "P"], ["X", "Y"], 1, ["Renan/Pedro", "B"]), "A", 1);
    const recent = sweep(match("m2", ["P", "R"], ["X", "Y"], 2, ["Pedro e Renan", "B"]), "A", 1);
    expect(aggregateCompetition([recent, old]).teams[pairKey(["R", "P"])].name).toBe("Pedro e Renan");
  });
});

describe("rankings", () => {
  const names: Record<string, string> = { A1: "Ana", B1: "Bia", C1: "Carla", D1: "Duda" };
  const nameOf = (id: string) => names[id] ?? id;
  // Ana: 10 ataques, 6-1 (50%). Bia: 1 ataque, 1-0 (100%, mas abaixo do mínimo). Carla: 10 ataques, 6-1 (50%).
  const games = [
    attacksMatch(match("m1", ["A1", "B1"], ["X", "Y"]), "A1", ["#", "#", "#", "#", "#", "#", "=", "+", "+", "+"]),
    attacksMatch(match("m2", ["B1", "A1"], ["X", "Y"]), "B1", ["#"]),
    attacksMatch(match("m3", ["C1", "D1"], ["X", "Y"]), "C1", ["#", "#", "#", "#", "#", "#", "=", "+", "+", "+"]),
  ];
  const athletes = Object.values(aggregateCompetition(games).athletes);
  const spec = (metric: string) => rankingSpecs("beach").find((s) => s.metric === metric)!;

  it("volume mínimo: '1 de 1 = 100%' não lidera o ranking de ataque", () => {
    const rows = rankAthletes(athletes, spec("attack"), { nameOf });
    expect(rows.map((r) => r.athlete_id)).toEqual(["A1", "C1"]); // Bia fica de fora (1 < 10 ataques)
    expect(rows[0]).toEqual({ athlete_id: "A1", value: 0.5, volume: 10 });
    expect(rankAthletes(athletes, spec("attack"), { nameOf, min: 1 })[0].athlete_id).toBe("B1");
  });

  it("empate desfaz por volume e depois pelo nome; contagem zerada não aparece", () => {
    const points = rankAthletes(athletes, spec("points"), { nameOf });
    // Ana e Carla: 6 pontos; Ana jogou 2 partidas (volume maior) → Ana primeiro.
    expect(points.map((r) => [r.athlete_id, r.value])).toEqual([["A1", 6], ["C1", 6], ["B1", 1]]);
    expect(points.map((r) => r.athlete_id)).not.toContain("D1");
    expect(rankAthletes(athletes, spec("aces"), { nameOf })).toEqual([]);
  });

  it("limite de posições e rótulo do passe por modalidade", () => {
    expect(rankAthletes(athletes, spec("points"), { nameOf, limit: 2 })).toHaveLength(2);
    expect(rankingSpecs("beach").find((s) => s.metric === "reception")?.label).toBe("Melhor passe (na mão)");
    expect(rankingSpecs("indoor").find((s) => s.metric === "reception")?.label).toBe("Melhor recepção (#+)");
  });
});
