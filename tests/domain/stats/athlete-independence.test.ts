import { describe, expect, it } from "vitest";
import { pairKey } from "@/domain/roster/identity";
import type { Tournament } from "@/domain/roster/types";
import { athleteByCompetition, seasonStats, type SeasonMatch } from "@/domain/stats/season";
import type { AthleteAggregate } from "@/domain/stats/aggregate";
import type { Match } from "@/domain/types";
import { ledger } from "../../helpers";

/**
 * Fase 12 — no vôlei de praia as parcerias mudam: o histórico individual é da ATLETA. A temporada de
 * R (com P numa etapa, com G noutra e num amistoso com um cadastro duplicado) é exatamente a soma
 * das partidas dela, e a dupla R+P não herda nada dos jogos de R com G.
 */

const tournament = (id: string, start_date: string): Tournament => ({ id, tenant_id: "t", name: `Etapa ${id}`, start_date, modality: "beach", created_at: 0 });
const match = (id: string, a: string[], b: string[], created_at: number): Match => ({
  id, tenant_id: "t", modality: "beach", rules_version: "beach-2026",
  team_a: { name: a.join("/"), athlete_ids: a }, team_b: { name: b.join("/"), athlete_ids: b }, first_server: "A", created_at,
});

/** Um jogo com todos os fundamentos de `r`: ace, erro de saque, passe + ataque #, ace sofrido, ataque em jogo e defesa. */
function game(m: Match, r: string, partner: string, t: Tournament | null, extraKills = 0): SeasonMatch {
  const [o1] = m.team_b.athlete_ids;
  const l = ledger(m.id);
  l.rally().touch("A", "serve", { athlete_id: r, quality: "#" });
  l.rally().touch("A", "serve", { athlete_id: r, quality: "=" });
  for (let i = 0; i <= extraKills; i++) {
    l.rally().touch("B", "serve", { athlete_id: o1, quality: "+" });
    l.touch("A", "reception", { athlete_id: r, quality: "+" });
    l.touch("A", "set", { athlete_id: partner, quality: "+" });
    l.touch("A", "attack", { athlete_id: r, quality: "#" });
  }
  l.rally().touch("B", "serve", { athlete_id: o1, quality: "+" });
  l.touch("A", "reception", { athlete_id: r, quality: "=" });
  l.rally().touch("B", "serve", { athlete_id: o1, quality: "+" });
  l.touch("A", "reception", { athlete_id: partner, quality: "+" });
  l.touch("A", "set", { athlete_id: r, quality: "+" });
  l.touch("A", "attack", { athlete_id: partner, quality: "+" });
  l.touch("B", "dig", { athlete_id: o1, quality: "+" });
  l.touch("B", "attack", { athlete_id: o1, quality: "+" });
  l.touch("A", "dig", { athlete_id: r, quality: "+" });
  l.touch("A", "attack", { athlete_id: r, quality: "+" });
  l.touch("B", "attack", { athlete_id: o1, quality: "#" });
  return { match: m, events: l.events, tournament: t };
}

const T1 = tournament("t1", "2026-03-10");
const T2 = tournament("t2", "2026-08-01");
const withP1 = game(match("m1", ["R", "P"], ["X", "Y"], 1), "R", "P", T1, 2);
const withP2 = game(match("m2", ["P", "R"], ["Z", "W"], 2), "R", "P", T1);
const withG = game(match("m3", ["G", "R"], ["X", "Y"], 3), "R", "G", T2, 1);
// Amistoso com "R2", cadastro duplicado de R unido por alias.
const friendly = game(match("m4", ["R2", "G"], ["Z", "W"], 4), "R2", "G", null);
const all = [withP1, withP2, withG, friendly];
const aliases = new Map([["R2", "R"]]);

const FIELDS = (a: AthleteAggregate) => ({
  points: a.points,
  attack: [a.attack.attempts, a.attack.kills, a.attack.errors, a.attack.in_play],
  serve: [a.serve.attempts, a.serve.aces, a.serve.errors],
  reception: [a.reception.attempts, a.reception.errors, a.reception.positive.num, a.reception.positive.den],
  digs: a.digs,
  errors: a.errors,
});
const sum = (lines: AthleteAggregate[]) =>
  lines.map(FIELDS).reduce((acc, f) => ({
    points: acc.points + f.points,
    attack: acc.attack.map((v, i) => v + f.attack[i]),
    serve: acc.serve.map((v, i) => v + f.serve[i]),
    reception: acc.reception.map((v, i) => v + f.reception[i]),
    digs: acc.digs + f.digs,
    errors: acc.errors + f.errors,
  }));

describe("independência da atleta", () => {
  const season = seasonStats(all, aliases);
  const R = season.athletes.R;

  it("a temporada de R é a soma, campo a campo, das partidas dela — com qualquer parceiro e com o cadastro duplicado", () => {
    const perMatch = all.map((m) => seasonStats([m], aliases).athletes.R);
    expect(perMatch.every(Boolean)).toBe(true);
    expect(FIELDS(R)).toEqual(sum(perMatch));
    expect(R.matches).toBe(4);
    expect(R.attack.kills).toBe(3 + 1 + 2 + 1);
    expect(season.athletes.R2).toBeUndefined(); // o alias não vira outra atleta
  });

  it("a atleta lembra por quais duplas passou; cada dupla soma só os próprios jogos", () => {
    const RP = pairKey(["R", "P"]);
    const RG = pairKey(["R", "G"]);
    expect([...R.team_keys].sort()).toEqual([RG, RP].sort());
    expect(season.teams[RP].matches).toBe(2);
    expect(season.teams[RG].matches).toBe(2); // m3 + amistoso (R2 = R)
    expect(season.teams[RP].attack.kills).toBe(seasonStats([withP1, withP2], aliases).teams[RP].attack.kills);
  });

  it("'Números por torneio' no perfil: uma linha por torneio (com a dupla dele) e a soma é a temporada", () => {
    const lines = athleteByCompetition(all, "R", aliases);
    expect(lines.map((l) => [l.label, l.stats.matches, l.stats.team_keys])).toEqual([
      ["Etapa t1", 2, [pairKey(["R", "P"])]],
      ["Etapa t2", 1, [pairKey(["R", "G"])]],
      ["Amistosos", 1, [pairKey(["R", "G"])]],
    ]);
    expect(sum(lines.map((l) => l.stats))).toEqual(FIELDS(R));
  });
});
