import { replayMatch } from "../rally/replay";
import { pairKey, resolveAthlete, type AliasMap } from "../roster/identity";
import { rulesFor, setTarget } from "../rules/modality";
import type { Match, PointDetail, Quality, RallyEvent, RallyPhase, Skill, TeamSide, TouchEvent } from "../types";
import { classifyRally, type RallyFact } from "./rally-facts";
import { tallyTouches, type TouchDelta } from "./touch-lines";

/**
 * Motor de fatos (Fase 15): uma linha por lance, com o contexto do rali. Parte dos MESMOS ralis do
 * placar (`replayMatch`) e da MESMA contribuição estatística (`touchDelta` via `tallyTouches`): a soma
 * de `drill(delta)` sobre os fatos de uma atleta é exatamente o número da tabela. É a base do
 * drill-down, do relatório de torneio e do construtor de relatórios. Puro e sem persistência.
 */

/** Momento do set pelo placar ANTES do rali: terços do alvo do set (21/25 ou 15 no decisivo). */
export type Moment = "start" | "middle" | "final";

export const MOMENT_LABEL: Record<Moment, string> = {
  start: "Início do set",
  middle: "Meio do set",
  final: "Reta final",
};

export interface TouchFact {
  match_id: string;
  tournament_id: string | null;
  set_number: number;
  rally_number: number;
  team: TeamSide;
  /** Dupla/time do lance (ids canônicos). */
  pair_key: string;
  /** Id canônico (aliases resolvidos). */
  athlete_id: string;
  skill: Skill;
  quality: Quality;
  detail?: PointDetail;
  /** 1º, 2º, 3º… toque da posse da equipe. */
  touch_in_possession: number;
  phase: RallyPhase;
  /** Placar do set antes do rali, do ponto de vista da equipe do lance. */
  score_own: number;
  score_opp: number;
  moment: Moment;
  /** As duas equipes a 3 pontos ou menos do fim do set. */
  clutch: boolean;
  /** O rali terminou com ponto para a equipe do lance. */
  won: boolean;
  /** O que o lance soma às estatísticas (o mesmo das tabelas). */
  delta: TouchDelta;
  /**
   * Duelo (Fase 16): a adversária do lance, deduzida da sequência do rali (id canônico) — quem a
   * bloqueadora bloqueou, quem bloqueou/defendeu o ataque, quem recebeu o saque. Ausente quando o
   * ledger não tem o toque do outro lado: nunca se inventa um nome.
   */
  opponent_id?: string;
  opponent_skill?: Skill;
}

export interface FactsMatch {
  match: Match;
  events: readonly RallyEvent[];
  tournament_id?: string | null;
}

function momentOf(top: number, target: number): Moment {
  if (top < target / 3) return "start";
  if (top < (2 * target) / 3) return "middle";
  return "final";
}

/** Fundamentos cuja adversária é o toque SEGUINTE do outro lado (o resto olha o anterior). */
const LOOKS_AHEAD = new Set<Skill>(["serve", "attack"]);
const DUELS = new Set<Skill>(["serve", "attack", "block", "reception", "dig"]);

function opponentOf(touches: readonly TouchEvent[], i: number): TouchEvent | undefined {
  const t = touches[i];
  if (!DUELS.has(t.skill)) return undefined;
  const other = LOOKS_AHEAD.has(t.skill) ? touches[i + 1] : touches[i - 1];
  return other && other.team !== t.team ? other : undefined;
}

export interface Analytics {
  touches: TouchFact[];
  /** Um por rali com ponto: mérito de quem ganhou e espelho em quem perdeu (Fase 16). */
  rallies: RallyFact[];
}

export function buildFacts(matches: readonly FactsMatch[], aliases: AliasMap = new Map()): TouchFact[] {
  return buildAnalytics(matches, aliases).touches;
}

/** Fatos de lance e de rali numa ÚNICA passada (um replay por partida). */
export function buildAnalytics(matches: readonly FactsMatch[], aliases: AliasMap = new Map()): Analytics {
  const facts: TouchFact[] = [];
  const rallyFacts: RallyFact[] = [];
  const canon = (id: string | null) => (id ? resolveAthlete(aliases, id) : null);
  for (const { match, events, tournament_id = null } of matches) {
    const rules = rulesFor(match.modality);
    const { rallies } = replayMatch(events, { rules, first_server: match.first_server });
    const keys: Record<TeamSide, string> = { A: pairKey(match.team_a.athlete_ids, aliases), B: pairKey(match.team_b.athlete_ids, aliases) };
    const score: Record<TeamSide, number> = { A: 0, B: 0 };
    let set = 0;
    for (const rally of rallies) {
      if (rally.set_number !== set) {
        set = rally.set_number;
        score.A = 0;
        score.B = 0;
      }
      const target = setTarget(rules, rally.set_number);
      const top = Math.max(score.A, score.B);
      const clutch = Math.min(score.A, score.B) >= target - 3;
      tallyTouches(rally, (team, athlete_id, delta, i) => {
        const touch = rally.touches[i];
        const other: TeamSide = team === "A" ? "B" : "A";
        const opponent = opponentOf(rally.touches, i);
        facts.push({
          match_id: match.id,
          tournament_id,
          set_number: rally.set_number,
          rally_number: rally.rally_number,
          team,
          pair_key: keys[team],
          athlete_id: resolveAthlete(aliases, athlete_id),
          skill: touch.skill,
          quality: touch.quality,
          ...(touch.detail ? { detail: touch.detail } : {}),
          touch_in_possession: possessionIndex(rally.touches, i),
          phase: touch.phase,
          score_own: score[team],
          score_opp: score[other],
          moment: momentOf(top, target),
          clutch,
          won: rally.point_to === team,
          delta,
          ...(opponent ? { opponent_id: resolveAthlete(aliases, opponent.athlete_id), opponent_skill: opponent.skill } : {}),
        });
      });
      const cause = classifyRally(rally);
      if (cause && rally.point_to) {
        const w = rally.point_to;
        const l: TeamSide = w === "A" ? "B" : "A";
        rallyFacts.push({
          ...cause,
          scorer: canon(cause.scorer),
          culprit: canon(cause.culprit),
          match_id: match.id,
          tournament_id,
          set_number: rally.set_number,
          rally_number: rally.rally_number,
          winner: w,
          loser: l,
          winner_key: keys[w],
          loser_key: keys[l],
          serving_team: rally.serving_team,
          score_winner: score[w],
          score_loser: score[l],
          moment: momentOf(top, target),
          clutch,
        });
      }
      if (rally.point_to) score[rally.point_to] += 1;
    }
  }
  return { touches: facts, rallies: rallyFacts };
}

function possessionIndex(touches: readonly { team: TeamSide }[], i: number): number {
  let n = 1;
  while (i - n >= 0 && touches[i - n].team === touches[i].team) n += 1;
  return n;
}
