import { replayMatch } from "../rally/replay";
import { pairKey, resolveAthlete, teamGender, type AliasMap } from "../roster/identity";
import { matchesPhase, type PhaseFilter, type Tournament, type TournamentCategory, type TournamentPhase } from "../roster/types";
import { rulesFor } from "../rules/modality";
import type { Athlete, Gender, Match, RallyEvent, TeamSide } from "../types";
import { aggregateCompetition, type AthleteAggregate, type CompetitionStats, type TeamAggregate } from "./aggregate";
import { rallyPointKinds, type PointKind } from "./match-insights";
import type { AttackLine, Rate, ReceptionLine } from "./types";

/**
 * Temporada: partidas de vários torneios (e amistosos). Tudo deriva de aggregateCompetition, que soma
 * contadores brutos — nunca média de porcentagens. Atletas por id canônico (aliases); duplas por
 * pair_key (no vôlei de praia as parcerias mudam: o atleta atravessa duplas, a dupla é o par). Puro.
 */

export interface SeasonMatch {
  match: Match;
  events: readonly RallyEvent[];
  /** null = amistoso/treino (partida sem torneio). */
  tournament: Tournament | null;
  /** Fase no torneio, quando registrada. */
  phase?: TournamentPhase;
}

export interface SeasonFilter {
  year?: number;
  category?: TournamentCategory | "all";
  includeFriendlies?: boolean;
  /** Fase: amistosos e partidas sem fase só entram em "all". */
  phase?: PhaseFilter;
}

export type GenderFilter = Gender | "all";

/** Ano da partida: o do torneio (data de início) ou, em amistosos, o da criação. */
export function seasonYear({ match, tournament }: SeasonMatch): number {
  return tournament ? Number(tournament.start_date.slice(0, 4)) : new Date(match.created_at).getFullYear();
}

export function availableYears(matches: readonly SeasonMatch[]): number[] {
  return [...new Set(matches.map(seasonYear))].sort((a, b) => b - a);
}

/** Recorte da temporada por ano, categoria da etapa e amistosos. */
export function filterSeason(
  matches: readonly SeasonMatch[],
  { year, category = "all", includeFriendlies = false, phase = "all" }: SeasonFilter,
): SeasonMatch[] {
  return matches.filter((m) => {
    if (year !== undefined && seasonYear(m) !== year) return false;
    if (!m.tournament) return includeFriendlies && category === "all" && phase === "all";
    if (!matchesPhase(m.phase, phase)) return false;
    return category === "all" || m.tournament.category === category;
  });
}

export const seasonStats = (matches: readonly SeasonMatch[], aliases: AliasMap): CompetitionStats =>
  aggregateCompetition(matches, { aliases });

// ---------- gênero ----------

export interface GenderSplit<T> {
  included: T[];
  /** Fora do recorte por falta de gênero no cadastro. */
  missingGender: number;
}

export function athletesByGender(
  stats: CompetitionStats,
  athletes: ReadonlyMap<string, Athlete>,
  gender: GenderFilter,
): GenderSplit<AthleteAggregate> {
  const all = Object.values(stats.athletes);
  if (gender === "all") return { included: all, missingGender: 0 };
  let missingGender = 0;
  const included = all.filter((a) => {
    const g = athletes.get(a.athlete_id)?.gender;
    if (!g) missingGender += 1;
    return g === gender;
  });
  return { included, missingGender };
}

export function teamsByGender(
  stats: CompetitionStats,
  athletes: ReadonlyMap<string, Athlete>,
  gender: GenderFilter | "Mixed",
): GenderSplit<TeamAggregate> {
  const all = Object.values(stats.teams);
  if (gender === "all") return { included: all, missingGender: 0 };
  let missingGender = 0;
  const included = all.filter((t) => {
    const g = teamGender(t.athlete_ids.map((id) => athletes.get(id)?.gender));
    if (!g) missingGender += 1;
    return g === gender;
  });
  return { included, missingGender };
}

// ---------- séries por torneio ----------

interface Bucket {
  key: string;
  label: string;
  /** Para ordenar: data de início do torneio (ou mês dos amistosos). */
  date: string;
  matches: SeasonMatch[];
}

const monthLabel = (ts: number) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(ts);

