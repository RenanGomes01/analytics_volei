import type { OutboxEntry } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { nextAttemptAt } from "./backoff";
import type { PushResult, SyncTransport } from "./transport";

/**
 * Motor de envio do outbox. Só muda a fila: o ledger (`rally_events`) nunca é tocado.
 * Ciclo de uma entrada: pending → sent → acked | conflict | pending (retry com backoff).
 */

export const CLAIM_LEASE_MS = 2 * 60_000;
export const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCHES_PER_CYCLE = 20;
const LAST_SUCCESS_KEY = "sync:last_success_at";

export interface SyncCycleOptions {
  tenant_id: string;
  now?: () => number;
  random?: () => number;
  batchSize?: number;
}

export interface SyncCycleReport {
  batches: number;
  acked: number;
  conflicts: number;
  retried: number;
  released: number;
  error: string | null;
}

type Changes = { key: string; changes: Partial<OutboxEntry> };

/** Entradas presas em "sent" (o app fechou durante o envio) voltam para a fila após o lease. */
export function releaseStaleClaims(db: ScoutDB, now: number): Promise<number> {
  return db.transaction("rw", db.outbox, () =>
    db.outbox
      .where("status")
      .equals("sent")
      .filter((e) => (e.last_attempt_at ?? 0) <= now - CLAIM_LEASE_MS)
      .modify({ status: "pending" }),
  );
}

/**
 * Reivindica o próximo lote em ordem FIFO (created_at). Para na primeira entrada ainda em backoff:
 * nada é enviado fora de ordem.
 */
export function claimBatch(db: ScoutDB, tenant_id: string, now: number, size = DEFAULT_BATCH_SIZE) {
  return db.transaction("rw", db.outbox, async () => {
    const pending = await db.outbox
      .where("[status+created_at]")
      .between(["pending", -Infinity], ["pending", Infinity])
      .filter((e) => e.tenant_id === tenant_id)
      .limit(size)
      .toArray();

    const batch: OutboxEntry[] = [];
    for (const entry of pending) {
      if (entry.next_attempt_at > now) break;
      batch.push({ ...entry, status: "sent", attempts: entry.attempts + 1, last_attempt_at: now });
    }
    await db.outbox.bulkUpdate(
      batch.map((e) => ({ key: e.mutation_id, changes: { status: "sent", attempts: e.attempts, last_attempt_at: now } })),
    );
    return batch;
  });
}

/**
 * Aplica a resposta do servidor ao lote. Na primeira entrada sem ack (retry, sem resposta ou rede
 * fora), ela entra em backoff e as seguintes voltam intactas para a fila, preservando a ordem.
 */
export async function applyResults(
  db: ScoutDB,
  batch: readonly OutboxEntry[],
  results: readonly PushResult[],
  now: number,
  random: () => number = Math.random,
  failureReason = "Servidor não respondeu a esta mutação.",
): Promise<Pick<SyncCycleReport, "acked" | "conflicts" | "retried">> {
  const byId = new Map(results.map((r) => [r.mutation_id, r]));
  const counts = { acked: 0, conflicts: 0, retried: 0 };
  let blocked = false;

  const updates: Changes[] = batch.map((entry) => {
    const key = entry.mutation_id;
    if (blocked) {
      // Não foi processada por causa de uma anterior: devolve sem contar a tentativa.
      return { key, changes: { status: "pending", attempts: entry.attempts - 1 } };
    }
    const result = byId.get(key);
    if (result?.status === "acked") {
      counts.acked += 1;
      return { key, changes: { status: "acked", server_seq: result.server_seq, last_error: null } };
    }
    if (result?.status === "conflict") {
      counts.conflicts += 1;
      return { key, changes: { status: "conflict", last_error: result.reason } };
    }
    blocked = true;
    counts.retried += 1;
    return {
      key,
      changes: {
        status: "pending",
        next_attempt_at: nextAttemptAt(entry.attempts, now, random),
        last_error: result?.reason ?? failureReason,
      },
    };
  });

  await db.transaction("rw", db.outbox, () => db.outbox.bulkUpdate(updates));
  return counts;
}

/** Um ciclo completo: libera claims vencidos e envia lotes até esvaziar a fila ou falhar. */
export async function runSyncCycle(
  db: ScoutDB,
  transport: SyncTransport,
  { tenant_id, now = Date.now, random = Math.random, batchSize = DEFAULT_BATCH_SIZE }: SyncCycleOptions,
): Promise<SyncCycleReport> {
  const report: SyncCycleReport = { batches: 0, acked: 0, conflicts: 0, retried: 0, released: 0, error: null };
  report.released = await releaseStaleClaims(db, now());

  for (let i = 0; i < MAX_BATCHES_PER_CYCLE; i++) {
    const batch = await claimBatch(db, tenant_id, now(), batchSize);
    if (batch.length === 0) break;
    report.batches += 1;

    let results: PushResult[] = [];
    let networkError: string | null = null;
    try {
      results = await transport.push(batch);
    } catch (e) {
      networkError = e instanceof Error ? e.message : String(e);
    }

    const counts = await applyResults(db, batch, results, now(), random, networkError ?? undefined);
    report.acked += counts.acked;
    report.conflicts += counts.conflicts;
    report.retried += counts.retried;
    if (networkError) report.error = networkError;
    if (counts.retried) break;
  }

  if (!report.error && !report.retried) await db.meta.put({ key: LAST_SUCCESS_KEY, value: now() });
  return report;
}

export interface SyncStatus {
  /** pending + sent */
  pending: number;
  conflicts: number;
  acked: number;
  last_success_at: number | null;
  last_error: string | null;
}

export async function getSyncStatus(db: ScoutDB, tenant_id: string): Promise<SyncStatus> {
  const entries = await db.outbox.where("tenant_id").equals(tenant_id).toArray();
  const status: SyncStatus = { pending: 0, conflicts: 0, acked: 0, last_success_at: null, last_error: null };
  for (const e of entries) {
    if (e.status === "acked") status.acked += 1;
    else if (e.status === "conflict") status.conflicts += 1;
    else {
      status.pending += 1;
      status.last_error ??= e.last_error;
    }
  }
  const last = (await db.meta.get(LAST_SUCCESS_KEY))?.value;
  status.last_success_at = typeof last === "number" ? last : null;
  return status;
}

/** Maior server_seq já confirmado neste aparelho (para o MockTransport continuar a sequência). */
export async function lastServerSeq(db: ScoutDB): Promise<number> {
  let max = 0;
  await db.outbox
    .where("status")
    .equals("acked")
    .each((e) => {
      max = Math.max(max, e.server_seq ?? 0);
    });
  return max;
}
