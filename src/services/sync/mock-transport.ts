import { canonicalJson } from "@/domain/export/canonical-json";
import type { OutboxEntry } from "@/domain/types";
import type { PushResult, SyncTransport } from "./transport";

export interface MockTransportOptions {
  latencyMs?: number;
  /** Probabilidade (0–1) de uma mutação nova voltar como `retry`. */
  failureRate?: number;
  offline?: boolean;
  /** Último server_seq já emitido (para continuar a sequência após recarregar a página). */
  startSeq?: number;
  random?: () => number;
}

/**
 * Servidor de mentira, em memória. Faz o que o back-end real terá de fazer:
 * server_seq monotônico, idempotência por mutation_id E por entidade (mesmo conteúdo = mesmo
 * server_seq) e conflito quando a mesma entidade chega com conteúdo diferente.
 */
export class MockTransport implements SyncTransport {
  private seq: number;
  private readonly acked = new Map<string, number>();
  /** Conteúdo e server_seq de cada entidade já gravada (idempotência por entity_id). */
  private readonly entities = new Map<string, { payload: string; seq: number }>();
  private offline: boolean;

  constructor(private readonly options: MockTransportOptions = {}) {
    this.seq = options.startSeq ?? 0;
    this.offline = options.offline ?? false;
  }

  setOffline(offline: boolean) {
    this.offline = offline;
  }

  get lastSeq() {
    return this.seq;
  }

  async push(batch: readonly OutboxEntry[]): Promise<PushResult[]> {
    if (this.options.latencyMs) await new Promise((r) => setTimeout(r, this.options.latencyMs));
    if (this.offline) throw new Error("Servidor indisponível (mock offline).");
    const random = this.options.random ?? Math.random;

    return batch.map((entry): PushResult => {
      const { mutation_id } = entry;
      const known = this.acked.get(mutation_id);
      if (known !== undefined) return { mutation_id, status: "acked", server_seq: known };
      if (this.options.failureRate && random() < this.options.failureRate) {
        return { mutation_id, status: "retry", reason: "Falha simulada do servidor." };
      }

      const key = `${entry.tenant_id}:${entry.entity}:${entry.entity_id}`;
      const payload = canonicalJson(entry.payload);
      const previous = this.entities.get(key);
      // Cadastro editável: upsert sobrescreve e delete remove; cada mudança ganha um server_seq novo.
      if (entry.op === "upsert" || entry.op === "delete") {
        this.seq += 1;
        if (entry.op === "upsert") this.entities.set(key, { payload, seq: this.seq });
        else this.entities.delete(key);
        this.acked.set(mutation_id, this.seq);
        return { mutation_id, status: "acked", server_seq: this.seq };
      }
      if (previous && previous.payload !== payload) {
        return { mutation_id, status: "conflict", reason: `${entry.entity} ${entry.entity_id} já existe com outro conteúdo.` };
      }
      if (previous) {
        // Mesma entidade e mesmo conteúdo com outro mutation_id (ex.: partida importada em outro
        // aparelho): não duplica, devolve o server_seq já existente.
        this.acked.set(mutation_id, previous.seq);
        return { mutation_id, status: "acked", server_seq: previous.seq };
      }

      this.seq += 1;
      this.entities.set(key, { payload, seq: this.seq });
      this.acked.set(mutation_id, this.seq);
      return { mutation_id, status: "acked", server_seq: this.seq };
    });
  }
}
