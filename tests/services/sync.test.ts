import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxEntry } from "@/domain/types";
import { SCHEMA_V1, ScoutDB } from "@/db/schema";
import { createMatch } from "@/services/match-service";
import { appendTouch, type MatchScope } from "@/services/rally-ledger-service";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, nextAttemptAt } from "@/services/sync/backoff";
import { MockTransport } from "@/services/sync/mock-transport";
import {
  CLAIM_LEASE_MS,
  claimBatch,
  getSyncStatus,
  lastServerSeq,
  runSyncCycle,
} from "@/services/sync/sync-engine";
import type { SyncTransport } from "@/services/sync/transport";

let dbName: string;
let db: ScoutDB;
let clock: number;
const now = () => clock;
const noJitter = () => 0.5; // jitter neutro: fator 1.0

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new ScoutDB(dbName);
  clock = Date.now() + 1_000; // depois do created_at das entradas
});

afterEach(async () => {
  await db.delete();
});

async function newMatch(tenant_id = "t1"): Promise<MatchScope> {
  const match = await createMatch(db, {
    tenant_id,
    modality: "beach",
    team_a: { name: "A", athlete_ids: ["a1"] },
    team_b: { name: "B", athlete_ids: ["b1"] },
    first_server: "A",
  });
  return { tenant_id, match_id: match.id };
}

async function touches(scope: MatchScope, n: number) {
  for (let i = 0; i < n; i++) await appendTouch(db, scope, { team: "A", athlete_id: "a1", skill: "serve", quality: "+" });
}

const outbox = async () => (await db.outbox.toArray()).sort((a, b) => a.created_at - b.created_at);
const cycle = (transport: SyncTransport, extra = {}) =>
  runSyncCycle(db, transport, { tenant_id: "t1", now, random: noJitter, ...extra });

describe("backoff", () => {
  it("cresce exponencialmente com teto de 10 min e jitter de ±20%", () => {
    expect(nextAttemptAt(1, 0, noJitter)).toBe(BACKOFF_BASE_MS);
    expect(nextAttemptAt(2, 0, noJitter)).toBe(2 * BACKOFF_BASE_MS);
    expect(nextAttemptAt(4, 0, noJitter)).toBe(8 * BACKOFF_BASE_MS);
    expect(nextAttemptAt(30, 0, noJitter)).toBe(BACKOFF_MAX_MS);
    expect(nextAttemptAt(1, 0, () => 0)).toBe(0.8 * BACKOFF_BASE_MS);
    expect(nextAttemptAt(1, 0, () => 1)).toBe(1.2 * BACKOFF_BASE_MS);
  });
});

