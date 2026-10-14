import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_V1, ScoutDB } from "@/db/schema";
import { createMatchWithRoster } from "@/services/match-service";
import { appendTouch } from "@/services/rally-ledger-service";
import { athleteUsage, findOrCreateTeam } from "@/services/roster-service";

/** Dexie v3 → v4 (Fase 13): só índices novos; nenhuma linha muda e as buscas por índice funcionam. */

const V2_OUTBOX = "mutation_id, tenant_id, status, [status+created_at], [status+next_attempt_at], entity_id";
const V3 = {
  teams: "id, tenant_id, [tenant_id+pair_key]",
  tournaments: "id, tenant_id, start_date",
  tournament_entries: "id, tenant_id, tournament_id, match_id",
  athlete_aliases: "alias_id, tenant_id, canonical_id",
};
let name: string;
afterEach(async () => {
  await Dexie.delete(name);
});

describe("migração Dexie v3 → v4 (índices de atleta)", () => {
  it("preserva todas as linhas e passa a responder 'tem lances?' e 'em que duplas?' por índice", async () => {
    name = `mig4-${crypto.randomUUID()}`;
    const src = new ScoutDB(name);
    const match = await createMatchWithRoster(src, {
      tenant_id: "local",
      modality: "beach",
      first_server: "A",
      team_a: { name: "A", athletes: [{ name: "Renan" }, { name: "Pedro" }] },
      team_b: { name: "B", athletes: [{ name: "André" }, { name: "George" }] },
    });
    const [renan, pedro] = match.team_a.athlete_ids;
    await appendTouch(src, { tenant_id: "local", match_id: match.id }, { team: "A", athlete_id: renan, skill: "serve", quality: "#" });
    const team = await findOrCreateTeam(src, "local", { athlete_ids: [renan, pedro], modality: "beach" });
    const tables = ["matches", "athletes", "rally_events", "outbox", "teams"] as const;
    const before = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await src.table(t).toArray()] as const)));
    src.close();

    // Banco v3 de verdade, sem os índices novos.
    await Dexie.delete(name);
    const v3 = new Dexie(name);
    v3.version(1).stores(SCHEMA_V1);
    v3.version(2).stores({ outbox: V2_OUTBOX });
    v3.version(3).stores(V3);
    for (const t of tables) await v3.table(t).bulkAdd(before[t]);
    expect(v3.verno).toBe(3);
    v3.close();

    const v4 = new ScoutDB(name);
    for (const t of tables) expect(await v4.table(t).toArray(), t).toEqual(before[t]);
    expect(v4.verno).toBe(4);
    expect((await v4.rally_events.where("athlete_id").equals(renan).toArray()).map((e) => e.id)).toHaveLength(1);
    expect((await v4.teams.where("athlete_ids").equals(pedro).toArray()).map((t) => t.id)).toEqual([team.id]);

    const usage = await athleteUsage(v4, "local", renan);
    expect(usage).toMatchObject({ matches: 1, merged: false });
    expect(usage.teams.map((t) => t.id)).toEqual([team.id]);
    v4.close();
  });
});
