import { replayMatch, type RallyResult } from "../rally/replay";
import type { ModalityRules } from "../rules/modality";
import type { RallyEvent, TeamSide } from "../types";
import { efficiency, rate } from "./rate";
import { emptyRallyCounters, tallyRally, type RallyCounters } from "./rally-lines";
import { addCounters, emptyTouchCounters, tallyTouches, type TouchCounters } from "./touch-lines";
import type { AthleteStats, AttackLine, BoxScore, ReceptionLine, ServeLine, StatsFilter, TeamStats } from "./types";

export type Roster = Record<TeamSide, string[]>;

export interface BoxScoreOptions {
  rules: ModalityRules;
  first_server: TeamSide;
  roster: Roster;
}

const ALL_SETS: StatsFilter = { set: "all" };
const TEAMS: TeamSide[] = ["A", "B"];

const attackLine = (c: TouchCounters): AttackLine => ({
  attempts: c.attack_attempts,
  kills: c.kills,
  errors: c.attack_errors,
  in_play: c.attack_attempts - c.kills - c.attack_errors,
  efficiency: efficiency(c.kills, c.attack_errors, c.attack_attempts),
});

const serveLine = (c: TouchCounters): ServeLine => ({ attempts: c.serve_attempts, aces: c.aces, errors: c.serve_errors });

const receptionLine = (c: TouchCounters): ReceptionLine => ({
  attempts: c.receptions,
  positive: rate(c.reception_positive, c.receptions),
  errors: c.reception_errors,
});

/**
 * Núcleo do Box Score: agrega os ralis já reconstruídos pelo replay (anulações, sets, sacador e
 * resultado de cada rali), num único passe. Puro e determinístico.
 */
export function boxScoreFromRallies(
  rallies: readonly RallyResult[],
  roster: Roster,
  filter: StatsFilter = ALL_SETS,
): BoxScore {
  const athleteCounters = new Map<string, { team: TeamSide; counters: TouchCounters }>();
  for (const team of TEAMS) {
    for (const id of roster[team]) athleteCounters.set(id, { team, counters: emptyTouchCounters() });
  }
  const teamTouches: Record<TeamSide, TouchCounters> = { A: emptyTouchCounters(), B: emptyTouchCounters() };
  const teamRallies: Record<TeamSide, RallyCounters> = { A: emptyRallyCounters(), B: emptyRallyCounters() };

  const selected = filter.set === "all" ? rallies : rallies.filter((r) => r.set_number === filter.set);
  for (const rally of selected) {
    tallyTouches(rally, (team, athlete_id, delta) => {
      let entry = athleteCounters.get(athlete_id);
      if (!entry) {
        entry = { team, counters: emptyTouchCounters() }; // atleta fora do elenco: não perde o lance
        athleteCounters.set(athlete_id, entry);
      }
      addCounters(entry.counters, delta);
      addCounters(teamTouches[team], delta);
    });
    tallyRally(rally, teamRallies);
  }

  const athletes: Record<string, AthleteStats> = {};
  for (const [athlete_id, { team, counters: c }] of athleteCounters) {
    athletes[athlete_id] = {
      athlete_id,
      team,
      points: c.kills + c.aces + c.blocks,
      attack: attackLine(c),
      serve: serveLine(c),
      reception: receptionLine(c),
      blocks: c.blocks,
      digs: c.digs,
      errors: c.errors,
    };
  }

  const teamStats = (team: TeamSide): TeamStats => {
    const c = teamTouches[team];
    const r = teamRallies[team];
    return {
      points: r.points,
      attack: attackLine(c),
      serve: serveLine(c),
      reception: receptionLine(c),
      blocks: c.blocks,
      digs: c.digs,
      errors: c.errors,
      side_out: rate(r.receiving.won, r.receiving.total),
      break_point: rate(r.serving.won, r.serving.total),
    };
  };

  return {
    filter,
    sets_available: [...new Set(rallies.map((r) => r.set_number))].sort((a, b) => a - b),
    teams: { A: teamStats("A"), B: teamStats("B") },
    athletes,
  };
}

/** Box Score a partir da lista crua de eventos do ledger. */
export function computeBoxScore(
  events: readonly RallyEvent[],
  { rules, first_server, roster }: BoxScoreOptions,
  filter: StatsFilter = ALL_SETS,
): BoxScore {
  return boxScoreFromRallies(replayMatch(events, { rules, first_server }).rallies, roster, filter);
}
