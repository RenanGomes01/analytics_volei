import { describe, expect, it } from "vitest";
import { buildQuickRally, type QuickChoice, type QuickTap } from "@/domain/rally/quick-rally";
import { pairKey, teamGender } from "@/domain/roster/identity";
import type { Tournament } from "@/domain/roster/types";
import {
  athletePartners,
  athleteSeries,
  athletesByGender,
  availableYears,
  filterSeason,
  pointKinds,
  seasonStats,
  teamsByGender,
  teamSeries,
  type SeasonMatch,
} from "@/domain/stats/season";
import { rankTeams, TEAM_RANKINGS } from "@/domain/stats/team-rankings";
import type { Athlete, Gender, Match, Quality, RallyEvent, TeamSide } from "@/domain/types";
import { ledger } from "../../helpers";

const tournament = (id: string, start_date: string, category?: Tournament["category"]): Tournament => ({
  id, tenant_id: "t", name: `Etapa ${id}`, start_date, modality: "beach", created_at: 0, ...(category ? { category } : {}),
});

const match = (id: string, a: string[], b: string[], created_at = Date.UTC(2026, 5, 1)): Match => ({
  id, tenant_id: "t", modality: "beach", rules_version: "beach-2026",
  team_a: { name: a.join("/"), athlete_ids: a }, team_b: { name: b.join("/"), athlete_ids: b }, first_server: "B", created_at,
});

/** Partida em que `attacker` (time A) ataca uma sequência de qualidades. */
function attacks(m: Match, attacker: string, qualities: Quality[], t: Tournament | null): SeasonMatch {
  const l = ledger(m.id);
  for (const quality of qualities) {
    l.rally();
    l.touch("B", "serve", { athlete_id: m.team_b.athlete_ids[0] });
    l.touch("A", "attack", { athlete_id: attacker, quality });
  }
  return { match: m, events: l.events, tournament: t };
}

const people: [string, Gender | undefined][] = [["R", "M"], ["P", "M"], ["G", "M"], ["X", "F"], ["Y", "F"], ["Z", undefined]];
const athletes = new Map<string, Athlete>(people.map(([id, gender]) => [id, { id, tenant_id: "t", name: id, created_at: 0, ...(gender ? { gender } : {}) }]));
const noAliases = new Map<string, string>();

const T1 = tournament("t1", "2026-03-10", "M");
const T2 = tournament("t2", "2026-08-01", "M");
const T0 = tournament("t0", "2025-11-01", "M");
const TF = tournament("tf", "2026-05-01", "F");

describe("teamGender", () => {
  it("deduz da dupla: M+M, F+F, misto e null sem cadastro", () => {
    expect(teamGender(["M", "M"])).toBe("M");
    expect(teamGender(["F", "F"])).toBe("F");
    expect(teamGender(["M", "F"])).toBe("Mixed");
    expect(teamGender(["M", undefined])).toBeNull();
  });
});

