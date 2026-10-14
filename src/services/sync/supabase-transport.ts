import type { OutboxEntity, OutboxEntry } from "@/domain/types";
import type { PullSource, PulledChange } from "./pull-service";
import type { PushResult, SyncTransport } from "./transport";

/**
 * Transporte real (Fase 8): o outbox vai para a RPC `push_mutations` e o pull vem de `pull_changes`
 * (ver supabase/migrations/0001_cloud_sync.sql). Um lote = uma chamada = uma transação no Postgres.
 * Idempotência garantida no servidor por mutation_id e por entidade.
 *
 * Depende só desta fatia mínima do cliente do Supabase (o SDK é carregado sob demanda em
 * supabase-client.ts), o que também permite testar com um cliente falso.
 */
export interface RpcError {
  message: string;
  code?: string;
}

export interface SupabaseLike {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  };
}

/** Sem conta conectada ou sessão vencida: o lote volta para a fila até a pessoa entrar de novo. */
export class SyncAuthError extends Error {}

interface PushRow {
  mutation_id: string;
  status: "acked" | "conflict";
  server_seq: number | string | null;
  reason: string | null;
}

interface PullRow {
  entity: OutboxEntity;
  entity_id: string;
  server_seq: number | string;
  deleted: boolean;
  data: Record<string, unknown>;
}

/** Mensagem curta em PT-BR para o selo de sync. */
export function describeRpcError(error: RpcError): string {
  const text = `${error.code ?? ""} ${error.message}`;
  if (/JWT|PGRST30[0-3]|28000|Não autenticado/i.test(text)) return "Sessão expirada: entre na conta de novo.";
  if (/fetch|network|Failed to|Load failed|ECONN|timeout/i.test(text)) return "Sem conexão com o servidor.";
  if (/PGRST202|push_mutations|pull_changes/.test(text) && /not find|não encontr/i.test(text)) {
    return "O banco na nuvem não está configurado (rode o SQL da Fase 8 no Supabase).";
  }
  return `Erro do servidor: ${error.message}`;
}

export class SupabaseTransport implements SyncTransport, PullSource {
  constructor(private readonly client: SupabaseLike) {}

  private async requireSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new SyncAuthError("Entre na conta para sincronizar.");
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    await this.requireSession();
    const { data, error } = await this.client.rpc(fn, args);
    if (error) {
      const message = describeRpcError(error);
      throw message.startsWith("Sessão") ? new SyncAuthError(message) : new Error(message);
    }
    return Array.isArray(data) ? (data as T[]) : [];
  }

  async push(batch: readonly OutboxEntry[]): Promise<PushResult[]> {
    const wire = batch.map(({ mutation_id, entity, entity_id, op, payload }) => ({ mutation_id, entity, entity_id, op, payload }));
    const rows = await this.call<PushRow>("push_mutations", { batch: wire });
    return rows.map((r): PushResult =>
      r.status === "acked" && r.server_seq !== null
        ? { mutation_id: r.mutation_id, status: "acked", server_seq: Number(r.server_seq) }
        : r.status === "conflict"
          ? { mutation_id: r.mutation_id, status: "conflict", reason: r.reason ?? "Conflito no servidor." }
          : { mutation_id: r.mutation_id, status: "retry", reason: "Resposta inesperada do servidor." },
    );
  }

  async pull(since: number, limit: number): Promise<PulledChange[]> {
    const rows = await this.call<PullRow>("pull_changes", { p_since: since, p_limit: limit });
    return rows.map((r) => ({ entity: r.entity, entity_id: r.entity_id, server_seq: Number(r.server_seq), deleted: r.deleted, data: r.data }));
  }
}
