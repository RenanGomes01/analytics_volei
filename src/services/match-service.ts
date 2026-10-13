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
    id: crypto.randomUUID(),
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

export async function listMatches(db: ScoutDB, tenant_id: string): Promise<Match[]> {
  const matches = await db.matches.where("tenant_id").equals(tenant_id).toArray();
  return matches.sort((a, b) => b.created_at - a.created_at);
}
