import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { canonicalJson } from "@/domain/export/canonical-json";
import { replayMatch } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import type { OutboxEntity } from "@/domain/types";
import { seedDemoData } from "@/services/dev/seed-service";
import { listPending } from "@/services/outbox-service";
import { updateAthlete } from "@/services/roster-service";
import { loadSeason } from "@/services/season-service";
import { removeMatchFromTournament } from "@/services/tournament-service";
import { countSyncable, getLinkedAccount, linkAccount, retryPendingNow } from "@/services/sync/account-service";
import { applyPulledPage, getPullCursor, listPullConflicts, runPull, type PulledChange } from "@/services/sync/pull-service";
import { describeRpcError, SupabaseTransport, SyncAuthError } from "@/services/sync/supabase-transport";
import { FakeSupabase } from "../helpers/fake-supabase";
import { getSyncStatus, runSyncCycle } from "@/services/sync/sync-engine";

// Seed + fake-indexeddb é pesado quando a suíte inteira roda em paralelo.
vi.setConfig({ testTimeout: 60_000 });

const T = "local";
const dbs: ScoutDB[] = [];
const newDb = () => {
  const db = new ScoutDB(`cloud-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

/** Até esvaziar a fila (cada ciclo envia no máximo 20 lotes). */
async function pushAll(db: ScoutDB, transport: SupabaseTransport) {
  for (let i = 0; i < 50 && (await listPending(db, T)).length > 0; i++) await runSyncCycle(db, transport, { tenant_id: T, batchSize: 200 });
}

/** Seed pequeno com o outbox liberado para envio (o seed nasce `local_only`). */
async function tabletWithGames(maxMatches = 2) {
  const db = newDb();
  await seedDemoData(db, T, { maxMatches });
  await db.outbox.toCollection().modify({ status: "pending" });
  return db;
}

async function snapshot(db: ScoutDB) {
  const sort = <R,>(rows: R[], key: (r: R) => string) => rows.sort((a, b) => key(a).localeCompare(key(b)));
  return canonicalJson({
    athletes: sort(await db.athletes.toArray(), (r) => r.id),
    teams: sort(await db.teams.toArray(), (r) => r.id),
    tournaments: sort(await db.tournaments.toArray(), (r) => r.id),
    entries: sort(await db.tournament_entries.toArray(), (r) => r.id),
    matches: sort(await db.matches.toArray(), (r) => r.id),
    events: sort(await db.rally_events.toArray(), (r) => r.id),
  });
}

describe("SupabaseTransport", () => {
  it("mapeia acked/conflict, converte server_seq e manda só o necessário", async () => {
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    const entry = (mutation_id: string, entity_id: string, name: string) => ({
      mutation_id, tenant_id: T, entity: "match" as const, entity_id, op: "insert" as const, payload: { id: entity_id, tenant_id: T, name },
      status: "sent" as const, created_at: 1, attempts: 1, last_attempt_at: 1, next_attempt_at: 1, last_error: null, server_seq: null,
    });
    const first = await transport.push([entry("m1", "x", "A"), entry("m2", "x", "B")]);
    expect(first).toEqual([
      { mutation_id: "m1", status: "acked", server_seq: 1 },
      { mutation_id: "m2", status: "conflict", reason: "match x já existe com outro conteúdo." },
    ]);
    expect(server.rows.get("match:x")!.data).toEqual({ id: "x", name: "A" }); // sem tenant_id
  });

  it("sem sessão, rede fora ou SQL não instalado → exceção com mensagem em PT-BR (o lote volta para a fila)", async () => {
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    server.user = null;
    await expect(transport.pull(0, 10)).rejects.toBeInstanceOf(SyncAuthError);
    server.user = "user-1";
    server.offline = true;
    await expect(transport.pull(0, 10)).rejects.toThrow("Sem conexão com o servidor.");
    expect(describeRpcError({ message: "JWT expired", code: "PGRST301" })).toBe("Sessão expirada: entre na conta de novo.");
    expect(describeRpcError({ message: "Could not find the function public.push_mutations(batch)", code: "PGRST202" })).toMatch(/rode o SQL da Fase 8/);
  });

  it("no motor de sync: falha de rede preserva a fila inteira e a ordem; ao voltar, envia tudo", async () => {
    const db = await tabletWithGames(1);
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    const before = (await listPending(db, T)).map((e) => e.mutation_id);
    server.offline = true;
    const report = await runSyncCycle(db, transport, { tenant_id: T });
    expect(report.error).toBe("Sem conexão com o servidor.");
    expect((await listPending(db, T)).map((e) => e.mutation_id)).toEqual(before);

    server.offline = false;
    await retryPendingNow(db, T, Date.now() + 1);
    await pushAll(db, transport);
    expect(await listPending(db, T)).toEqual([]);
    expect(server.rows.size).toBe(before.length); // cada mutação do seed é uma entidade nova
  });
});

describe("tablet → nuvem → computador", () => {
  it("o PC vazio recebe tudo, sem outbox, e as estatísticas batem com as do tablet", async () => {
    const tablet = await tabletWithGames(3);
    const pc = newDb();
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    await pushAll(tablet, transport);

    const report = await runPull(pc, transport, { tenant_id: T, pageSize: 250 });
    expect(report.pages).toBeGreaterThan(1);
    expect(report.conflicts).toBe(0);
    expect(await snapshot(pc)).toBe(await snapshot(tablet));
    expect(await pc.outbox.count()).toBe(0);
    expect(await getPullCursor(pc)).toBe(server.seq);

    // Mesmo resultado de jogo e mesmos números nos dois aparelhos.
    const [a, b] = await Promise.all([loadSeason(tablet, T), loadSeason(pc, T)]);
    const statsOf = (s: typeof a) => aggregateCompetition(s.matches, { aliases: new Map() });
    expect(canonicalJson(statsOf(b))).toBe(canonicalJson(statsOf(a)));
    for (const { match, events } of b.matches) {
      const state = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server });
      expect(state.winner).not.toBeNull();
    }

    // Pull repetido: nada novo.
    const again = await runPull(pc, transport, { tenant_id: T });
    expect(again).toMatchObject({ applied: 0, pages: 0 });
  });

  it("dados de teste (local_only) nunca sobem", async () => {
    const db = newDb();
    await seedDemoData(db, T, { maxMatches: 1 });
    const server = new FakeSupabase();
    await runSyncCycle(db, new SupabaseTransport(server), { tenant_id: T });
    expect(server.calls).toEqual([]);
    expect(await countSyncable(db, T)).toBe(0);
    expect((await getSyncStatus(db, T)).pending).toBe(0);
  });

  it("cadastro: edição local ainda não enviada ganha do eco remoto; depois sobe e vence nos dois", async () => {
    const tablet = await tabletWithGames(1);
    const pc = newDb();
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    await pushAll(tablet, transport);
    await runPull(pc, transport, { tenant_id: T });

    const athlete = (await tablet.athletes.toArray())[0];
    await updateAthlete(tablet, T, athlete.id, { name: "Nome do tablet" });
    await pushAll(tablet, transport);
    await updateAthlete(pc, T, athlete.id, { name: "Nome do PC" }); // ainda não enviada

    await runPull(pc, transport, { tenant_id: T });
    expect((await pc.athletes.get(athlete.id))!.name).toBe("Nome do PC");

    await pushAll(pc, transport);
    await runPull(tablet, transport, { tenant_id: T });
    expect((await tablet.athletes.get(athlete.id))!.name).toBe("Nome do PC");
  });

  it("lápide: tirar a partida do torneio num aparelho remove o vínculo no outro", async () => {
    const tablet = await tabletWithGames(1);
    const pc = newDb();
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    await pushAll(tablet, transport);
    await runPull(pc, transport, { tenant_id: T });
    const [entry] = await pc.tournament_entries.toArray();

    await removeMatchFromTournament(tablet, T, entry.id);
    await pushAll(tablet, transport);
    await runPull(pc, transport, { tenant_id: T });
    expect(await pc.tournament_entries.get(entry.id)).toBeUndefined();
    expect(await pc.matches.get(entry.match_id)).toBeDefined(); // a partida continua
  });
});

describe("pull: o ledger local nunca é sobrescrito", () => {
  const event = (id: string, local_seq: number, extra: object = {}): PulledChange => ({
    entity: "rally_event",
    entity_id: id,
    server_seq: local_seq,
    deleted: false,
    data: { id, match_id: "m", set_id: "m:s1", set_number: 1, rally_id: "r", rally_number: 1, local_seq, device_id: "tablet", timestamp: 1, kind: "touch", team: "A", skill: "serve", ...extra },
  });

  it("lance com mesmo id e outro conteúdo: mantém o local e registra a divergência", async () => {
    const db = newDb();
    await applyPulledPage(db, T, [event("e1", 1)], 1);
    const local = await db.rally_events.get("e1");
    const report = await applyPulledPage(db, T, [event("e1", 2, { team: "B" })], 2);
    expect(report.conflicts).toBe(1);
    expect(await db.rally_events.get("e1")).toEqual(local);
    expect((await listPullConflicts(db))[0]).toMatchObject({ entity: "rally_event", entity_id: "e1" });
    expect((await getSyncStatus(db, T)).pull_conflicts).toBe(1);
  });

  it("mesma posição do ledger vinda de outro aparelho: guarda (append-only) e avisa que a partida foi scouteada em dois", async () => {
    const db = newDb();
    await applyPulledPage(db, T, [event("e1", 1)], 1);
    await applyPulledPage(db, T, [{ ...event("e2", 1, { device_id: "pc" }), server_seq: 5 }], 2);
    expect(await db.rally_events.count()).toBe(2);
    expect((await listPullConflicts(db))[0]).toMatchObject({ match_id: "m", reason: "Partida scouteada em mais de um aparelho." });
  });

  it("página com erro não grava nada nem avança o cursor", async () => {
    const db = newDb();
    const bad = { ...event("e9", 9), entity: "planet" as OutboxEntity };
    await expect(applyPulledPage(db, T, [event("e1", 1), bad], 1)).rejects.toThrow();
    expect(await db.rally_events.count()).toBe(0);
    expect(await getPullCursor(db)).toBe(0);
  });
});

describe("vínculo da conta", () => {
  it("1ª ligação reenvia o histórico já confirmado (ex.: pelo mock) e zera o pull; dados de teste ficam de fora", async () => {
    const db = await tabletWithGames(1);
    const real = await db.outbox.count();
    await db.outbox.toCollection().modify({ status: "acked", server_seq: 7 });
    const seedOnly = { ...(await db.outbox.toCollection().first())!, mutation_id: "seed-only", status: "local_only" as const };
    await db.outbox.put(seedOnly);
    await db.meta.put({ key: "sync:pull_cursor", value: 99 });

    expect(await linkAccount(db, T, "user-1")).toBe(real);
    expect(await getLinkedAccount(db)).toBe("user-1");
    expect(await getPullCursor(db)).toBe(0);
    expect((await db.outbox.get("seed-only"))!.status).toBe("local_only");
    expect((await listPending(db, T)).every((e) => e.attempts === 0 && e.server_seq === null)).toBe(true);
    expect(await linkAccount(db, T, "user-1")).toBe(0); // mesma conta: nada muda
  });
});
