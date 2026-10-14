import { newId } from "@/lib/id";
import { activeEvents } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import type { Match, Modality, TeamSide } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { createAthlete } from "./athlete-service";
import { enqueue } from "./outbox-service";

export interface CreateMatchInput {
  tenant_id: string;
  modality: Modality;
  team_a: Match["team_a"];
  team_b: Match["team_b"];
  first_server: TeamSide;
}

export async function createMatch(db: ScoutDB, input: CreateMatchInput): Promise<Match> {
  const match: Match = {
    ...input,
    id: newId(),
    rules_version: rulesFor(input.modality).version,
    created_at: Date.now(),
  };
  await db.transaction("rw", db.matches, db.outbox, async () => {
    await db.matches.add(match);
    await enqueue(db, "match", match);
  });
  return match;
}

export interface RosterInput {
  name: string;
  athletes: { name: string; jersey_number?: number }[];
}

export interface CreateMatchWithRosterInput extends Omit<CreateMatchInput, "team_a" | "team_b"> {
  team_a: RosterInput;
  team_b: RosterInput;
}

/** Cria atletas e partida numa única transação: ou tudo é salvo, ou nada. */
export async function createMatchWithRoster(db: ScoutDB, input: CreateMatchWithRosterInput): Promise<Match> {
  return db.transaction("rw", db.athletes, db.matches, db.outbox, async () => {
    const team = async ({ name, athletes }: RosterInput) => {
      const created = [];
      for (const athlete of athletes) created.push(await createAthlete(db, { ...athlete, tenant_id: input.tenant_id }));
      return { name, athlete_ids: created.map((a) => a.id) };
    };
    const team_a = await team(input.team_a);
    const team_b = await team(input.team_b);
    return createMatch(db, { ...input, team_a, team_b });
  });
}

export async function getMatch(db: ScoutDB, tenant_id: string, id: string): Promise<Match | undefined> {
  const match = await db.matches.get(id);
  return match?.tenant_id === tenant_id ? match : undefined;
}

/** Partidas ativas (sem as da lixeira), da mais nova para a mais antiga. */
export async function listMatches(db: ScoutDB, tenant_id: string): Promise<Match[]> {
  const matches = await db.matches.where("tenant_id").equals(tenant_id).toArray();
  return matches.filter((m) => !m.deleted_at).sort((a, b) => b.created_at - a.created_at);
}

/** Lixeira: partidas excluídas, da exclusão mais recente para a mais antiga. */
export async function listDeletedMatches(db: ScoutDB, tenant_id: string): Promise<Match[]> {
  const matches = await db.matches.where("tenant_id").equals(tenant_id).toArray();
  return matches.filter((m) => m.deleted_at).sort((a, b) => b.deleted_at! - a.deleted_at!);
}

async function requireMatch(db: ScoutDB, tenant_id: string, id: string): Promise<Match> {
  const match = await db.matches.get(id);
  if (!match || match.tenant_id !== tenant_id) throw new Error("Partida não encontrada.");
  return match;
}

/**
 * Exclusão lógica: a partida vai para a lixeira e sai de listas e estatísticas. Nada é apagado — os
 * lances ficam no ledger — e o outbox leva a lápide (`delete`) para a nuvem e os outros aparelhos.
 */
export async function deleteMatch(db: ScoutDB, tenant_id: string, id: string, now = Date.now()): Promise<Match> {
  return db.transaction("rw", db.matches, db.outbox, async () => {
    const match = await requireMatch(db, tenant_id, id);
    if (match.deleted_at) return match;
    const updated: Match = { ...match, deleted_at: now, updated_at: now };
    await db.matches.put(updated);
    await enqueue(db, "match", updated, "delete");
    return updated;
  });
}

/** Tira da lixeira (a lápide na nuvem é substituída por um upsert sem `deleted_at`). */
export async function restoreMatch(db: ScoutDB, tenant_id: string, id: string, now = Date.now()): Promise<Match> {
  return db.transaction("rw", db.matches, db.outbox, async () => {
    const match = await requireMatch(db, tenant_id, id);
    if (!match.deleted_at) return match;
    const updated: Match = { ...match, updated_at: now };
    delete updated.deleted_at;
    await db.matches.put(updated);
    await enqueue(db, "match", updated, "upsert");
    return updated;
  });
}

/** Lances que prendem a escalação: toques e fins de rali ainda válidos (anulados não contam). */
export async function countScoutedEvents(db: ScoutDB, tenant_id: string, match_id: string): Promise<number> {
  const events = await db.rally_events
    .where("[match_id+local_seq]")
    .between([match_id, -Infinity], [match_id, Infinity])
    .filter((e) => e.tenant_id === tenant_id)
    .toArray();
  return activeEvents(events).filter((e) => e.kind === "touch" || e.kind === "rally_end").length;
}

/**
 * Corrige a dupla marcada por engano. Só antes do scout: os lances guardam o id de cada atleta e o
 * ledger nunca é reescrito — partida já scouteada se corrige pelo nome da atleta ou "Unir atletas".
 */
export async function updateMatchTeams(
  db: ScoutDB,
  tenant_id: string,
  id: string,
  teams: { team_a?: Match["team_a"]; team_b?: Match["team_b"] },
  now = Date.now(),
): Promise<Match> {
  return db.transaction("rw", db.matches, db.rally_events, db.outbox, async () => {
    const match = await requireMatch(db, tenant_id, id);
    if (match.deleted_at) throw new Error("Partida na lixeira: restaure antes de editar.");
    if ((await countScoutedEvents(db, tenant_id, id)) > 0) {
      throw new Error("Esta partida já tem lances: corrija o nome da atleta no cadastro ou use \"Unir atletas\".");
    }
    const team_a = teams.team_a ?? match.team_a;
    const team_b = teams.team_b ?? match.team_b;
    const ids = [...team_a.athlete_ids, ...team_b.athlete_ids];
    if (new Set(ids).size !== ids.length) throw new Error("A mesma atleta não pode estar nas duas duplas.");
    const updated: Match = { ...match, team_a, team_b, updated_at: now };
    await db.matches.put(updated);
    await enqueue(db, "match", updated, "upsert");
    return updated;
  });
}
