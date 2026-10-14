import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { createAthlete } from "@/services/athlete-service";
import { createMatch, deleteMatch } from "@/services/match-service";
import { listPending } from "@/services/outbox-service";
import { updateAthlete } from "@/services/roster-service";
import { retryPendingNow } from "@/services/sync/account-service";
import { getPullCursor, runPull } from "@/services/sync/pull-service";
import { dismissEntry, retryEntry, skipHead, acceptRemote } from "@/services/sync/recovery-service";
import { SupabaseTransport } from "@/services/sync/supabase-transport";
import { runSyncCycle } from "@/services/sync/sync-engine";
import { getSyncSummary, SKIP_AFTER_ATTEMPTS } from "@/services/sync/sync-summary";
import { FakeSupabase } from "../helpers/fake-supabase";

/** Fase 10: uma falha nunca trava a fila em silêncio, e cada falha tem um caminho de recuperação. */

vi.setConfig({ testTimeout: 60_000 });

const T = "local";
const dbs: ScoutDB[] = [];
const newDb = () => {
  const db = new ScoutDB(`recovery-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

const syncNow = async (db: ScoutDB, transport: SupabaseTransport) => {
  await retryPendingNow(db, T);
  return runSyncCycle(db, transport, { tenant_id: T });
};

/** 20 atletas; a nuvem já tem a 8ª com outro conteúdo (editada em outro aparelho). */
async function twentyWithOneClash() {
  const db = newDb();
  const server = new FakeSupabase();
  const transport = new SupabaseTransport(server);
  const athletes = [];
  for (let i = 1; i <= 20; i++) athletes.push(await createAthlete(db, { tenant_id: T, name: `Atleta ${i}` }));
  const clash = athletes[7];
  server.rows.set(`athlete:${clash.id}`, { entity: "athlete", id: clash.id, seq: ++server.seq, data: { ...clash, name: "Versão do PC" }, deleted: false });
  return { db, server, transport, athletes, clash };
}

describe("recusado pela nuvem (conflict)", () => {
  it("1 recusado num lote de 20: os outros 19 sobem e a central mostra qual foi e por quê", async () => {
    const { db, transport, clash } = await twentyWithOneClash();
    const report = await syncNow(db, transport);
    expect(report).toMatchObject({ acked: 19, conflicts: 1, error: null });
    expect(await listPending(db, T)).toEqual([]);

    const { issues, stalled } = await getSyncSummary(db, T);
    expect(stalled).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entity: "athlete", entity_id: clash.id, label: "Atleta Atleta 8", canUseRemote: true });
    expect(issues[0].reason).toMatch(/outra versão deste registro/);
  });

  it("enquanto não decide, o pull não sobrescreve a versão deste aparelho", async () => {
    const { db, transport, clash } = await twentyWithOneClash();
    await syncNow(db, transport);
    await runPull(db, transport, { tenant_id: T });
    expect((await db.athletes.get(clash.id))?.name).toBe("Atleta 8");
  });

  it("'Enviar a versão deste aparelho' sobrescreve a nuvem com o estado ATUAL (nunca uma versão velha)", async () => {
    const { db, server, transport, clash } = await twentyWithOneClash();
    await syncNow(db, transport);
    await updateAthlete(db, T, clash.id, { name: "Atleta 8 corrigida" }); // edição depois da recusa
    const [issue] = (await getSyncSummary(db, T)).issues;

    await retryEntry(db, T, issue.mutation_id);
    const statuses = (await db.outbox.where("entity_id").equals(clash.id).toArray()).map((e) => e.status).sort();
    expect(statuses).toEqual(["dismissed", "dismissed", "pending"]); // a recusada e a edição antiga foram superadas
    await syncNow(db, transport);

    expect(server.rows.get(`athlete:${clash.id}`)?.data.name).toBe("Atleta 8 corrigida");
    expect(await getSyncSummary(db, T)).toMatchObject({ issues: [], pendingTotal: 0 });
  });

  it("'Usar a versão da nuvem' descarta a mudança local e refaz o pull", async () => {
    const { db, transport, clash } = await twentyWithOneClash();
    await syncNow(db, transport);
    await runPull(db, transport, { tenant_id: T });
    expect(await getPullCursor(db)).toBeGreaterThan(0);

    const [issue] = (await getSyncSummary(db, T)).issues;
    await acceptRemote(db, T, issue.mutation_id);
    expect(await getPullCursor(db)).toBe(0);
    await runPull(db, transport, { tenant_id: T });

    expect((await db.athletes.get(clash.id))?.name).toBe("Versão do PC");
    expect((await getSyncSummary(db, T)).issues).toEqual([]);
  });

  it("'Ignorar' tira da revisão sem reenviar (fica só para auditoria)", async () => {
    const { db, transport } = await twentyWithOneClash();
    await syncNow(db, transport);
    const [issue] = (await getSyncSummary(db, T)).issues;
    await dismissEntry(db, T, issue.mutation_id);
    expect(await getSyncSummary(db, T)).toMatchObject({ issues: [], dismissed: 1, pendingTotal: 0 });
  });

  it("excluir partida antes do SQL 0002: recusa explicada; depois do SQL, 'Tentar de novo' resolve", async () => {
    const db = newDb();
    const server = new FakeSupabase();
    server.editableMatches = false;
    const transport = new SupabaseTransport(server);
    const match = await createMatch(db, {
      tenant_id: T,
      modality: "beach",
      team_a: { name: "Ana / Bia", athlete_ids: ["a", "b"] },
      team_b: { name: "Júlia / Larissa", athlete_ids: ["c", "d"] },
      first_server: "A",
    });
    await deleteMatch(db, T, match.id);
    await syncNow(db, transport);

    const [issue] = (await getSyncSummary(db, T)).issues;
    expect(issue.label).toMatch(/^Partida Ana \/ Bia × Júlia \/ Larissa · /);
    expect(issue.reason).toMatch(/0002_editable_matches\.sql/);

    server.editableMatches = true; // o SQL foi rodado
    await retryEntry(db, T, issue.mutation_id);
    await syncNow(db, transport);
    expect(server.rows.get(`match:${match.id}`)?.deleted).toBe(true);
    expect((await getSyncSummary(db, T)).issues).toEqual([]);
  });
});

describe("envio parado (falha que não é recusa)", () => {
  it("sem rede: mostra onde parou e o motivo, mas nunca deixa pular", async () => {
    const db = newDb();
    const server = new FakeSupabase();
    server.offline = true;
    const transport = new SupabaseTransport(server);
    await createAthlete(db, { tenant_id: T, name: "Ana" });
    for (let i = 0; i < SKIP_AFTER_ATTEMPTS + 1; i++) await syncNow(db, transport);

    const { stalled } = await getSyncSummary(db, T);
    expect(stalled).toMatchObject({ label: "Atleta Ana", transient: true, canSkip: false, reason: "Sem conexão com o servidor." });
    await expect(skipHead(db, T, stalled!.mutation_id)).rejects.toThrow(/continua sozinho/);
  });

  it("erro do servidor repetido: após 5 tentativas dá para pular, e o resto da fila volta a andar", async () => {
    const db = newDb();
    const server = new FakeSupabase();
    server.failWith = "boom: internal error";
    const transport = new SupabaseTransport(server);
    await createAthlete(db, { tenant_id: T, name: "Ana" });
    await createAthlete(db, { tenant_id: T, name: "Bia" });

    await syncNow(db, transport);
    expect((await getSyncSummary(db, T)).stalled).toMatchObject({ label: "Atleta Ana", transient: false, canSkip: false, attempts: 1 });
    for (let i = 1; i < SKIP_AFTER_ATTEMPTS; i++) await syncNow(db, transport);
    const { stalled } = await getSyncSummary(db, T);
    expect(stalled).toMatchObject({ canSkip: true, attempts: SKIP_AFTER_ATTEMPTS });
    expect(stalled!.reason).toMatch(/boom/);

    await skipHead(db, T, stalled!.mutation_id);
    server.failWith = null;
    await syncNow(db, transport);
    const after = await getSyncSummary(db, T);
    expect(after.pendingTotal).toBe(0);
    expect(after.issues).toHaveLength(1);
    expect(after.issues[0]).toMatchObject({ label: "Atleta Ana" });
    expect(after.issues[0].reason).toMatch(/Pulado após 5 tentativas/);
    expect([...server.rows.values()].map((r) => r.data.name)).toEqual(["Bia"]);
  });
});
