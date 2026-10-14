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
 *  - partida e lances (imutáveis): só acrescenta. Mesmo id com conteúdo diferente → mantém o local e
 *    registra a divergência. Nunca sobrescreve o ledger.
 *  - cadastro (atletas, duplas, torneios, vínculos, uniões): vale a versão do servidor (maior
 *    server_seq), exceto se há mudança local ainda não enviada — essa ganha e vai subir depois.
 *    Lápide remove.
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
    // Mudanças locais ainda não confirmadas pelo servidor: ganham do eco remoto.
    const ids = [...new Set(changes.map((c) => c.entity_id))];
    const unsent = new Set(
      (await db.outbox.where("entity_id").anyOf(ids).toArray())
        .filter((e) => e.tenant_id === tenant_id && (e.status === "pending" || e.status === "sent"))
        .map((e) => `${e.entity}:${e.entity_id}`),
    );
    const found: PullConflict[] = [];

    for (const change of changes) {
      report.cursor = Math.max(report.cursor, change.server_seq);
      const table = tableOf(db, change.entity);
      const row = toLocalRow(change, tenant_id);
      const local = await table.get(change.entity_id);

      if (change.entity === "match" || change.entity === "rally_event") {
        if (change.deleted || (local && same(local, row))) {
          report.skipped += 1;
          continue;
        }
        if (local) {
          found.push({ entity: change.entity, entity_id: change.entity_id, reason: "Mesmo id com conteúdo diferente: mantida a versão deste aparelho." });
          continue;
        }
        if (change.entity === "rally_event") {
          // Outro aparelho já usou esta posição do ledger: a partida foi scouteada em dois aparelhos.
          const event = row as unknown as RallyEvent;
          const clash = await db.rally_events.where("[match_id+local_seq]").equals([event.match_id, event.local_seq]).first();
          if (clash) found.push({ entity: "rally_event", entity_id: event.id, match_id: event.match_id, reason: "Partida scouteada em mais de um aparelho." });
        }
        await table.add(row);
        report.applied += 1;
        continue;
      }

      if (unsent.has(`${change.entity}:${change.entity_id}`)) {
        report.skipped += 1;
        continue;
      }
      if (change.deleted) {
        if (local) {
          await table.delete(change.entity_id);
          report.applied += 1;
        } else report.skipped += 1;
        continue;
      }
      if (local && same(local, row)) {
        report.skipped += 1;
        continue;
      }
      await table.put(row);
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
