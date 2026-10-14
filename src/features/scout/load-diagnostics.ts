import { getDB, getDBHealth } from "@/db/client";
import type { OutboxEntry } from "@/domain/types";

/**
 * Diagnóstico de "a partida não abre" (Fase 14). Cada leitura tem prazo próprio: se o IndexedDB
 * está travado, "sem resposta" já é a resposta — e a tela mostra o motivo em vez de girar para sempre.
 */

export interface DiagnosticLine {
  label: string;
  value: string;
}

const PROBE_TIMEOUT_MS = 3_000;
const NO_ANSWER = "sem resposta (banco travado?)";

async function probe<T>(read: () => Promise<T>, format: (value: T) => string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(NO_ANSWER), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read().then(format), timeout]);
  } catch (e) {
    return `erro: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
}

const mb = (bytes: number | undefined) => (bytes === undefined ? "?" : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export async function collectLoadDiagnostics(matchId: string, elapsedMs: number): Promise<DiagnosticLine[]> {
  const health = getDBHealth();
  const lines: DiagnosticLine[] = [
    { label: "Tempo esperando", value: `${Math.round(elapsedMs / 1000)} s` },
    { label: "Bloqueado por outra aba", value: health.blocked ? "sim — feche as outras abas/janelas do Scout" : "não" },
  ];
  if (health.versionChanged) lines.push({ label: "Versão do banco", value: "atualizada por outra aba — recarregue" });

  let db;
  try {
    db = getDB();
  } catch (e) {
    lines.push({ label: "Banco local", value: `erro: ${e instanceof Error ? e.message : String(e)}` });
    return lines;
  }

  const count = (status: OutboxEntry["status"]) => db.outbox.where("status").equals(status).count();
  const [open, match, events, queue, storage] = await Promise.all([
    probe(() => db.open().then(() => db.verno), (v) => `aberto (versão ${v})`),
    probe(() => db.matches.get(matchId), (m) => (m ? `encontrada${m.deleted_at ? " (na lixeira)" : ""}` : "não está neste aparelho")),
    probe(() => db.rally_events.where("[match_id+local_seq]").between([matchId, -Infinity], [matchId, Infinity]).count(), String),
    probe(
      () => Promise.all([count("pending"), count("sent"), count("conflict"), count("acked")]),
      ([p, s, c, a]) => `${p} pendentes · ${s} enviando · ${c} recusados · ${a} confirmados`,
    ),
    probe(
      async () => (navigator.storage?.estimate ? navigator.storage.estimate() : undefined),
      (e) => (e ? `${mb(e.usage)} de ${mb(e.quota)}` : "indisponível"),
    ),
  ]);
  lines.push(
    { label: "Banco local", value: open },
    { label: "Partida", value: match },
    { label: "Lances da partida", value: events },
    { label: "Fila de sincronização", value: queue },
    { label: "Espaço usado", value: storage },
  );
  return lines;
}
