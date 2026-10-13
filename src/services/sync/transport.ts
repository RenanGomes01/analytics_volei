import type { OutboxEntry } from "@/domain/types";

/** Resultado do servidor para UMA mutação do lote. */
export type PushResult =
  | { mutation_id: string; status: "acked"; server_seq: number }
  | { mutation_id: string; status: "conflict"; reason: string }
  | { mutation_id: string; status: "retry"; reason: string };

/**
 * Porta de saída do sync. Implementações: MockTransport (agora) e um transporte HTTP (futuro).
 * Contrato: idempotente por `mutation_id` (reenviar devolve o mesmo server_seq) e um resultado por
 * mutação. Lançar uma exceção significa "rede indisponível": o lote inteiro volta para a fila.
 */
export interface SyncTransport {
  push(batch: readonly OutboxEntry[]): Promise<PushResult[]>;
}
