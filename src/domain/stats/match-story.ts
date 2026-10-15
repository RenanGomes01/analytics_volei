import type { RallyResult } from "../rally/replay";
import type { TeamSide } from "../types";

/**
 * Storytelling do placar (Fase 16): por set, os momentos que explicam o jogo — a maior sequência de
 * cada dupla, as viradas de liderança e a "trocação" (side-outs seguidos, ponto a ponto). Puro; as
 * posições são o nº do ponto no set (o mesmo eixo X do gráfico de evolução do placar).
 */

export interface Run {
  team: TeamSide;
  length: number;
  /** Ponto do set em que começou (1 = primeiro ponto) e em que terminou. */
  from: number;
  to: number;
  /** Placar antes da sequência e ao fim dela. */
  scoreFrom: { A: number; B: number };
  scoreTo: { A: number; B: number };
}

export interface LeadChange {
  /** Ponto do set em que a liderança trocou de lado. */
  at: number;
  leader: TeamSide;
  score: { A: number; B: number };
}

export interface SideOutStreak {
  length: number;
  from: number;
  to: number;
  scoreFrom: { A: number; B: number };
  scoreTo: { A: number; B: number };
}

export interface SetStory {
  set_number: number;
  /** Maior sequência de cada dupla no set (null se a dupla não pontuou). */
  runs: Record<TeamSide, Run | null>;
  leadChanges: LeadChange[];
  ties: number;
  /** Maior trecho de side-outs seguidos (só a partir de `MIN_TRADE`). */
  trade: SideOutStreak | null;
  /** Último ponto do set (set point convertido). */
  lastPoint: number;
}

export const MIN_TRADE = 6;

export function setStories(rallies: readonly RallyResult[]): SetStory[] {
  const bySet = new Map<number, RallyResult[]>();
  for (const r of rallies) if (r.point_to) bySet.set(r.set_number, [...(bySet.get(r.set_number) ?? []), r]);
  return [...bySet.entries()].sort((a, b) => a[0] - b[0]).map(([set_number, list]) => setStory(set_number, list));
}

export function setStory(set_number: number, closed: readonly RallyResult[]): SetStory {
  const score = { A: 0, B: 0 };
  const runs: Record<TeamSide, Run | null> = { A: null, B: null };
  const leadChanges: LeadChange[] = [];
  let ties = 0;
  let leader: TeamSide | null = null;
  let run: Run | null = null;
  let trade: SideOutStreak | null = null;
  let streak: SideOutStreak | null = null;

  closed.forEach((r, i) => {
    const point = i + 1;
    const before = { ...score };
    const team = r.point_to!;
    score[team] += 1;
    const after = { ...score };

    // Sequência de pontos seguidos.
    if (run && run.team === team) {
      run.length += 1;
      run.to = point;
      run.scoreTo = after;
    } else run = { team, length: 1, from: point, to: point, scoreFrom: before, scoreTo: after };
    const best = runs[team];
    if (!best || run.length > best.length) runs[team] = { ...run };

    // Virada de liderança (quem estava atrás passa à frente) e empates.
    const now: TeamSide | null = score.A > score.B ? "A" : score.B > score.A ? "B" : null;
    if (now === null) ties += 1;
    else if (leader !== null && now !== leader) leadChanges.push({ at: point, leader: now, score: after });
    if (now !== null) leader = now;

    // Trocação: ponto de quem RECEBEU o saque (side-out), um atrás do outro.
    if (team !== r.serving_team) {
      if (streak) {
        streak.length += 1;
        streak.to = point;
        streak.scoreTo = after;
      } else streak = { length: 1, from: point, to: point, scoreFrom: before, scoreTo: after };
      if (streak.length >= MIN_TRADE && (!trade || streak.length > trade.length)) trade = { ...streak };
    } else streak = null;
  });

  return { set_number, runs, leadChanges, ties, trade, lastPoint: closed.length };
}

const fmt = (s: { A: number; B: number }) => `${s.A}×${s.B}`;

/** Frases do set, na ordem em que interessam ao técnico. */
export function storyLines(story: SetStory, name: (t: TeamSide) => string): string[] {
  const lines: string[] = [];
  for (const t of ["A", "B"] as const) {
    const r = story.runs[t];
    if (r && r.length >= 3) lines.push(`${name(t)} fez ${r.length} pontos seguidos (${fmt(r.scoreFrom)} → ${fmt(r.scoreTo)}).`);
  }
  const n = story.leadChanges.length;
  if (n > 0) lines.push(`A liderança trocou de lado ${n} ${n === 1 ? "vez" : "vezes"}${story.ties ? ` e o placar empatou ${story.ties} ${story.ties === 1 ? "vez" : "vezes"}` : ""}.`);
  else if (story.ties) lines.push(`Sem virada de liderança; o placar empatou ${story.ties} ${story.ties === 1 ? "vez" : "vezes"}.`);
  if (story.trade) lines.push(`Trocação de side-out: ${story.trade.length} pontos seguidos de quem recebia (${fmt(story.trade.scoreFrom)} → ${fmt(story.trade.scoreTo)}).`);
  return lines;
}
