import type { Table } from "dexie";
import { canonicalJson } from "@/domain/export/canonical-json";
import type { OutboxEntity, RallyEvent } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { LAST_PULL_KEY, PULL_CONFLICTS_KEY, PULL_CURSOR_KEY } from "./sync-keys";

/**
 * Pull (Fase 8): traz para o Dexie o que a conta tem na nuvem (ex.: partidas scouteadas no tablet
 * aparecem no PC). A tela continua lendo só o Dexie; o pull grava direto nas tabelas, SEM outbox
 * (o dado já está no servidor).
 *
 * Mesclagem:
 *  - lances (imutáveis): só acrescenta. Mesmo id com conteúdo diferente → mantém o local e registra
 *    a divergência. Nunca sobrescreve o ledger.
 *  - cadastro e partidas (Fase 10: partida editável): vale a versão do servidor (maior server_seq),
 *    exceto se há mudança local ainda não enviada — essa ganha e vai subir depois. Lápide remove;
 *    a de partida vira exclusão lógica (`deleted_at`), porque os lances dela continuam no ledger.
 */

export interface PulledChange {
  entity: OutboxEntity;
  entity_id: string;
  server_seq: number;
  deleted: boolean;
  /** Linha como no Dexie, sem tenant_id. */
  data: Record<string, unknown>;
}

/** Origem do pull. Implementações: SupabaseTransport e o servidor falso dos testes. */
export interface PullSource {
  pull(since: number, limit: number): Promise<PulledChange[]>;
}

export interface PullConflict {
  entity: OutboxEntity;
  entity_id: string;
  match_id?: string;
  reason: string;
}

export interface PullReport {
  pages: number;
  applied: number;
  skipped: number;
  conflicts: number;
  cursor: number;
}

