import { replayMatch } from "../rally/replay";
import { resolveAthlete, type AliasMap } from "../roster/identity";
import { rulesFor } from "../rules/modality";
import type { TeamSide } from "../types";
import type { AthleteAggregate } from "./aggregate";
import { efficiency, rate } from "./rate";
import { seasonStats, type SeasonMatch } from "./season";
import type { Rate } from "./types";

/**
 * Painel da atleta (Fase 18): dados prontos para os widgets do perfil, sempre a partir dos MESMOS
 * contadores das tabelas (`AthleteAggregate.counters`). Puro; toda divisão por `rate()`/`efficiency()`.
 */

export interface AthleteDashboard {
  /** Acertos = pontos dela (ataque + ace + bloqueio); erros = pontos que ela entregou. */
  balance: { hits: number; errors: number; net: number; kills: number; aces: number; blocks: number };
  /** Alvo do saque: recepções dela ÷ saques que chegaram à dupla. */
  serveTarget: Rate;
  /** Identidade ofensiva: ataques por toque da posse e participação no ataque da dupla. */
  attack: {
    attempts: number;
    first: number;
    second: number;
    third: number;
    secondKills: number;
    share: Rate;
    efficiency: number | null;
  };
  /** Paredão: pontos de bloqueio, toques, erros e bloqueios explorados (block-out sobre ela). */
  wall: { touches: number; points: number; errors: number; exploited: number };
  /** Virada de bola em detalhe (recepções dela). */
  sideOut: { total: Rate; firstBall: Rate; longRally: Rate; pressure: Rate };
}

export function athleteDashboard(a: AthleteAggregate): AthleteDashboard {
  const c = a.counters;
  const hits = a.attack.kills + a.serve.aces + a.blocks;
  return {
    balance: { hits, errors: c.points_given, net: hits - c.points_given, kills: a.attack.kills, aces: a.serve.aces, blocks: a.blocks },
    serveTarget: rate(a.reception.attempts, c.serves_faced),
    attack: {
      attempts: a.attack.attempts,
      first: c.attack_first,
      second: c.second_ball_attempts,
      third: c.attack_third,
      secondKills: c.second_ball_kills,
      share: rate(a.attack.attempts, c.team_attack_attempts),
      efficiency: a.attack.efficiency,
    },
    wall: { touches: c.block_touches, points: a.blocks, errors: c.block_errors, exploited: c.block_exploited },
    sideOut: {
      total: rate(c.reception_won, a.reception.attempts),
      firstBall: rate(c.reception_first_ball_won, a.reception.attempts),
      longRally: rate(c.reception_long_rally_won, c.reception_long_rally),
      pressure: rate(c.reception_pressure_won, c.reception_pressure),
    },
  };
}

export interface MatchEvolutionPoint {
  match_id: string;
  /** Rótulo curto do eixo: "17/10 × Felipe/Luis". */
  label: string;
  /** Data (ms) para ordenar e mostrar. */
  date: number;
  tournament: string | null;
  won: boolean | null;
  hits: number;
  errors: number;
  attackAttempts: number;
  attackEfficiency: number | null;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** Evolução jogo a jogo, em ordem cronológica: o mesmo cálculo das tabelas, partida por partida. */
export function athleteMatchSeries(matches: readonly SeasonMatch[], athleteId: string, aliases: AliasMap): MatchEvolutionPoint[] {
  return [...matches]
    .sort((x, y) => x.match.created_at - y.match.created_at)
    .flatMap((m) => {
      const side = sideOf(m, athleteId, aliases);
      const a = seasonStats([m], aliases).athletes[athleteId];
      if (!side || !a) return [];
      const opponent = side === "A" ? m.match.team_b : m.match.team_a;
      const { winner } = replayMatch(m.events, { rules: rulesFor(m.match.modality), first_server: m.match.first_server });
      const hits = a.attack.kills + a.serve.aces + a.blocks;
      return [
        {
          match_id: m.match.id,
          label: `${shortDate.format(m.match.created_at)} × ${opponent.name}`,
          date: m.match.created_at,
          tournament: m.tournament?.name ?? null,
          won: winner ? winner === side : null,
          hits,
          errors: a.counters.points_given,
          attackAttempts: a.attack.attempts,
          attackEfficiency: efficiency(a.attack.kills, a.attack.errors, a.attack.attempts),
        },
      ];
    });
}

function sideOf({ match }: SeasonMatch, athleteId: string, aliases: AliasMap): TeamSide | null {
  const has = (ids: string[]) => ids.some((id) => resolveAthlete(aliases, id) === athleteId);
  return has(match.team_a.athlete_ids) ? "A" : has(match.team_b.athlete_ids) ? "B" : null;
}

