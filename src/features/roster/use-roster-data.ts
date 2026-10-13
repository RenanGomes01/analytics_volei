"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { getDB } from "@/db/client";
import { pairKey, resolveAthlete } from "@/domain/roster/identity";
import type { Team, Tournament, TournamentEntry } from "@/domain/roster/types";
import type { Athlete, Match } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listMatches } from "@/services/match-service";
import { getAliasMap, listAthletes, listTeams } from "@/services/roster-service";
import { listTournaments } from "@/services/tournament-service";

export interface RosterData {
  athletes: Athlete[];
  athleteById: Map<string, Athlete>;
  /** Atletas que não são apelido de outra (os cadastros "de verdade"). */
  canonical: Athlete[];
  aliases: Map<string, string>;
  /** Apelidos de cada canônico (os cadastros unidos a ele). */
  aliasesOf: Map<string, Athlete[]>;
  /** Partidas em que cada canônico jogou. */
  matchCount: Map<string, number>;
  teams: Team[];
  teamByKey: Map<string, Team>;
  matches: Match[];
  tournaments: Tournament[];
  entries: TournamentEntry[];
  tournamentOfMatch: Map<string, Tournament>;
}

/** Tudo do cadastro, reativo ao banco local. `null` enquanto carrega. */
export function useRosterData(): RosterData | null {
  const db = () => getDB();
  const athletes = useLiveQuery(() => listAthletes(db(), LOCAL_TENANT_ID), []);
  const aliases = useLiveQuery(() => getAliasMap(db(), LOCAL_TENANT_ID), []);
  const teams = useLiveQuery(() => listTeams(db(), LOCAL_TENANT_ID), []);
  const matches = useLiveQuery(() => listMatches(db(), LOCAL_TENANT_ID), []);
  const tournaments = useLiveQuery(() => listTournaments(db(), LOCAL_TENANT_ID), []);
  const entries = useLiveQuery(() => db().tournament_entries.where("tenant_id").equals(LOCAL_TENANT_ID).toArray(), []);

  return useMemo(() => {
    if (!athletes || !aliases || !teams || !matches || !tournaments || !entries) return null;
    const athleteById = new Map(athletes.map((a) => [a.id, a]));
    const canonical = athletes.filter((a) => !aliases.has(a.id));
    const aliasesOf = new Map<string, Athlete[]>();
    for (const [alias, target] of aliases) {
      const a = athleteById.get(alias);
      if (a) aliasesOf.set(target, [...(aliasesOf.get(target) ?? []), a]);
    }
    const matchCount = new Map<string, number>();
    for (const m of matches) {
      for (const id of new Set([...m.team_a.athlete_ids, ...m.team_b.athlete_ids].map((x) => resolveAthlete(aliases, x)))) {
        matchCount.set(id, (matchCount.get(id) ?? 0) + 1);
      }
    }
    const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
    const tournamentOfMatch = new Map(
      entries.flatMap((e) => (tournamentById.has(e.tournament_id) ? [[e.match_id, tournamentById.get(e.tournament_id)!] as const] : [])),
    );
    const teamByKey = new Map(teams.map((t) => [pairKey(t.athlete_ids, aliases), t]));
    return { athletes, athleteById, canonical, aliases, aliasesOf, matchCount, teams, teamByKey, matches, tournaments, entries, tournamentOfMatch };
  }, [athletes, aliases, teams, matches, tournaments, entries]);
}
