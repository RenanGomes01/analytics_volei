import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_V1, ScoutDB } from "@/db/schema";
import { exportMatch } from "@/services/export/export-service";
import { createMatchWithRoster } from "@/services/match-service";
import { appendTouch, listMatchEvents } from "@/services/rally-ledger-service";

const V2_OUTBOX = "mutation_id, tenant_id, status, [status+created_at], [status+next_attempt_at], entity_id";
let name: string;

afterEach(async () => {
  await Dexie.delete(name);
});

describe("migração Dexie v2 → v3 (cadastro central)", () => {
  it("não altera nenhuma linha do MVP e o JSON exportado mantém o mesmo hash", async () => {
    name = `mig-${crypto.randomUUID()}`;
    // Banco do MVP: grava com o ScoutDB atual e "volta" o schema para v2 abrindo só as tabelas antigas.
    const mvp = new ScoutDB(name);
    const match = await createMatchWithRoster(mvp, {
      tenant_id: "local",
      modality: "beach",
      first_server: "A",
      team_a: { name: "A", athletes: [{ name: "Renan" }, { name: "Pedro" }] },
      team_b: { name: "B", athletes: [{ name: "André" }, { name: "George" }] },
    });
    const scope = { tenant_id: "local", match_id: match.id };
    await appendTouch(mvp, scope, { team: "A", athlete_id: match.team_a.athlete_ids[0], skill: "serve", quality: "#" });
    const NOW = 1_800_000_000_000;
    const before = {
      hash: (await exportMatch(mvp, scope, { now: NOW })).envelope.integrity.content_hash,
      events: await listMatchEvents(mvp, scope),
      athletes: await mvp.athletes.toArray(),
      matches: await mvp.matches.toArray(),
      outbox: await mvp.outbox.toArray(),
    };
    mvp.close();

    // Simula o banco v2 de verdade: recria só com as tabelas da v2 e as mesmas linhas.
    await Dexie.delete(name);
    const v2 = new Dexie(name);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores({ outbox: V2_OUTBOX });
    await v2.table("matches").bulkAdd(before.matches);
    await v2.table("athletes").bulkAdd(before.athletes);
    await v2.table("rally_events").bulkAdd(before.events);
    await v2.table("outbox").bulkAdd(before.outbox);
    expect(v2.verno).toBe(2);
    v2.close();

    const v3 = new ScoutDB(name);
    expect(await listMatchEvents(v3, scope)).toEqual(before.events);
    expect(await v3.athletes.toArray()).toEqual(before.athletes);
    expect(await v3.matches.toArray()).toEqual(before.matches);
    expect(await v3.outbox.toArray()).toEqual(before.outbox);
    expect([await v3.teams.count(), await v3.tournaments.count(), await v3.tournament_entries.count(), await v3.athlete_aliases.count()]).toEqual([0, 0, 0, 0]);
    expect(v3.verno).toBeGreaterThanOrEqual(3);
    // A chave do aparelho é nova (a meta não foi copiada), mas o CONTEÚDO assinado é idêntico.
    expect((await exportMatch(v3, scope, { now: NOW })).envelope.integrity.content_hash).toBe(before.hash);
    v3.close();
  });
});
