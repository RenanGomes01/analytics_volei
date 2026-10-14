import type { OutboxEntity, OutboxEntry, OutboxOp } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { enqueue } from "../outbox-service";
import { SKIP_AFTER_ATTEMPTS, isTransientError } from "./sync-summary";
import { PULL_CURSOR_KEY } from "./sync-keys";

/**
 * Recuperação de falhas do sync (Fase 10), acionada pela central de sincronização. Cada ação é uma
 * transação e só mexe no outbox (e, em "usar a nuvem", no cursor do pull). O ledger nunca é tocado.
 *
 *  - retry:     lance → reenvia a mesma mutação (idempotente). Cadastro/partida → envia o ESTADO
 *               ATUAL do registro com mutation_id novo e marca as mutações antigas dessa entidade
 *               como superadas: uma versão velha nunca sobrescreve uma nova.
 *  - acceptRemote: descarta a mudança local pendente/recusada e refaz o pull do zero; sem mudança local
 *               protegida, a versão da nuvem entra. Não existe para lances.
 *  - dismiss:   tira da fila de revisão (fica só para auditoria).
 *  - skipHead:  a cabeça da fila falhou 5+ vezes por erro que não é de rede → vai para revisão e o
 *               resto da fila volta a andar.
 */

const SUPERSEDED = "Substituído por um reenvio mais novo.";

async function requireEntry(db: ScoutDB, tenant_id: string, mutation_id: string): Promise<OutboxEntry> {
  const entry = await db.outbox.get(mutation_id);
  if (!entry || entry.tenant_id !== tenant_id) throw new Error("Item da fila não encontrado.");
  return entry;
}

/** Estado atual do registro neste aparelho, no formato do outbox (ou null se foi excluído). */
async function currentRow(db: ScoutDB, entity: OutboxEntity, id: string): Promise<{ id: string; tenant_id: string } | null> {
  switch (entity) {
    case "athlete":
      return (await db.athletes.get(id)) ?? null;
    case "team":
      return (await db.teams.get(id)) ?? null;
    case "tournament":
      return (await db.tournaments.get(id)) ?? null;
    case "tournament_entry":
      return (await db.tournament_entries.get(id)) ?? null;
    case "match":
      return (await db.matches.get(id)) ?? null;
    case "athlete_alias": {
      const row = await db.athlete_aliases.get(id);
      return row ? { ...row, id: row.alias_id } : null;
    }
    case "rally_event":
      return null;
  }
}

/** Mutações desta entidade ainda não confirmadas (pendentes ou recusadas). */
function unconfirmed(db: ScoutDB, tenant_id: string, entity: OutboxEntity, entity_id: string) {
  return db.outbox
    .where("entity_id")
    .equals(entity_id)
    .filter((e) => e.tenant_id === tenant_id && e.entity === entity && (e.status === "pending" || e.status === "sent" || e.status === "conflict"));
}

const RETRY_TABLES = (db: ScoutDB) => [db.outbox, db.athletes, db.teams, db.tournaments, db.tournament_entries, db.matches, db.athlete_aliases];

export async function retryEntry(db: ScoutDB, tenant_id: string, mutation_id: string, now = Date.now()): Promise<OutboxEntry> {
  return db.transaction("rw", RETRY_TABLES(db), async () => {
    const entry = await requireEntry(db, tenant_id, mutation_id);
    if (entry.entity === "rally_event") {
      const changes = { status: "pending" as const, attempts: 0, next_attempt_at: now, last_attempt_at: null, last_error: null };
      await db.outbox.update(mutation_id, changes);
      return { ...entry, ...changes };
    }
    const row = await currentRow(db, entry.entity, entry.entity_id);
    let op: OutboxOp;
    let payload: { id: string; tenant_id: string };
    if (!row) {
      op = "delete";
      payload = entry.payload as { id: string; tenant_id: string };
    } else {
      op = entry.entity === "match" && (row as { deleted_at?: number }).deleted_at ? "delete" : "upsert";
      payload = row;
    }
    await unconfirmed(db, tenant_id, entry.entity, entry.entity_id).modify({ status: "dismissed", last_error: SUPERSEDED });
    return enqueue(db, entry.entity, payload, op);
  });
}

export async function acceptRemote(db: ScoutDB, tenant_id: string, mutation_id: string): Promise<void> {
  await db.transaction("rw", db.outbox, db.meta, async () => {
    const entry = await requireEntry(db, tenant_id, mutation_id);
    if (entry.entity === "rally_event") throw new Error("Lances nunca são substituídos pela versão da nuvem.");
    await unconfirmed(db, tenant_id, entry.entity, entry.entity_id).modify({ status: "dismissed", last_error: "Descartado: vale a versão da nuvem." });
    // Refaz o pull do zero (idempotente): agora sem mudança local protegida, a versão da nuvem entra.
    await db.meta.delete(PULL_CURSOR_KEY);
  });
}

export async function dismissEntry(db: ScoutDB, tenant_id: string, mutation_id: string): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const entry = await requireEntry(db, tenant_id, mutation_id);
    if (entry.status !== "conflict") throw new Error("Só itens recusados pela nuvem podem ser ignorados.");
    await db.outbox.update(mutation_id, { status: "dismissed" });
  });
}

export async function skipHead(db: ScoutDB, tenant_id: string, mutation_id: string): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const entry = await requireEntry(db, tenant_id, mutation_id);
    if (entry.status !== "pending") throw new Error("Este item não está mais parado na fila.");
    if (isTransientError(entry.last_error)) throw new Error("Falha de conexão ou de login: o envio continua sozinho quando voltar.");
    if (entry.attempts < SKIP_AFTER_ATTEMPTS) throw new Error(`Só dá para pular depois de ${SKIP_AFTER_ATTEMPTS} tentativas.`);
    await db.outbox.update(mutation_id, { status: "conflict", last_error: `Pulado após ${entry.attempts} tentativas: ${entry.last_error}` });
  });
}