/** Uma "etapa" por torneio; amistosos agrupados por mês. */
function bucketsOf(matches: readonly SeasonMatch[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const m of matches) {
    const date = m.tournament ? m.tournament.start_date : new Date(m.match.created_at).toISOString().slice(0, 7);
    const key = m.tournament ? m.tournament.id : `amistosos:${date}`;
    const label = m.tournament ? m.tournament.name : `Amistosos ${monthLabel(m.match.created_at)}`;
    const bucket = map.get(key) ?? { key, label, date, matches: [] };
    bucket.matches.push(m);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const playedBy = (m: Match, athleteId: string, aliases: AliasMap): TeamSide | null => {
  const has = (ids: string[]) => ids.some((id) => resolveAthlete(aliases, id) === athleteId);
  return has(m.team_a.athlete_ids) ? "A" : has(m.team_b.athlete_ids) ? "B" : null;
};

export interface AthleteSeriesPoint {
  key: string;
  label: string;
  matches: number;
  points: number;
  attack: AttackLine;
  aces: number;
  reception: ReceptionLine;
  digs: number;
}

/** Evolução do atleta: um ponto por torneio em que jogou, agregando o torneio inteiro (soma). */
export function athleteSeries(matches: readonly SeasonMatch[], athleteId: string, aliases: AliasMap): AthleteSeriesPoint[] {
  const mine = matches.filter((m) => playedBy(m.match, athleteId, aliases));
  return bucketsOf(mine).flatMap((b) => {
    const a = aggregateCompetition(b.matches, { aliases }).athletes[athleteId];
    if (!a) return [];
    return [{ key: b.key, label: b.label, matches: a.matches, points: a.points, attack: a.attack, aces: a.serve.aces, reception: a.reception, digs: a.digs }];
  });
}

export interface PartnerLine {
  partner_ids: string[];
  pair_key: string;
  matches: number;
  wins: number;
  losses: number;
  /** Números DO ATLETA jogando com este parceiro. */
  points: number;
  attack: AttackLine;
}

/** Com quem o atleta jogou e quanto produziu com cada parceiro (mais jogos primeiro). */
export function athletePartners(matches: readonly SeasonMatch[], athleteId: string, aliases: AliasMap): PartnerLine[] {
  const groups = new Map<string, SeasonMatch[]>();
  for (const m of matches) {
    const side = playedBy(m.match, athleteId, aliases);
    if (!side) continue;
    const key = pairKey(side === "A" ? m.match.team_a.athlete_ids : m.match.team_b.athlete_ids, aliases);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const agg = aggregateCompetition(group, { aliases });
      const me = agg.athletes[athleteId];
      const team = agg.teams[key];
      return {
        partner_ids: key.split("|").filter((id) => id !== athleteId),
        pair_key: key,
        matches: team.matches,
        wins: team.wins,
        losses: team.losses,
        points: me?.points ?? 0,
        attack: me?.attack ?? { attempts: 0, kills: 0, errors: 0, in_play: 0, efficiency: null },
      };
    })
    .sort((a, b) => b.matches - a.matches || b.points - a.points);
}

export interface TeamSeriesPoint {
  key: string;
  label: string;
  matches: number;
  wins: number;
  losses: number;
  side_out: Rate;
  break_point: Rate;
  points_for: number;
  points_against: number;
}

export interface Opponent {
  pair_key: string;
  matches: number;
  wins: number;
  losses: number;
}

/** Desempenho da dupla por torneio (K1 × K2 com num/den) e os confrontos. */
export function teamSeries(matches: readonly SeasonMatch[], key: string, aliases: AliasMap): { series: TeamSeriesPoint[]; opponents: Opponent[] } {
  const sideOf = (m: Match): TeamSide | null =>
    pairKey(m.team_a.athlete_ids, aliases) === key ? "A" : pairKey(m.team_b.athlete_ids, aliases) === key ? "B" : null;
  const mine = matches.filter((m) => sideOf(m.match));

  const series = bucketsOf(mine).map((b) => {
    const t = aggregateCompetition(b.matches, { aliases }).teams[key];
    return {
      key: b.key,
      label: b.label,
      matches: t.matches,
      wins: t.wins,
      losses: t.losses,
      side_out: t.side_out,
      break_point: t.break_point,
      points_for: t.points_for,
      points_against: t.points_against,
    };
  });

  const opponents = new Map<string, Opponent>();
  for (const { match, events } of mine) {
    const side = sideOf(match)!;
    const opp = pairKey(side === "A" ? match.team_b.athlete_ids : match.team_a.athlete_ids, aliases);
    const winner = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server }).winner;
    const o = opponents.get(opp) ?? { pair_key: opp, matches: 0, wins: 0, losses: 0 };
    o.matches += 1;
    if (winner === side) o.wins += 1;
    else if (winner) o.losses += 1;
    opponents.set(opp, o);
  }
  return { series, opponents: [...opponents.values()].sort((a, b) => b.matches - a.matches) };
}

// ---------- como os pontos aconteceram ----------

export type { PointKind };

/**
 * Contagem dos pontos por "como aconteceram" (motivo + detalhe do modo rápido + último toque).
 * `forTeam` (pair_key) limita aos pontos ganhos por essa dupla.
 */
export function pointKinds(matches: readonly SeasonMatch[], aliases: AliasMap, forTeam?: string): PointKind[] {
  function* rallies() {
    for (const { match, events } of matches) {
      const state = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server });
      for (const r of state.rallies) {
        if (forTeam && r.point_to && pairKey(r.point_to === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids, aliases) !== forTeam) continue;
        yield r;
      }
    }
  }
  return rallyPointKinds(rallies());
}

export interface AthleteCompetitionLine {
  /** Id do torneio, ou "friendly" para os amistosos. */
  key: string;
  label: string;
  stats: AthleteAggregate;
}

/**
 * Números da atleta por torneio (Fase 12): cada torneio somado pelo MESMO motor dos rankings
 * (contadores brutos por atleta canônica), com as duplas por onde ela jogou em `team_keys`. Trocar
 * de parceiro não muda nada: a soma das linhas é a temporada dela.
 */
export function athleteByCompetition(matches: readonly SeasonMatch[], athleteId: string, aliases: AliasMap): AthleteCompetitionLine[] {
  const groups = new Map<string, { label: string; first: number; matches: SeasonMatch[] }>();
  for (const m of matches) {
    const key = m.tournament?.id ?? "friendly";
    const g = groups.get(key) ?? { label: m.tournament?.name ?? "Amistosos", first: m.match.created_at, matches: [] };
    g.first = Math.min(g.first, m.match.created_at);
    g.matches.push(m);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .flatMap(([key, g]) => {
      const stats = seasonStats(g.matches, aliases).athletes[athleteId];
      return stats ? [{ key, label: g.label, stats }] : [];
    });
}
