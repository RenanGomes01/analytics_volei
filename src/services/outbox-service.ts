import type { OutboxEntity, OutboxEntry } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";

/**
 * Enfileira uma mutação. Deve ser chamado DENTRO da transação que grava a entidade,
 * para que entidade e outbox sejam persistidos juntos ou não sejam persistidos.
 */
export async function enqueue(
  db: ScoutDB,
  entity: OutboxEntity,
  row: { id: string; tenant_id: string },
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    mutation_id: crypto.randomUUID(),
    tenant_id: row.tenant_id,
    entity,
    entity_id: row.id,
    op: "insert",
    payload: structuredClone(row),
    status: "pending",
    created_at: Date.now(),
    attempts: 0,
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
