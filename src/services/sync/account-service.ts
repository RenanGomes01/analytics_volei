import type { ScoutDB } from "@/db/schema";
import { ACCOUNT_KEY, BLOCKED_KEY, LAST_PULL_KEY, LAST_SUCCESS_KEY, PULL_CONFLICTS_KEY, PULL_CURSOR_KEY, PULL_ERROR_KEY } from "./sync-keys";

/**
 * Vínculo aparelho ↔ conta da nuvem (Fase 8). O sync só envia depois que a pessoa confirma o
 * vínculo — assim o histórico deste aparelho nunca vai para uma conta por engano.
 */

export async function getLinkedAccount(db: ScoutDB): Promise<string | null> {
  const value = (await db.meta.get(ACCOUNT_KEY))?.value;
  return typeof value === "string" ? value : null;
}

/** Quantos registros deste aparelho sobem para a nuvem ao vincular (tudo, menos os dados de teste). */
export async function countSyncable(db: ScoutDB, tenant_id: string): Promise<number> {
  return db.outbox.where("tenant_id").equals(tenant_id).filter((e) => e.status !== "local_only").count();
}

/**
 * Vincula o aparelho à conta. Na primeira vez (ou ao trocar de conta) TODO o histórico volta para a
 * fila — inclusive o que o MockTransport ou outra conta já tinham confirmado — e o pull recomeça do
 * zero. Nada local é apagado. Devolve quantas entradas voltaram para a fila.
 */
export async function linkAccount(db: ScoutDB, tenant_id: string, user_id: string): Promise<number> {
  return db.transaction("rw", db.outbox, db.meta, async () => {
    if ((await getLinkedAccount(db)) === user_id) return 0;
    const requeued = await db.outbox
      .where("tenant_id")
      .equals(tenant_id)
      .filter((e) => e.status === "acked" || e.status === "conflict")
      .modify((e) => {
        e.status = "pending";
        e.attempts = 0;
        e.next_attempt_at = e.created_at;
        e.last_attempt_at = null;
        e.last_error = null;
        e.server_seq = null;
      });
    await db.meta.bulkDelete([PULL_CURSOR_KEY, LAST_PULL_KEY, PULL_CONFLICTS_KEY, PULL_ERROR_KEY, LAST_SUCCESS_KEY]);
    await db.meta.put({ key: ACCOUNT_KEY, value: user_id });
    return requeued;
  });
}

/** Grava um aviso do sync na `meta` só se mudou (evita re-render das telas a cada ciclo). */
export async function setSyncNotice(db: ScoutDB, key: typeof BLOCKED_KEY | typeof PULL_ERROR_KEY, message: string | null): Promise<void> {
  const current = (await db.meta.get(key))?.value ?? null;
  if (current === message) return;
  if (message === null) await db.meta.delete(key);
  else await db.meta.put({ key, value: message });
}

/** "Sincronizar agora": tira as entradas pendentes do backoff (ex.: depois de entrar na conta). */
export async function retryPendingNow(db: ScoutDB, tenant_id: string, now = Date.now()): Promise<number> {
  return db.outbox
    .where("status")
    .equals("pending")
    .filter((e) => e.tenant_id === tenant_id && e.next_attempt_at > now)
    .modify({ next_attempt_at: now });
}