describe("temporada: recorte e soma entre torneios", () => {
  // Renan com Pedro na etapa 1 (40% em 10 ataques); com George na etapa 2 (100% em 2).
  const s1 = attacks(match("m1", ["R", "P"], ["X", "Y"]), "R", ["#", "#", "#", "#", "#", "=", "+", "+", "+", "+"], T1);
  const s2 = attacks(match("m2", ["G", "R"], ["X", "Y"]), "R", ["#", "#"], T2);
  const old = attacks(match("m0", ["R", "P"], ["X", "Y"]), "R", ["#"], T0);
  const fem = attacks(match("mf", ["X", "Y"], ["Z", "R"]), "X", ["#"], TF);
  const friendly = attacks(match("ma", ["R", "P"], ["X", "Y"], Date.UTC(2026, 6, 15)), "R", ["="], null);
  const all = [s1, s2, old, fem, friendly];

  it("ano pelo início do torneio; amistosos só quando incluídos; categoria da etapa", () => {
    expect(availableYears(all)).toEqual([2026, 2025]);
    expect(filterSeason(all, { year: 2026 }).map((m) => m.match.id)).toEqual(["m1", "m2", "mf"]);
    expect(filterSeason(all, { year: 2026, includeFriendlies: true }).map((m) => m.match.id)).toEqual(["m1", "m2", "mf", "ma"]);
    expect(filterSeason(all, { year: 2026, category: "F", includeFriendlies: true }).map((m) => m.match.id)).toEqual(["mf"]);
  });

  it("estatística da temporada soma numeradores e denominadores ATRAVÉS de torneios (40% + 100% → 50%)", () => {
    const stats = seasonStats(filterSeason(all, { year: 2026, category: "M" }), noAliases);
    expect(stats.athletes.R.attack).toMatchObject({ attempts: 12, kills: 7, errors: 1, in_play: 4, efficiency: 0.5 });
    expect(stats.athletes.R.matches).toBe(2);
  });

  it("gênero: atletas e duplas filtrados, contando quem está sem cadastro", () => {
    const stats = seasonStats(filterSeason(all, { year: 2026 }), noAliases);
    const fem = athletesByGender(stats, athletes, "F");
    expect(fem.included.map((a) => a.athlete_id).sort()).toEqual(["X", "Y"]);
    expect(fem.missingGender).toBe(1); // Z
    expect(teamsByGender(stats, athletes, "M").included.map((t) => t.pair_key).sort()).toEqual([pairKey(["G", "R"]), pairKey(["P", "R"])].sort());
    expect(teamsByGender(stats, athletes, "F").missingGender).toBe(1); // Z/R não tem gênero completo
  });

  it("evolução do atleta: um ponto por torneio, cada um somando o torneio inteiro", () => {
    const series = athleteSeries(filterSeason(all, { year: 2026, includeFriendlies: true }), "R", noAliases);
    expect(series.map((p) => [p.label, p.attack.efficiency, p.attack.attempts])).toEqual([
      ["Etapa t1", 0.4, 10],
      ["Etapa tf", null, 0], // jogou (sem atacar) na etapa feminina, como Z/R
      ["Amistosos jul. de 26", -1, 1],
      ["Etapa t2", 1, 2],
    ]);
  });

  it("parceiros: o atleta atravessa duplas; aliases unem cadastros antigos", () => {
    const partners = athletePartners(filterSeason(all, { year: 2026, category: "M" }), "R", noAliases);
    expect(partners.map((p) => [p.partner_ids, p.matches, p.points])).toEqual([
      [["P"], 1, 5],
      [["G"], 1, 2],
    ]);
    // "R2" é o mesmo Renan cadastrado de novo noutro jogo.
    const dup = attacks(match("m3", ["R2", "P"], ["X", "Y"]), "R2", ["#"], T2);
    const merged = athletePartners([s1, dup], "R", new Map([["R2", "R"]]));
    expect(merged).toEqual([expect.objectContaining({ partner_ids: ["P"], matches: 2, points: 6 })]);
  });
});

