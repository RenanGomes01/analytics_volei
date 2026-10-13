import { replayMatch } from "../rally/replay";
import { pairKey, resolveAthlete, type AliasMap } from "../roster/identity";
import { rulesFor } from "../rules/modality";
import type { Match, RallyEvent, TeamSide } from "../types";
import { athleteLines, finalizeTeam, tallyRallies } from "./box-score";
import { addRallyCounters, emptyRallyCounters, type RallyCounters } from "./rally-lines";
import { addCounters, emptyTouchCounters, type TouchCounters } from "./touch-lines";
import type { AthleteStats, TeamStats } from "./types";

/**
 * Estatísticas de várias partidas (etapa, competição, temporada). Regra estatística: soma os
 * CONTADORES BRUTOS (numeradores e denominadores) e só divide no final — nunca faz média de
 * porcentagens. Atletas são somados pelo id canônico (aliases) e duplas pelo pair_key.
 */

export interface CompetitionMatch {
  match: Match;
  events: readonly RallyEvent[];
}

export interface AthleteAggregate extends Omit<AthleteStats, "team"> {
  /** Partidas em que o atleta estava no elenco. */
  matches: number;
  /** Duplas (pair_key) pelas quais jogou. */
  team_keys: string[];
}

export interface TeamAggregate extends TeamStats {
  pair_key: string;
  /** Ids canônicos. */
  athlete_ids: string[];
  /** Nome no retrato da partida mais recente (a tela pode trocar pelo nome do cadastro). */
  name: string;
  matches: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  points_for: number;
  points_against: number;
}

export interface CompetitionStats {
  athletes: Record<string, AthleteAggregate>;
  teams: Record<string, TeamAggregate>;
  totals: { matches: number; finished: number; sets: number; rallies: number; points: number };
}

interface TeamAcc {
  athlete_ids: string[];
  name: string;
  name_at: number;
  touches: TouchCounters;
  rallies: RallyCounters;
  matches: number;
  wins: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  points_for: number;
  points_against: number;
}

const other = (t: TeamSide): TeamSide => (t === "A" ? "B" : "A");

export function aggregateCompetition(
  matches: readonly CompetitionMatch[],
  { aliases = new Map() }: { aliases?: AliasMap } = {},
): CompetitionStats {
  const athleteAcc = new Map<string, { counters: TouchCounters; matches: number; team_keys: Set<string> }>();
  const teamAcc = new Map<string, TeamAcc>();
  const totals = { matches: 0, finished: 0, sets: 0, rallies: 0, points: 0 };

  for (const { match, events } of matches) {
    const state = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server });
    const roster = { A: match.team_a.athlete_ids, B: match.team_b.athlete_ids };
    const tally = tallyRallies(state.rallies, roster);

    totals.matches += 1;
    if (state.winner) totals.finished += 1;
    totals.sets += state.sets.filter((s) => s.score.A + s.score.B > 0).length;
    totals.rallies += state.rallies.filter((r) => r.point_to).length;

    const keyOf = { A: pairKey(roster.A, aliases), B: pairKey(roster.B, aliases) };

    // Atletas: somados pelo id canônico.
    const seenInMatch = new Set<string>();
    for (const [id, { team, counters }] of tally.athletes) {
      const canonical = resolveAthlete(aliases, id);
      const acc = athleteAcc.get(canonical) ?? { counters: emptyTouchCounters(), matches: 0, team_keys: new Set() };
      addCounters(acc.counters, counters);
      if (!seenInMatch.has(canonical) && roster[team].includes(id)) {
        acc.matches += 1;
        acc.team_keys.add(keyOf[team]);
        seenInMatch.add(canonical);
      }
      athleteAcc.set(canonical, acc);
    }

    // Duplas: somadas pelo pair_key, com V/D, sets e pontos pró/contra.
    for (const side of ["A", "B"] as const) {
      const key = keyOf[side];
      const snapshot = side === "A" ? match.team_a : match.team_b;
      const acc: TeamAcc = teamAcc.get(key) ?? {
        athlete_ids: key.split("|"),
        name: snapshot.name,
        name_at: -Infinity,
        touches: emptyTouchCounters(),
        rallies: emptyRallyCounters(),
        matches: 0,
        wins: 0,
        losses: 0,
        sets_won: 0,
        sets_lost: 0,
        points_for: 0,
        points_against: 0,
      };
      if (match.created_at >= acc.name_at) {
        acc.name = snapshot.name;
        acc.name_at = match.created_at;
      }
      addCounters(acc.touches, tally.teamTouches[side]);
      addRallyCounters(acc.rallies, tally.teamRallies[side]);
      acc.matches += 1;
      if (state.winner === side) acc.wins += 1;
      else if (state.winner === other(side)) acc.losses += 1;
      for (const set of state.sets) {
        if (set.winner === side) acc.sets_won += 1;
        else if (set.winner === other(side)) acc.sets_lost += 1;
        acc.points_for += set.score[side];
        acc.points_against += set.score[other(side)];
      }
      teamAcc.set(key, acc);
    }
    totals.points += state.sets.reduce((sum, s) => sum + s.score.A + s.score.B, 0);
  }

  const athletes: Record<string, AthleteAggregate> = {};
  for (const [id, acc] of athleteAcc) {
    athletes[id] = { athlete_id: id, ...athleteLines(acc.counters), matches: acc.matches, team_keys: [...acc.team_keys] };
  }

  const teams: Record<string, TeamAggregate> = {};
  for (const [key, acc] of teamAcc) {
    teams[key] = {
      ...finalizeTeam(acc.touches, acc.rallies),
      pair_key: key,
      athlete_ids: acc.athlete_ids,
      name: acc.name,
      matches: acc.matches,
      wins: acc.wins,
      losses: acc.losses,
      sets_won: acc.sets_won,
      sets_lost: acc.sets_lost,
      points_for: acc.points_for,
      points_against: acc.points_against,
    };
  }

  return { athletes, teams, totals };
}
