import { newId } from "@/lib/id";
import type { OutboxEntity, OutboxEntry, OutboxOp } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";

let lastStamp = 0;
let localOnlyDepth = 0;

/**
 * Relógio estritamente crescente nesta sessão. Várias mutações na mesma transação (ex.: atletas e
 * partida) caem no mesmo milissegundo; sem isso o desempate do índice [status+created_at] seria o
 * mutation_id aleatório e o envio FIFO perderia a ordem de gravação.
 */
function monotonicNow(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/**
 * Durante `fn`, as mutações enfileiradas nascem `local_only`: ficam registradas mas nunca são
 * enviadas à nuvem. Uso exclusivo dos dados de teste (/dev/seed).
 */
export async function withLocalOnlyOutbox<T>(fn: () => Promise<T>): Promise<T> {
  localOnlyDepth += 1;
  try {
    return await fn();
  } finally {
    localOnlyDepth -= 1;
  }
}

/**
 * Enfileira uma mutação. Deve ser chamado DENTRO da transação que grava a entidade,
 * para que entidade e outbox sejam persistidos juntos ou não sejam persistidos.
 */
export async function enqueue(
  db: ScoutDB,
  entity: OutboxEntity,
  row: { id: string; tenant_id: string },
  op: OutboxOp = "insert",
): Promise<OutboxEntry> {
  const now = monotonicNow();
  const entry: OutboxEntry = {
    mutation_id: newId(),
    tenant_id: row.tenant_id,
    entity,
    entity_id: row.id,
    op,
    payload: structuredClone(row),
    status: localOnlyDepth > 0 ? "local_only" : "pending",
    created_at: now,
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: now,
    last_error: null,
    server_seq: null,
  };
  await db.outbox.add(entry);
  return entry;
}

export async function listPending(db: ScoutDB, tenant_id: string): Promise<OutboxEntry[]> {
  const pending = await db.outbox.where("[status+created_at]").between(["pending", -Infinity], ["pending", Infinity]).toArray();
  return pending.filter((e) => e.tenant_id === tenant_id);
}

/** Confirmação do servidor (Fase 4). Só a fila é atualizada; o evento no ledger não muda. */
export async function markAcked(db: ScoutDB, mutation_id: string, server_seq: number): Promise<void> {
  const updated = await db.outbox.update(mutation_id, { status: "acked", server_seq });
  if (!updated) throw new Error(`Mutação ${mutation_id} não encontrada no outbox.`);
}
