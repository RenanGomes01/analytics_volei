import type { Athlete } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { enqueue } from "./outbox-service";

export interface CreateAthleteInput {
  tenant_id: string;
  name: string;
  jersey_number?: number;
}

export async function createAthlete(db: ScoutDB, input: CreateAthleteInput): Promise<Athlete> {
  const athlete: Athlete = { ...input, id: crypto.randomUUID(), created_at: Date.now() };
  await db.transaction("rw", db.athletes, db.outbox, async () => {
    await db.athletes.add(athlete);
    await enqueue(db, "athlete", athlete);
  });
  return athlete;
}

export async function getAthlete(db: ScoutDB, tenant_id: string, id: string): Promise<Athlete | undefined> {
  const athlete = await db.athletes.get(id);
  return athlete?.tenant_id === tenant_id ? athlete : undefined;
}

export async function listAthletes(db: ScoutDB, tenant_id: string): Promise<Athlete[]> {
  return db.athletes.where("[tenant_id+name]").between([tenant_id, ""], [tenant_id, "￿"]).toArray();
}