export interface PullOptions {
  tenant_id: string;
  pageSize?: number;
  maxPages?: number;
  now?: () => number;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export async function getPullCursor(db: ScoutDB): Promise<number> {
  const value = (await db.meta.get(PULL_CURSOR_KEY))?.value;
  return typeof value === "number" ? value : 0;
}

function tableOf(db: ScoutDB, entity: OutboxEntity): Table<unknown, string> {
  const tables: Record<OutboxEntity, Table<unknown, string>> = {
    athlete: db.athletes,
    team: db.teams,
    tournament: db.tournaments,
    tournament_entry: db.tournament_entries,
    athlete_alias: db.athlete_aliases,
    match: db.matches,
    rally_event: db.rally_events,
  };
  return tables[entity];
}

/** Linha do servidor → linha do Dexie (tenant local; o alias usa `alias_id` como chave, sem `id`). */
function toLocalRow(change: PulledChange, tenant_id: string): Record<string, unknown> {
  const row: Record<string, unknown> = { ...change.data, tenant_id };
  if (change.entity === "athlete_alias") {
    delete row.id;
    row.alias_id = change.entity_id;
  }
  return row;
}

/** Aplica uma página numa transação única, junto com o cursor: ou grava tudo, ou nada. */
export async function applyPulledPage(
  db: ScoutDB,
  tenant_id: string,
  changes: readonly PulledChange[],
  now: number,
): Promise<Omit<PullReport, "pages">> {
  const tables = [db.athletes, db.teams, db.tournaments, db.tournament_entries, db.athlete_aliases, db.matches, db.rally_events, db.outbox, db.meta];
  return db.transaction("rw", tables, async () => {
    const report = { applied: 0, skipped: 0, conflicts: 0, cursor: await getPullCursor(db) };
    // Mudanças locais ainda não confirmadas pelo servidor ganham do eco remoto — inclusive as
    // recusadas (`conflict`), que esperam a decisão do analista na central de sincronização.
    const ids = [...new Set(changes.map((c) => c.entity_id))];
    const unsent = new Set(
      (await db.outbox.where("entity_id").anyOf(ids).toArray())
        .filter((e) => e.tenant_id === tenant_id && (e.status === "pending" || e.status === "sent" || e.status === "conflict"))
        .map((e) => `${e.entity}:${e.entity_id}`),
    );
    const found: PullConflict[] = [];

    // Sem N+1: as linhas locais da página saem num bulkGet por tabela, e as posições do ledger já
    // ocupadas numa consulta por partida (não uma ida ao IndexedDB por mudança).
    const localRows = new Map<string, unknown>();
    const byEntity = new Map<OutboxEntity, string[]>();
    for (const c of changes) byEntity.set(c.entity, [...(byEntity.get(c.entity) ?? []), c.entity_id]);
    for (const [entity, entityIds] of byEntity) {
      const rows = await tableOf(db, entity).bulkGet(entityIds);
      entityIds.forEach((eid, i) => rows[i] !== undefined && localRows.set(`${entity}:${eid}`, rows[i]));
    }
    const usedSeqs = new Map<string, Set<number>>();
    for (const matchId of new Set(changes.filter((c) => c.entity === "rally_event").map((c) => String(c.data.match_id)))) {
      // Só as chaves do índice composto ([match_id, local_seq]): nenhum lance é carregado.
      const keys = await db.rally_events.where("[match_id+local_seq]").between([matchId, -Infinity], [matchId, Infinity]).keys();
      usedSeqs.set(matchId, new Set(keys.map((k) => (k as unknown as [string, number])[1])));
    }

    for (const change of changes) {
      report.cursor = Math.max(report.cursor, change.server_seq);
      const table = tableOf(db, change.entity);
      const row = toLocalRow(change, tenant_id);
      const local = localRows.get(`${change.entity}:${change.entity_id}`);

      if (change.entity === "rally_event") {
        if (change.deleted || (local && same(local, row))) {
          report.skipped += 1;
          continue;
        }
        if (local) {
          found.push({ entity: change.entity, entity_id: change.entity_id, reason: "Mesmo id com conteúdo diferente: mantida a versão deste aparelho." });
          continue;
        }
        // Outro aparelho já usou esta posição do ledger: a partida foi scouteada em dois aparelhos.
        const event = row as unknown as RallyEvent;
        const used = usedSeqs.get(event.match_id) ?? new Set<number>();
        if (used.has(event.local_seq)) found.push({ entity: "rally_event", entity_id: event.id, match_id: event.match_id, reason: "Partida scouteada em mais de um aparelho." });
        used.add(event.local_seq);
        usedSeqs.set(event.match_id, used);
        await table.add(row);
        localRows.set(`${change.entity}:${change.entity_id}`, row);
        report.applied += 1;
        continue;
      }

      if (unsent.has(`${change.entity}:${change.entity_id}`)) {
        report.skipped += 1;
        continue;
      }
      if (change.deleted && change.entity === "match") {
        // Partida na lixeira: a linha fica (os lances continuam no ledger), só some das listas.
        const tombstone = { ...row, deleted_at: typeof row.deleted_at === "number" ? row.deleted_at : now };
        if (local && same(local, tombstone)) report.skipped += 1;
        else {
          await table.put(tombstone);
          localRows.set(`${change.entity}:${change.entity_id}`, tombstone);
          report.applied += 1;
        }
        continue;
      }
      if (change.deleted) {
        if (local) {
          await table.delete(change.entity_id);
          localRows.delete(`${change.entity}:${change.entity_id}`);
          report.applied += 1;
        } else report.skipped += 1;
        continue;
      }
      if (local && same(local, row)) {
        report.skipped += 1;
        continue;
      }
      await table.put(row);
      localRows.set(`${change.entity}:${change.entity_id}`, row);
      report.applied += 1;
    }

    if (found.length) {
      const previous = (await db.meta.get(PULL_CONFLICTS_KEY))?.value;
      const list = Array.isArray(previous) ? (previous as PullConflict[]) : [];
      const seen = new Set(list.map((c) => `${c.entity}:${c.entity_id}`));
      for (const c of found) if (!seen.has(`${c.entity}:${c.entity_id}`)) list.push(c);
      await db.meta.put({ key: PULL_CONFLICTS_KEY, value: list });
    }
    report.conflicts = found.length;
    await db.meta.put({ key: PULL_CURSOR_KEY, value: report.cursor });
    await db.meta.put({ key: LAST_PULL_KEY, value: now });
    return report;
  });
}

/** Baixa página a página até alcançar o servidor. Erro de rede = exceção (o cursor fica onde estava). */
export async function runPull(db: ScoutDB, source: PullSource, { tenant_id, pageSize = 1000, maxPages = 100, now = Date.now }: PullOptions): Promise<PullReport> {
  const report: PullReport = { pages: 0, applied: 0, skipped: 0, conflicts: 0, cursor: await getPullCursor(db) };
  for (let i = 0; i < maxPages; i++) {
    const changes = await source.pull(report.cursor, pageSize);
    if (changes.length === 0) {
      if (i === 0) await db.meta.put({ key: LAST_PULL_KEY, value: now() });
      break;
    }
    const page = await applyPulledPage(db, tenant_id, changes, now());
    report.pages += 1;
    report.applied += page.applied;
    report.skipped += page.skipped;
    report.conflicts += page.conflicts;
    report.cursor = page.cursor;
    if (changes.length < pageSize) break;
  }
  return report;
}

export async function listPullConflicts(db: ScoutDB): Promise<PullConflict[]> {
  const value = (await db.meta.get(PULL_CONFLICTS_KEY))?.value;
  return Array.isArray(value) ? (value as PullConflict[]) : [];
}
