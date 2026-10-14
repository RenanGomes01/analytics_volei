import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScoutDB } from "@/db/schema";
import type { OutboxEntry } from "@/domain/types";
import { createAthlete } from "@/services/athlete-service";
import { countSyncable } from "@/services/sync/account-service";
import { getSyncStatus } from "@/services/sync/sync-engine";
import { getSyncSummary } from "@/services/sync/sync-summary";

/**
 * Fase 13 — no tablet, ler o outbox inteiro (milhares de linhas com payload) a cada gravação deixava
 * excluir/sincronizar lento por dezenas de segundos. As consultas ao vivo do status agora contam
 * pelo índice e só leem a fila de verdade: o custo não cresce com o histórico.
 */

const T = "local";
let db: ScoutDB;
let reads = 0;

beforeEach(async () => {
  db = new ScoutDB(`perf-${crypto.randomUUID()}`);
  // Histórico grande: 3.000 lances já confirmados + 2.000 de dados de teste.
  const history: OutboxEntry[] = Array.from({ length: 5000 }, (_, i) => ({
    mutation_id: `h${i}`,
    tenant_id: T,
    entity: "rally_event",
    entity_id: `e${i}`,
    op: "insert",
    payload: { id: `e${i}`, tenant_id: T, match_id: "m1", kind: "touch", local_seq: i },
    status: i < 3000 ? "acked" : "local_only",
    created_at: i,
    attempts: i < 3000 ? 1 : 0,
    last_attempt_at: null,
    next_attempt_at: i,
    last_error: null,
    server_seq: i < 3000 ? i + 1 : null,
  }));
  await db.outbox.bulkAdd(history);
  reads = 0;
  db.outbox.hook("reading", (obj) => {
    reads += 1;
    return obj;
  });
});

afterEach(async () => {
  await db.delete();
});

describe("status do sync não lê o histórico do outbox", () => {
  it("fila vazia: status, resumo e contagem leem no máximo 1 linha (com 5.000 no histórico)", async () => {
    const status = await getSyncStatus(db, T);
    expect(status).toMatchObject({ pending: 0, acked: 3000, conflicts: 0, last_error: null });
    expect(await countSyncable(db, T)).toBe(3000);
    const summary = await getSyncSummary(db, T);
    expect(summary).toMatchObject({ pendingTotal: 0, issues: [], stalled: null, dismissed: 0 });
    expect(reads).toBeLessThanOrEqual(1);
  });

  it("com fila: lê só a cabeça para o status e só a fila para o resumo", async () => {
    // A cabeça da fila é a Ana (criada primeiro); o erro dela é o que o status mostra.
    const ana = await createAthlete(db, { tenant_id: T, name: "Ana" });
    await createAthlete(db, { tenant_id: T, name: "Bia" });
    await db.outbox.where("entity_id").equals(ana.id).modify({ attempts: 2, last_error: "Sem conexão com o servidor." });
    reads = 0;

    const status = await getSyncStatus(db, T);
    expect(status).toMatchObject({ pending: 2, acked: 3000, last_error: "Sem conexão com o servidor." });
    expect(reads).toBeLessThanOrEqual(1);

    reads = 0;
    const summary = await getSyncSummary(db, T);
    expect(summary.pending.athlete).toBe(2);
    expect(summary.stalled).toMatchObject({ label: "Atleta Ana", transient: true });
    expect(reads).toBeLessThanOrEqual(2);
  });
});