describe("dupla: K1 × K2 por torneio, confrontos e rankings", () => {
  /** Ralis com vencedores dados; o sacador segue a regra. */
  function rallies(m: Match, winners: TeamSide[], t: Tournament): SeasonMatch {
    const l = ledger(m.id);
    let server: TeamSide = m.first_server;
    for (const w of winners) {
      l.point(server, w);
      server = w;
    }
    return { match: m, events: l.events, tournament: t };
  }
  const key = pairKey(["R", "P"]);
  const a = rallies(match("m1", ["R", "P"], ["X", "Y"]), ["A", "B", "B", "A"], T1); // B saca 1º
  const b = rallies(match("m2", ["P", "R"], ["G", "Z"]), [...Array(42).fill("A")], T2); // R/P vence 2×0

  it("série por torneio com num/den e confrontos com V/D", () => {
    const { series, opponents } = teamSeries([a, b], key, noAliases);
    expect(series[0]).toMatchObject({ label: "Etapa t1", side_out: { num: 2, den: 3 }, break_point: { num: 0, den: 1 } });
    expect(series[1]).toMatchObject({ label: "Etapa t2", wins: 1, losses: 0 });
    expect(opponents).toEqual([
      { pair_key: pairKey(["X", "Y"]), matches: 1, wins: 0, losses: 0 },
      { pair_key: pairKey(["G", "Z"]), matches: 1, wins: 1, losses: 0 },
    ]);
  });

  it("ranking de duplas aplica volume mínimo e ordena", () => {
    const teams = Object.values(seasonStats([a, b], noAliases).teams);
    const nameOf = (k: string) => k;
    const spec = (m: string) => TEAM_RANKINGS.find((s) => s.metric === m)!;
    expect(rankTeams(teams, spec("wins"), { nameOf }).map((r) => [r.pair_key, r.value])).toEqual([[key, 1]]);
    expect(rankTeams(teams, spec("win_rate"), { nameOf })).toEqual([]); // ninguém com 3 jogos encerrados
    expect(rankTeams(teams, spec("point_diff"), { nameOf })[0]).toMatchObject({ pair_key: key, value: 44 - 2 });
    // Sem volume mínimo, X/Y (1 de 1 = 100%) passa R/P (3 de 4 = 75%): é por isso que o padrão exige 30 ralis.
    expect(rankTeams(teams, spec("side_out"), { nameOf, min: 1 }).map((r) => [r.pair_key, r.value, r.volume])).toEqual([
      [pairKey(["X", "Y"]), 1, 1],
      [key, 0.75, 4],
      [pairKey(["G", "Z"]), 0, 41], // taxa 0% entra (só contagens zeradas ficam fora)
    ]);
    // Com o mínimo padrão (30 ralis recebendo), só G/Z (41) entra.
    expect(rankTeams(teams, spec("side_out"), { nameOf })).toEqual([{ pair_key: pairKey(["G", "Z"]), value: 0, volume: 41 }]);
  });
});

describe("como os pontos aconteceram", () => {
  function quick(id: string, taps: QuickTap[], winner: TeamSide, choice: QuickChoice): SeasonMatch {
    const m = match(id, ["R", "P"], ["X", "Y"]);
    const { touches, end } = buildQuickRally(taps, winner, choice);
    let seq = 0;
    const base = { tenant_id: "t", match_id: id, set_id: `${id}:s1`, set_number: 1, rally_id: "r", rally_number: 1, device_id: "d" };
    const events: RallyEvent[] = [
      ...touches.map((t) => ({ ...base, ...t, id: `e${++seq}`, local_seq: seq, timestamp: seq, kind: "touch" as const, phase: "side_out" as const })),
      { ...base, ...end, id: `e${++seq}`, local_seq: seq, timestamp: seq, kind: "rally_end" as const },
    ];
    return { match: m, events, tournament: T1 };
  }
  const t = (id: string, block = false): QuickTap => ({ team: id === "R" || id === "P" ? "A" : "B", athlete_id: id, ...(block ? { block } : {}) });

  it("agrupa por motivo + detalhe; filtra pelos pontos de uma dupla", () => {
    const games = [
      quick("q1", [t("X")], "A", { outcome: "serve_error", detail: "out" }),
      quick("q2", [t("X"), t("R"), t("P"), t("R")], "A", { outcome: "kill" }),
      quick("q3", [t("X"), t("R"), t("P")], "B", { outcome: "ball_error", detail: "double" }),
      quick("q4", [t("X"), t("R"), t("P"), t("R")], "B", { outcome: "blocked", detail: "blocked", athlete_id: "Y" }),
      quick("q5", [t("X"), t("R")], "B", { outcome: "fault", detail: "net_touch", athlete_id: "R" }),
    ];
    expect(pointKinds(games, noAliases).map((k) => [k.label, k.count, k.group])).toEqual([
      // Fase 16: os rótulos vêm do classificador do espelho tático (rally-facts.ts).
      ["Ataque (3º toque)", 1, "won"],
      ["Erro do adversário: falta (toque na rede)", 1, "error"],
      ["Erro do adversário: levantamento (dois toques)", 1, "error"],
      ["Erro do adversário: saque fora", 1, "error"],
      ["Ponto de bloqueio", 1, "won"],
    ]);
    expect(pointKinds(games, noAliases, pairKey(["R", "P"])).map((k) => k.label)).toEqual(["Ataque (3º toque)", "Erro do adversário: saque fora"]);
  });
});
