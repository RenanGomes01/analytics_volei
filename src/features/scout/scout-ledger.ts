import type { RallyEvent } from "@/domain/types";

/**
 * Ledger em memória da tela de scout (Fase 14): eventos gravados ∪ eventos ainda na fila de gravação.
 *
 * A tela continua sendo f(ledger) — placar, rali e sugestões saem de `replayMatch` —, mas sobre este
 * ledger em memória: um lance aparece no mesmo toque, sem esperar o IndexedDB. A gravação roda em
 * segundo plano numa fila SERIAL (um comando = um lote = uma transação, na ordem dos toques). Se um
 * lote falha, a fila para nele (ordem preservada, como o outbox), tenta de novo com espera crescente
 * e o erro fica visível. Nenhum lance planejado é descartado.
 *
 * Um evento sai da parte "local" só quando aparece na leitura do banco (`setPersisted`): entre o fim
 * da gravação e a releitura do useLiveQuery o placar nunca "volta".
 */

export interface LedgerSnapshot {
  /** Ledger completo para o replay (gravados + pendentes). */
  events: readonly RallyEvent[];
  /** A primeira leitura do banco já chegou. */
  loaded: boolean;
  /** Eventos ainda não confirmados pelo IndexedDB. */
  unsaved: number;
  /** Última falha de gravação (a fila está parada esperando a retentativa). */
  error: string | null;
  /** Duração (ms) das últimas gravações, do toque até o commit. */
  timings: readonly number[];
}

export interface ScoutLedgerOptions {
  /** Esperas entre retentativas automáticas; a última se repete. */
  retryDelaysMs?: readonly number[];
  /** Gravação acima disto vira aviso no console (diagnóstico no tablet). */
  slowWriteMs?: number;
  now?: () => number;
}

interface Batch {
  events: readonly RallyEvent[];
  submitted_at: number;
}

const MAX_TIMINGS = 20;

export class ScoutLedger {
  private persisted: readonly RallyEvent[] = [];
  private persistedIds = new Set<string>();
  private loaded = false;
  private readonly local = new Map<string, RallyEvent>();
  private readonly queue: Batch[] = [];
  private writing = false;
  private attempt = 0;
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timings: number[] = [];
  private snapshot: LedgerSnapshot;
  private readonly listeners = new Set<() => void>();
  private idleWaiters: (() => void)[] = [];
  private disposed = false;
  private readonly retryDelaysMs: readonly number[];
  private readonly slowWriteMs: number;
  private readonly now: () => number;

  constructor(
    private readonly persist: (events: readonly RallyEvent[]) => Promise<void>,
    { retryDelaysMs = [1_000, 2_000, 5_000, 10_000], slowWriteMs = 1_000, now = () => performance.now() }: ScoutLedgerOptions = {},
  ) {
    this.retryDelaysMs = retryDelaysMs;
    this.slowWriteMs = slowWriteMs;
    this.now = now;
    this.snapshot = this.build();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): LedgerSnapshot => this.snapshot;

  /** Ledger atual, já com o que acabou de ser tocado (mesmo antes do React renderizar de novo). */
  get events(): readonly RallyEvent[] {
    return this.snapshot.events;
  }

  /** Resultado do useLiveQuery: o que está no IndexedDB (inclui o que veio de fora, ex.: importação). */
  setPersisted(events: readonly RallyEvent[]): void {
    this.persisted = events;
    this.persistedIds = new Set(events.map((e) => e.id));
    this.loaded = true;
    for (const id of this.local.keys()) if (this.persistedIds.has(id)) this.local.delete(id);
    this.changed();
  }

  /** Acrescenta eventos planejados: aparecem na hora e entram na fila de gravação. */
  submit(events: readonly RallyEvent[]): void {
    if (events.length === 0 || this.disposed) return;
    for (const e of events) this.local.set(e.id, e);
    this.queue.push({ events, submitted_at: this.now() });
    this.changed();
    void this.drain();
  }

  /** "Tentar de novo" (sem esperar a próxima retentativa automática). */
  retry(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    void this.drain();
  }

  /** Resolve quando a fila esvazia (testes e "Sair"). */
  whenIdle(): Promise<void> {
    if (this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Para as retentativas automáticas (a tela foi desmontada). A fila em memória não é descartada. */
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.writing || this.timer !== undefined) return;
    this.writing = true;
    try {
      while (this.queue.length > 0) {
        const head = this.queue[0];
        try {
          await this.persist(head.events);
        } catch (e) {
          this.error = e instanceof Error ? e.message : String(e);
          console.warn("[scout] gravação falhou; nova tentativa em breve", e);
          const delay = this.retryDelaysMs[Math.min(this.attempt, this.retryDelaysMs.length - 1)];
          this.attempt += 1;
          if (!this.disposed) {
            this.timer = setTimeout(() => {
              this.timer = undefined;
              void this.drain();
            }, delay);
          }
          this.changed();
          return;
        }
        this.queue.shift();
        this.attempt = 0;
        this.error = null;
        const ms = Math.round(this.now() - head.submitted_at);
        this.timings = [...this.timings, ms].slice(-MAX_TIMINGS);
        if (ms > this.slowWriteMs) console.warn(`[scout] gravação lenta: ${ms} ms (${head.events.length} eventos)`);
        this.changed();
      }
    } finally {
      this.writing = false;
    }
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private build(): LedgerSnapshot {
    const pending = [...this.local.values()].filter((e) => !this.persistedIds.has(e.id));
    return {
      events: pending.length ? [...this.persisted, ...pending] : this.persisted,
      loaded: this.loaded,
      unsaved: this.queue.reduce((n, b) => n + b.events.length, 0),
      error: this.error,
      timings: this.timings,
    };
  }

  private changed(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }
}
