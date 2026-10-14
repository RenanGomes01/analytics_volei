import { newId } from "@/lib/id";
import { rulesFor } from "@/domain/rules/modality";
import type { Tournament, TournamentCategory, TournamentEntry, TournamentPhase } from "@/domain/roster/types";
import type { Match, Modality, TeamSide } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { enqueue } from "./outbox-service";

/** Torneios (etapas) e o vínculo partida → torneio (Fase 5). */

export interface CreateTournamentInput {
  name: string;
  location?: string;
  start_date: string;
  end_date?: string;
  modality: Modality;
  category?: TournamentCategory;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createTournament(
  db: ScoutDB,
  tenant_id: string,
  input: CreateTournamentInput,
  now = Date.now(),
): Promise<Tournament> {
  const name = input.name.trim();
  if (!name) throw new Error("Dê um nome ao torneio.");
  if (!ISO_DATE.test(input.start_date)) throw new Error("Data de início inválida.");
  if (input.end_date && (!ISO_DATE.test(input.end_date) || input.end_date < input.start_date)) {
    throw new Error("A data de fim deve ser igual ou depois da de início.");
  }
  const tournament: Tournament = {
    id: newId(),
    tenant_id,
    name,
    start_date: input.start_date,
    modality: input.modality,
    created_at: now,
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
    ...(input.end_date ? { end_date: input.end_date } : {}),
    ...(input.category ? { category: input.category } : {}),
  };
  await db.transaction("rw", db.tournaments, db.outbox, async () => {
    await db.tournaments.add(tournament);
    await enqueue(db, "tournament", tournament);
  });
  return tournament;
}

/** Edita nome, local e categoria do torneio (cadastro: upsert no outbox). */
export async function updateTournament(
  db: ScoutDB,
  tenant_id: string,
  id: string,
  changes: { name?: string; location?: string; category?: TournamentCategory | null },
): Promise<Tournament> {
  return db.transaction("rw", db.tournaments, db.outbox, async () => {
    const current = await db.tournaments.get(id);
    if (!current || current.tenant_id !== tenant_id) throw new Error("Torneio não encontrado.");
    const updated: Tournament = { ...current };
    if (changes.name !== undefined) {
      if (!changes.name.trim()) throw new Error("Dê um nome ao torneio.");
      updated.name = changes.name.trim();
    }
    if (changes.location !== undefined) {
      if (changes.location.trim()) updated.location = changes.location.trim();
      else delete updated.location;
    }
    if (changes.category === null) delete updated.category;
    else if (changes.category !== undefined) updated.category = changes.category;
    await db.tournaments.put(updated);
    await enqueue(db, "tournament", updated, "upsert");
    return updated;
  });
}

export async function listTournaments(db: ScoutDB, tenant_id: string): Promise<Tournament[]> {
  const all = await db.tournaments.where("tenant_id").equals(tenant_id).toArray();
  return all.sort((a, b) => b.start_date.localeCompare(a.start_date) || b.created_at - a.created_at);
}

export async function getTournament(db: ScoutDB, tenant_id: string, id: string): Promise<Tournament | undefined> {
  const t = await db.tournaments.get(id);
  return t?.tenant_id === tenant_id ? t : undefined;
}

/** Liga uma partida (nova ou do MVP) a um torneio. Idempotente; uma partida pertence a um torneio só. */
export async function addMatchToTournament(
  db: ScoutDB,
  tenant_id: string,
  { tournament_id, match_id }: { tournament_id: string; match_id: string },
  now = Date.now(),
): Promise<TournamentEntry> {
  return db.transaction("rw", [db.tournaments, db.matches, db.tournament_entries, db.outbox], async () => {
    const [tournament, match] = await Promise.all([db.tournaments.get(tournament_id), db.matches.get(match_id)]);
    if (!tournament || tournament.tenant_id !== tenant_id) throw new Error("Torneio não encontrado.");
    if (!match || match.tenant_id !== tenant_id) throw new Error("Partida não encontrada.");
    if (match.modality !== tournament.modality) throw new Error("A partida é de outra modalidade.");

    const current = await db.tournament_entries.where("match_id").equals(match_id).first();
    if (current?.tournament_id === tournament_id) return current;
    if (current) throw new Error("Esta partida já pertence a outro torneio.");

    const entry: TournamentEntry = { id: `${tournament_id}:${match_id}`, tenant_id, tournament_id, match_id, created_at: now };
    await db.tournament_entries.add(entry);
    await enqueue(db, "tournament_entry", entry);
    return entry;
  });
}

/** Classifica (ou corrige) a fase de uma partida no torneio. `null` limpa. Upsert no outbox. */
export async function setMatchPhase(db: ScoutDB, tenant_id: string, entry_id: string, phase: TournamentPhase | null): Promise<TournamentEntry> {
  return db.transaction("rw", db.tournament_entries, db.outbox, async () => {
    const entry = await db.tournament_entries.get(entry_id);
    if (!entry || entry.tenant_id !== tenant_id) throw new Error("Vínculo não encontrado.");
    const updated: TournamentEntry = { ...entry };
    if (phase) updated.phase = phase;
    else delete updated.phase;
    await db.tournament_entries.put(updated);
    await enqueue(db, "tournament_entry", updated, "upsert");
    return updated;
  });
}

export async function removeMatchFromTournament(db: ScoutDB, tenant_id: string, entry_id: string): Promise<void> {
  await db.transaction("rw", db.tournament_entries, db.outbox, async () => {
    const entry = await db.tournament_entries.get(entry_id);
    if (!entry || entry.tenant_id !== tenant_id) throw new Error("Vínculo não encontrado.");
    await db.tournament_entries.delete(entry_id);
    await enqueue(db, "tournament_entry", entry, "delete");
  });
}

export async function listTournamentMatches(db: ScoutDB, tenant_id: string, tournament_id: string): Promise<Match[]> {
  const entries = await db.tournament_entries.where("tournament_id").equals(tournament_id).toArray();
  const matches = await db.matches.bulkGet(entries.map((e) => e.match_id));
  return matches
    .filter((m): m is Match => !!m && m.tenant_id === tenant_id)
    .sort((a, b) => a.created_at - b.created_at);
}

export interface CreateMatchFromTeamsInput {
  tenant_id: string;
  team_a_id: string;
  team_b_id: string;
  first_server: TeamSide;
  /** Sem torneio: a modalidade vem das duplas. */
  tournament_id?: string;
  /** Fase no torneio (ignorada sem torneio: amistoso). */
  phase?: TournamentPhase;
}

/**
 * Cria a partida a partir de duplas do cadastro: o retrato (nome + atletas) vai para a partida,
 * e o vínculo com o torneio e o outbox são gravados na mesma transação. Não recria atletas.
 */
export async function createMatchFromTeams(db: ScoutDB, input: CreateMatchFromTeamsInput, now = Date.now()): Promise<Match> {
  const { tenant_id } = input;
  return db.transaction("rw", [db.teams, db.tournaments, db.matches, db.tournament_entries, db.outbox], async () => {
    const [a, b] = await db.teams.bulkGet([input.team_a_id, input.team_b_id]);
    if (!a || !b || a.tenant_id !== tenant_id || b.tenant_id !== tenant_id) throw new Error("Dupla não encontrada.");
    if (a.id === b.id || a.athlete_ids.some((id) => b.athlete_ids.includes(id))) {
      throw new Error("A mesma atleta não pode estar nas duas duplas.");
    }
    if (a.modality !== b.modality) throw new Error("As duplas são de modalidades diferentes.");

    let tournament: Tournament | undefined;
    if (input.tournament_id) {
      tournament = await db.tournaments.get(input.tournament_id);
      if (!tournament || tournament.tenant_id !== tenant_id) throw new Error("Torneio não encontrado.");
      if (tournament.modality !== a.modality) throw new Error("As duplas são de outra modalidade que o torneio.");
    }

    const match: Match = {
      id: newId(),
      tenant_id,
      modality: a.modality,
      rules_version: rulesFor(a.modality).version,
      team_a: { name: a.name, athlete_ids: [...a.athlete_ids] },
      team_b: { name: b.name, athlete_ids: [...b.athlete_ids] },
      first_server: input.first_server,
      created_at: now,
    };
    await db.matches.add(match);
    await enqueue(db, "match", match);
    if (tournament) {
      const entry: TournamentEntry = {
        id: `${tournament.id}:${match.id}`,
        tenant_id,
        tournament_id: tournament.id,
        match_id: match.id,
        created_at: now,
        ...(input.phase ? { phase: input.phase } : {}),
      };
      await db.tournament_entries.add(entry);
      await enqueue(db, "tournament_entry", entry);
    }
    return match;
  });
}
