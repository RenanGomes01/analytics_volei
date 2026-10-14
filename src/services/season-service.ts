import type { Team, Tournament } from "@/domain/roster/types";
import type { SeasonMatch } from "@/domain/stats/season";
import type { Athlete, RallyEvent } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { getAliasMap, listTeams } from "./roster-service";
import { listTournaments } from "./tournament-service";

export interface SeasonData {
  matches: SeasonMatch[];
  tournaments: Tournament[];
  athletes: Map<string, Athlete>;
  teams: Team[];
  aliases: Map<string, string>;
}

/**
 * Tudo que a análise de temporada precisa, numa leitura: partidas (com o torneio de cada uma),
 * TODOS os lances do tenant (índice tenant_id, agrupados em memória), atletas, duplas e aliases.
 * O recorte por ano/categoria/gênero é feito no domínio (src/domain/stats/season.ts).
 */
export async function loadSeason(db: ScoutDB, tenant_id: string): Promise<SeasonData> {
  return db.transaction(
    "r",
    [db.matches, db.rally_events, db.tournaments, db.tournament_entries, db.athletes, db.teams, db.athlete_aliases],
    async () => {
      const [matches, events, tournaments, entries, athletes, teams, aliases] = await Promise.all([
        db.matches.where("tenant_id").equals(tenant_id).toArray(),
        db.rally_events.where("tenant_id").equals(tenant_id).toArray(),
        listTournaments(db, tenant_id),
        db.tournament_entries.where("tenant_id").equals(tenant_id).toArray(),
        db.athletes.where("tenant_id").equals(tenant_id).toArray(),
        listTeams(db, tenant_id),
        getAliasMap(db, tenant_id),
      ]);

      const eventsByMatch = new Map<string, RallyEvent[]>();
      for (const e of events) {
        const list = eventsByMatch.get(e.match_id);
        if (list) list.push(e);
        else eventsByMatch.set(e.match_id, [e]);
      }
      const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
      const tournamentOfMatch = new Map(entries.map((e) => [e.match_id, tournamentById.get(e.tournament_id) ?? null]));
      const phaseOfMatch = new Map(entries.flatMap((e) => (e.phase ? [[e.match_id, e.phase] as const] : [])));

      return {
        matches: matches
          .sort((a, b) => a.created_at - b.created_at)
          .map((match) => {
            const phase = phaseOfMatch.get(match.id);
            return { match, events: eventsByMatch.get(match.id) ?? [], tournament: tournamentOfMatch.get(match.id) ?? null, ...(phase ? { phase } : {}) };
          }),
        tournaments,
        athletes: new Map(athletes.map((a) => [a.id, a])),
        teams,
        aliases,
      };
    },
  );
}
