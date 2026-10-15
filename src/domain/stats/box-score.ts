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
  second_ball: { attempts: c.second_ball_attempts, kills: c.second_ball_kills },
});

const serveLine = (c: TouchCounters): ServeLine => ({
  attempts: c.serve_attempts,
  aces: c.aces,
  errors: c.serve_errors,
  errors_net: c.serve_errors_net,
  errors_out: c.serve_errors_out,
});

const receptionLine = (c: TouchCounters): ReceptionLine => ({
  attempts: c.receptions,
  positive: rate(c.reception_positive, c.receptions_rated),
  errors: c.reception_errors,
});

/** Contadores BRUTOS de uma ou mais partidas: somáveis. Porcentagens só existem depois do finalize. */
export interface BoxScoreTally {
  athletes: Map<string, { team: TeamSide; counters: TouchCounters }>;
  teamTouches: Record<TeamSide, TouchCounters>;
  teamRallies: Record<TeamSide, RallyCounters>;
}

/**
 * Etapa 1 — soma os ralis já reconstruídos pelo replay (anulações, sets, sacador e resultado de cada
 * rali), num único passe. Atletas do elenco começam zerados.
 */
export function tallyRallies(rallies: readonly RallyResult[], roster: Roster, filter: StatsFilter = ALL_SETS): BoxScoreTally {
  const athletes = new Map<string, { team: TeamSide; counters: TouchCounters }>();
  for (const team of TEAMS) {
    for (const id of roster[team]) athletes.set(id, { team, counters: emptyTouchCounters() });
  }
  const teamTouches: Record<TeamSide, TouchCounters> = { A: emptyTouchCounters(), B: emptyTouchCounters() };
  const teamRallies: Record<TeamSide, RallyCounters> = { A: emptyRallyCounters(), B: emptyRallyCounters() };

  const selected = filter.set === "all" ? rallies : rallies.filter((r) => r.set_number === filter.set);
  for (const rally of selected) {
    tallyTouches(rally, (team, athlete_id, delta) => {
      let entry = athletes.get(athlete_id);
      if (!entry) {
        entry = { team, counters: emptyTouchCounters() }; // atleta fora do elenco: não perde o lance
        athletes.set(athlete_id, entry);
      }
      addCounters(entry.counters, delta);
      addCounters(teamTouches[team], delta);
      // Ataque que explorou o bloqueio: conta contra a equipe que bloqueou.
      if (delta.attack_block_out_kills) teamTouches[team === "A" ? "B" : "A"].blocks_exploited += delta.attack_block_out_kills;
    });
    tallyServeFaced(rally, roster, athletes, teamTouches);
    tallyRally(rally, teamRallies);
  }
  return { athletes, teamTouches, teamRallies };
}

/**
 * Saque que chegou à equipe (não foi erro): base do "alvo do saque". Conta para a equipe e para cada
 * atleta do elenco dela — quem recebeu mais desses saques foi a mais sacada.
 */
function tallyServeFaced(
  rally: RallyResult,
  roster: Roster,
  athletes: BoxScoreTally["athletes"],
  teamTouches: BoxScoreTally["teamTouches"],
): void {
  const serve = rally.touches[0];
  if (!serve || serve.skill !== "serve" || serve.quality === "=") return;
  const receiving: TeamSide = serve.team === "A" ? "B" : "A";
  teamTouches[receiving].serves_faced += 1;
  for (const id of roster[receiving]) {
    const entry = athletes.get(id);
    if (entry) entry.counters.serves_faced += 1;
  }
}

export type AthleteLines = Omit<AthleteStats, "athlete_id" | "team">;

/** Etapa 2 — linhas e porcentagens de um atleta a partir dos contadores (somados ou não). */
export function athleteLines(c: TouchCounters): AthleteLines {
  return {
    points: c.kills + c.aces + c.blocks,
    attack: attackLine(c),
    serve: serveLine(c),
    reception: receptionLine(c),
    blocks: c.blocks,
    digs: c.digs,
    errors: c.errors,
    counters: { ...c },
  };
}

export const finalizeAthlete = (athlete_id: string, team: TeamSide, c: TouchCounters): AthleteStats => ({
  athlete_id,
  team,
  ...athleteLines(c),
});

/** Etapa 2 — linhas e porcentagens de uma equipe: divide só depois de somar. */
export function finalizeTeam(c: TouchCounters, r: RallyCounters): TeamStats {
  return {
    points: { ...r.points },
    attack: attackLine(c),
    serve: serveLine(c),
    reception: receptionLine(c),
    blocks: c.blocks,
    digs: c.digs,
    errors: c.errors,
    side_out: rate(r.receiving.won, r.receiving.total),
    break_point: rate(r.serving.won, r.serving.total),
    counters: { ...c },
  };
}

/** Box Score de uma partida = finalize(tally). Puro e determinístico. */
export function boxScoreFromRallies(
  rallies: readonly RallyResult[],
  roster: Roster,
  filter: StatsFilter = ALL_SETS,
): BoxScore {
  const tally = tallyRallies(rallies, roster, filter);
  const athletes: Record<string, AthleteStats> = {};
  for (const [id, { team, counters }] of tally.athletes) athletes[id] = finalizeAthlete(id, team, counters);
  return {
    filter,
    sets_available: [...new Set(rallies.map((r) => r.set_number))].sort((a, b) => a - b),
    teams: {
      A: finalizeTeam(tally.teamTouches.A, tally.teamRallies.A),
      B: finalizeTeam(tally.teamTouches.B, tally.teamRallies.B),
    },
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
