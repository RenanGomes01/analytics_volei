import { describe, expect, it } from "vitest";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES, INDOOR_RULES, type ModalityRules } from "@/domain/rules/modality";
import { boxScoreFromRallies } from "@/domain/stats/box-score";
import type { BoxScore, TeamStats } from "@/domain/stats/types";
import type { Quality, Skill, TeamSide } from "@/domain/types";
import { ledger } from "../../helpers";

/** PRNG determinístico (mulberry32): a mesma semente gera sempre o mesmo ledger. */
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

/** Ledger aleatório, mas válido estruturalmente: saques, toques, pontos manuais e anulações. */
function randomLedger(seed: number, rallies: number) {
  const random = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const team = (): TeamSide => (random() < 0.5 ? "A" : "B");
  const l = ledger();
  for (let r = 0; r < rallies; r++) {
    l.rally();
    const server = team();
    l.touch(server, "serve", { athlete_id: `${server}${1 + Math.floor(random() * 2)}`, quality: pick(QUALITIES) });
    const touches = Math.floor(random() * 7);
    for (let i = 0; i < touches; i++) {
      const t = team();
      l.touch(t, pick(SKILLS), { athlete_id: `${t}${1 + Math.floor(random() * 2)}`, quality: pick(QUALITIES) });
    }
    if (random() < 0.15) l.end(team(), "manual");
    if (random() < 0.1) l.void(pick(l.events).id);
  }
  return l;
}

const roster = { A: ["A1", "A2"], B: ["B1", "B2"] };
const COUNT_KEYS = ["blocks", "digs", "errors"] as const;

function sumTeams(boxes: BoxScore[], team: TeamSide, read: (t: TeamStats) => number) {
  return boxes.reduce((acc, b) => acc + read(b.teams[team]), 0);
}

describe.each([
  ["beach", BEACH_RULES],
  ["indoor", INDOOR_RULES],
] as [string, ModalityRules][])("invariantes do Box Score (%s, ledgers aleatórios)", (_, rules) => {
  it.each([1, 2, 3, 42, 2026])("semente %i", (seed) => {
    const events = randomLedger(seed, 160).events;
    const state = replayMatch(events, { rules, first_server: "A" });
    const all = boxScoreFromRallies(state.rallies, roster);
    const perSet = all.sets_available.map((set) => boxScoreFromRallies(state.rallies, roster, { set }));
    const closed = state.rallies.filter((r) => r.point_to).length;
    expect(perSet.length).toBeGreaterThan(1); // o ledger aleatório precisa cruzar a fronteira de set
    expect(all.teams.A.attack.errors + all.teams.B.attack.errors).toBeGreaterThan(0);

    for (const team of ["A", "B"] as const) {
      const p = all.teams[team].points;
      // 1. Pontos = placar, no jogo e em cada set.
      expect(p.total).toBe(state.sets.reduce((acc, s) => acc + s.score[team], 0));
      expect(p.kills + p.aces + p.blocks + p.opponent_errors).toBe(p.total);
      perSet.forEach((box, i) => expect(box.teams[team].points.total).toBe(state.sets[i].score[team]));

      // 2. Todo rali fechado é sacado por uma equipe e recebido pela outra.
      const t = all.teams[team];
      expect(t.side_out.den + t.break_point.den).toBe(closed);
      expect(t.side_out.num + t.break_point.num).toBe(p.total);

      // 3. Jogo = soma dos sets para as contagens.
      expect(sumTeams(perSet, team, (s) => s.attack.attempts)).toBe(t.attack.attempts);
      expect(sumTeams(perSet, team, (s) => s.reception.positive.num)).toBe(t.reception.positive.num);
      for (const key of COUNT_KEYS) expect(sumTeams(perSet, team, (s) => s[key])).toBe(t[key]);

      // 4. Linha de ataque é coerente.
      expect(t.attack.kills + t.attack.errors + t.attack.in_play).toBe(t.attack.attempts);
      expect(t.attack.in_play).toBeGreaterThanOrEqual(0);
    }

    // 5. Equipe = soma dos atletas, para as linhas de lance.
    for (const team of ["A", "B"] as const) {
      const athletes = Object.values(all.athletes).filter((a) => a.team === team);
      const sum = (read: (a: (typeof athletes)[number]) => number) => athletes.reduce((acc, a) => acc + read(a), 0);
      expect(sum((a) => a.attack.kills)).toBe(all.teams[team].attack.kills);
      expect(sum((a) => a.serve.aces)).toBe(all.teams[team].serve.aces);
      expect(sum((a) => a.reception.attempts)).toBe(all.teams[team].reception.attempts);
      expect(sum((a) => a.errors)).toBe(all.teams[team].errors);
    }
  });
});
