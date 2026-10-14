"use client";

import { useVisibleLiveQuery } from "@/lib/use-visible-live-query";
import { useMemo } from "react";
import { getDB } from "@/db/client";
import { replayMatch, type MatchState } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import { aggregateCompetition, type CompetitionStats } from "@/domain/stats/aggregate";
import { matchesPhase, type PhaseFilter, type TournamentPhase } from "@/domain/roster/types";
import type { Match, RallyEvent } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listMatchEvents } from "@/services/rally-ledger-service";
import { getTournament, listTournamentMatches } from "@/services/tournament-service";

export interface CompetitionData {
  tournament: NonNullable<Awaited<ReturnType<typeof getTournament>>>;
  /** Todas as partidas do torneio (a lista não é filtrada pela fase). */
  matches: { match: Match; events: RallyEvent[]; state: MatchState; entry_id: string; phase?: TournamentPhase }[];
  /** Agregação só das partidas da fase escolhida. */
  stats: CompetitionStats;
}

/**
 * Dados do torneio, reativos ao banco local: partidas vinculadas → lances de todas → agregação.
 * `undefined` = carregando; `null` = torneio não encontrado.
 */
export function useCompetitionData(tournamentId: string, aliases: ReadonlyMap<string, string> | undefined, phase: PhaseFilter = "all") {
  const tournament = useVisibleLiveQuery(
    async () => (await getTournament(getDB(), LOCAL_TENANT_ID, tournamentId)) ?? null,
    [tournamentId],
  );
  const loaded = useVisibleLiveQuery(async () => {
    const db = getDB();
    const matches = await listTournamentMatches(db, LOCAL_TENANT_ID, tournamentId);
    const entries = await db.tournament_entries.where("tournament_id").equals(tournamentId).toArray();
    const entryOf = new Map(entries.map((e) => [e.match_id, e]));
    return Promise.all(
      matches.map(async (match) => ({
        match,
        entry_id: entryOf.get(match.id)?.id ?? "",
        phase: entryOf.get(match.id)?.phase,
        events: await listMatchEvents(db, { tenant_id: LOCAL_TENANT_ID, match_id: match.id }),
      })),
    );
  }, [tournamentId]);

  return useMemo((): CompetitionData | null | undefined => {
    if (tournament === null) return null;
    if (!tournament || !loaded || !aliases) return undefined;
    const matches = loaded.map((m) => ({
      ...m,
      state: replayMatch(m.events, { rules: rulesFor(m.match.modality), first_server: m.match.first_server }),
    }));
    const selected = loaded.filter((m) => matchesPhase(m.phase, phase));
    return { tournament, matches, stats: aggregateCompetition(selected, { aliases }) };
  }, [tournament, loaded, aliases, phase]);
}