describe("runSyncCycle com MockTransport", () => {
  it("envia tudo em ordem FIFO e grava server_seq monotônico só no outbox", async () => {
    const scope = await newMatch();
    await touches(scope, 3);
    const ledgerBefore = await db.rally_events.toArray();

    const report = await cycle(new MockTransport());

    expect(report).toMatchObject({ acked: 4, retried: 0, error: null });
    const entries = await outbox();
    expect(entries.map((e) => e.entity)).toEqual(["match", "rally_event", "rally_event", "rally_event"]);
    expect(entries.map((e) => e.server_seq)).toEqual([1, 2, 3, 4]);
    expect(entries.every((e) => e.status === "acked" && e.attempts === 1)).toBe(true);
    expect(await db.rally_events.toArray()).toEqual(ledgerBefore); // o sync nunca toca o ledger
    expect(await getSyncStatus(db, "t1")).toMatchObject({ pending: 0, acked: 4, last_success_at: clock });
  });

  it("reenvio é idempotente: a mesma mutação recebe o mesmo server_seq", async () => {
    const scope = await newMatch();
    await touches(scope, 1);
    const transport = new MockTransport();
    await cycle(transport);
    const [first] = await outbox();

    expect(await transport.push([first])).toEqual([{ mutation_id: first.mutation_id, status: "acked", server_seq: 1 }]);
    expect(transport.lastSeq).toBe(2);
  });

  it("FIFO: no primeiro retry o lote para e as seguintes voltam intactas para a fila", async () => {
    const scope = await newMatch();
    await touches(scope, 3);
    // falha só na 2ª mutação do lote
    const results = [0.9, 0.0, 0.9, 0.9];
    const transport = new MockTransport({ failureRate: 0.5, random: () => results.shift() ?? 0.9 });

    const report = await cycle(transport);

    expect(report).toMatchObject({ acked: 1, retried: 1 });
    const [m, e1, e2, e3] = await outbox();
    expect(m.status).toBe("acked");
    expect(e1).toMatchObject({ status: "pending", attempts: 1, last_error: "Falha simulada do servidor." });
    expect(e1.next_attempt_at).toBe(clock + BACKOFF_BASE_MS);
    expect([e2, e3].map((e) => [e.status, e.attempts])).toEqual([["pending", 0], ["pending", 0]]);
  });

  it("respeita o backoff: nada sai antes de next_attempt_at, nem as entradas depois da falha", async () => {
    const scope = await newMatch();
    await touches(scope, 2);
    const transport = new MockTransport({ offline: true });
    await cycle(transport);
    transport.setOffline(false);

    clock += BACKOFF_BASE_MS - 1;
    expect(await cycle(transport)).toMatchObject({ batches: 0, acked: 0 });

    clock += 1;
    expect(await cycle(transport)).toMatchObject({ acked: 3, error: null });
    expect((await outbox()).map((e) => e.server_seq)).toEqual([1, 2, 3]);
  });

  it("rede fora: o lote inteiro volta para a fila e o erro aparece no status", async () => {
    const scope = await newMatch();
    await touches(scope, 2);

    const report = await cycle(new MockTransport({ offline: true }));

    expect(report).toMatchObject({ acked: 0, retried: 1, error: "Servidor indisponível (mock offline)." });
    expect((await outbox()).every((e) => e.status === "pending")).toBe(true);
    expect(await getSyncStatus(db, "t1")).toMatchObject({
      pending: 3,
      last_success_at: null,
      last_error: "Servidor indisponível (mock offline).",
    });
  });

  it("entrada presa em 'sent' (app fechou no meio do envio) volta após o lease", async () => {
    await newMatch();
    const [claimed] = await claimBatch(db, "t1", clock);
    expect(claimed.status).toBe("sent");

    clock += CLAIM_LEASE_MS - 1;
    expect(await cycle(new MockTransport())).toMatchObject({ released: 0, acked: 0 });

    clock += 1;
    expect(await cycle(new MockTransport())).toMatchObject({ released: 1, acked: 1 });
    expect((await outbox())[0]).toMatchObject({ status: "acked", attempts: 2 });
  });

  it("conflito fica registrado e não bloqueia as mutações seguintes", async () => {
    const scope = await newMatch();
    await touches(scope, 1);
    const transport = new MockTransport();
    const [matchEntry] = await outbox();
    // o "servidor" já conhece esta partida com outro conteúdo
    await transport.push([{ ...matchEntry, mutation_id: "outra", payload: { diferente: true } }]);

    const report = await cycle(transport);

    expect(report).toMatchObject({ conflicts: 1, acked: 1 });
    const [m, e] = await outbox();
    expect(m).toMatchObject({ status: "conflict", last_error: expect.stringMatching(/outro conteúdo/) });
    expect(e.status).toBe("acked");
    expect(await getSyncStatus(db, "t1")).toMatchObject({ conflicts: 1, pending: 0 });
  });

  it("isolamento de tenant: só envia as mutações do tenant do ciclo", async () => {
    await newMatch("t1");
    await newMatch("t2");
    const mock = new MockTransport();
    const push = vi.fn(mock.push.bind(mock));

    await cycle({ push });

    expect(push.mock.calls.flatMap(([batch]) => batch.map((e) => e.tenant_id))).toEqual(["t1"]);
    expect((await db.outbox.where("tenant_id").equals("t2").first())?.status).toBe("pending");
  });

  it("lastServerSeq permite ao mock continuar a sequência após recarregar a página", async () => {
    const scope = await newMatch();
    await touches(scope, 2);
    await cycle(new MockTransport());
    expect(await lastServerSeq(db)).toBe(3);
    await touches(scope, 1);
    await cycle(new MockTransport({ startSeq: await lastServerSeq(db) }));
    expect((await outbox()).at(-1)?.server_seq).toBe(4);
  });
});

describe("migração Dexie v1 → atual", () => {
  it("preenche os campos novos do outbox sem perder dados", async () => {
    await db.delete();
    const legacy = new Dexie(dbName);
    legacy.version(1).stores(SCHEMA_V1);
    const v1Entry = {
      mutation_id: "m-1",
      tenant_id: "t1",
      entity: "rally_event",
      entity_id: "e-1",
      op: "insert",
      payload: { id: "e-1" },
      status: "pending",
      created_at: 1_000,
      attempts: 0,
      server_seq: null,
    };
    await legacy.table("outbox").add(v1Entry);
    await legacy.table("rally_events").add({ id: "e-1", tenant_id: "t1", match_id: "m", local_seq: 1, set_number: 1 });
    legacy.close();

    db = new ScoutDB(dbName);
    const migrated = (await db.outbox.get("m-1")) as OutboxEntry;
    expect(migrated).toEqual({ ...v1Entry, next_attempt_at: 1_000, last_attempt_at: null, last_error: null });
    expect(await db.rally_events.count()).toBe(1);
    expect(db.verno).toBe(3);
    expect(await claimBatch(db, "t1", 2_000)).toHaveLength(1); // o índice novo funciona
  });
});
