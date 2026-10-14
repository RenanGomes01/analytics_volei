import { canonicalJson } from "@/domain/export/canonical-json";
import type { OutboxEntity } from "@/domain/types";
import type { SupabaseLike } from "@/services/sync/supabase-transport";

/**
 * Servidor Supabase falso, em memória, com a MESMA semântica das RPCs de
 * supabase/migrations/0001_cloud_sync.sql + 0002_editable_matches.sql (o SQL em si é testado em
 * tests/sql/ com PGlite).
 */
export class FakeSupabase implements SupabaseLike {
  /** Antes do 0002 (Fase 8), partidas só aceitavam insert. */
  editableMatches = true;
  seq = 0;
  user: string | null = "user-1";
  offline = false;
  /** Erro do servidor (não de rede) em toda chamada, ex.: um 500 persistente. */
  failWith: string | null = null;
  calls: { fn: string; size: number }[] = [];
  private readonly mutations = new Map<string, number>();
  readonly rows = new Map<string, { entity: OutboxEntity; id: string; seq: number; data: Record<string, unknown>; deleted: boolean }>();

  auth = {
    getSession: async () => ({ data: { session: this.user ? { user: { id: this.user } } : null } }),
  };

  async rpc(fn: string, args: Record<string, unknown>) {
    if (this.offline) return { data: null, error: { message: "TypeError: Failed to fetch" } };
    if (this.failWith) return { data: null, error: { message: this.failWith, code: "XX000" } };
    if (!this.user) return { data: null, error: { message: "Não autenticado.", code: "28000" } };
    if (fn === "push_mutations") {
      const batch = args.batch as { mutation_id: string; entity: OutboxEntity; entity_id: string; op: string; payload: Record<string, unknown> }[];
      this.calls.push({ fn, size: batch.length });
      return { data: batch.map((m) => this.apply(m)), error: null };
    }
    if (fn === "pull_changes") {
      const since = args.p_since as number;
      const limit = args.p_limit as number;
      this.calls.push({ fn, size: limit });
      const data = [...this.rows.values()]
        .filter((r) => r.seq > since)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        // bigint chega como string em alguns clientes: o transporte converte.
        .map((r) => ({ entity: r.entity, entity_id: r.id, server_seq: String(r.seq), deleted: r.deleted, data: structuredClone(r.data) }));
      return { data, error: null };
    }
    return { data: null, error: { message: `Could not find the function ${fn}`, code: "PGRST202" } };
  }

  private apply(m: { mutation_id: string; entity: OutboxEntity; entity_id: string; op: string; payload: Record<string, unknown> }) {
    const known = this.mutations.get(m.mutation_id);
    if (known !== undefined) return { mutation_id: m.mutation_id, status: "acked", server_seq: known, reason: null };
    // sync_table(): o ledger só aceita insert (e partidas também, antes do 0002).
    if (m.op !== "insert" && (m.entity === "rally_event" || (m.entity === "match" && !this.editableMatches))) {
      return { mutation_id: m.mutation_id, status: "conflict", server_seq: null, reason: `${m.entity} só aceita insert (recebeu ${m.op}).` };
    }
    const data = structuredClone(m.payload);
    delete data.tenant_id;
    const key = `${m.entity}:${m.entity_id}`;
    const existing = this.rows.get(key);
    let seq: number;
    if (m.op === "insert") {
      if (existing && canonicalJson(existing.data) !== canonicalJson(data)) {
        return { mutation_id: m.mutation_id, status: "conflict", server_seq: null, reason: `${m.entity} ${m.entity_id} já existe com outro conteúdo.` };
      }
      seq = existing?.seq ?? ++this.seq;
      if (!existing) this.rows.set(key, { entity: m.entity, id: m.entity_id, seq, data, deleted: false });
    } else {
      seq = ++this.seq;
      this.rows.set(key, { entity: m.entity, id: m.entity_id, seq, data, deleted: m.op === "delete" });
    }
    this.mutations.set(m.mutation_id, seq);
    return { mutation_id: m.mutation_id, status: "acked", server_seq: seq, reason: null };
  }
}

