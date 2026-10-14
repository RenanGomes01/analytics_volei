"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listPullConflicts } from "@/services/sync/pull-service";
import { dismissEntry, retryEntry, skipHead, acceptRemote } from "@/services/sync/recovery-service";
import { getSyncSummary, type SummaryGroup, type SyncIssue } from "@/services/sync/sync-summary";
import { useSyncActivity } from "@/features/sync/sync-activity";
import { requestSyncNow } from "@/features/sync/sync-config";
import { useSyncStatus } from "@/features/sync/use-sync-status";

const time = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const clock = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" });
const n = new Intl.NumberFormat("pt-BR");
const plural = (count: number, one: string, many: string) => `${n.format(count)} ${count === 1 ? one : many}`;

const GROUPS: [SummaryGroup, string, string][] = [
  ["match", "partida", "partidas"],
  ["athlete", "atleta", "atletas"],
  ["team", "dupla", "duplas"],
  ["tournament", "torneio", "torneios"],
  ["link", "vínculo com torneio", "vínculos com torneio"],
];

const card = "flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4";
const action = "min-h-12 rounded-xl px-4 font-semibold disabled:opacity-40";

/**
 * Central de sincronização (Fase 10): o que está retido neste aparelho, um botão grande para
 * enviar, onde o envio parou e o que a nuvem recusou — cada falha com o motivo e o que fazer.
 */
export function SyncCenter() {
  const summary = useLiveQuery(() => getSyncSummary(getDB(), LOCAL_TENANT_ID), []);
  const pullConflicts = useLiveQuery(() => listPullConflicts(getDB()), []);
  const status = useSyncStatus();
  const activity = useSyncActivity();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!summary || !status) return <p className="text-zinc-400">Carregando a fila…</p>;

  async function act(key: string, fn: () => Promise<unknown>, thenSync = true) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (thenSync) requestSyncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const waiting = GROUPS.filter(([g]) => summary.pending[g] > 0);
  const notices = [status.blocked, status.pull_error].filter((x): x is string => !!x);
  const { last } = activity;

  return (
    <section className={card} aria-labelledby="sync-center-title">
      <h2 id="sync-center-title" className="text-lg font-bold">
        Sincronização
      </h2>

      {summary.pendingTotal === 0 ? (
        <p className="rounded-xl bg-emerald-900/40 px-4 py-3 text-emerald-100">
          ✓ Tudo deste aparelho está na nuvem
          {status.last_success_at ? ` (último envio ${time.format(status.last_success_at)})` : ""}.
        </p>
      ) : (
        <div className="rounded-xl bg-zinc-800 px-4 py-3">
          <p className="font-semibold">Prontos para subir, guardados neste aparelho:</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-lg">
            {waiting.map(([g, one, many]) => (
              <li key={g}>
                <strong className="tabular-nums">{plural(summary.pending[g], one, many)}</strong>
                {g === "match" && summary.pendingEvents > 0 && <span className="text-zinc-400"> ({plural(summary.pendingEvents, "lance", "lances")})</span>}
              </li>
            ))}
            {waiting.length === 0 && summary.pendingEvents > 0 && <li>{plural(summary.pendingEvents, "lance", "lances")}</li>}
          </ul>
          {summary.pendingMatches.length > 0 && (
            <details className="mt-2 text-sm text-zinc-300">
              <summary className="min-h-10 cursor-pointer content-center">Ver partidas na fila</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {summary.pendingMatches.map((m) => (
                  <li key={m.match_id} className="flex justify-between gap-3">
                    <span className="truncate">{m.label}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">{m.events > 0 ? plural(m.events, "lance", "lances") : "dados da partida"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {notices.map((text) => (
        <p key={text} role="status" className="rounded-xl bg-amber-900/50 px-4 py-3 text-amber-100">
          ⚠ {text}
        </p>
      ))}

      <button
        type="button"
        onClick={requestSyncNow}
        disabled={activity.running}
        className="min-h-16 rounded-2xl bg-amber-400 px-6 text-xl font-bold text-zinc-950 active:scale-[0.99] disabled:opacity-60"
      >
        {activity.running ? "Sincronizando…" : "⟳ Sincronizar agora"}
      </button>
      <p className="text-sm text-zinc-400">
        {last
          ? last.error
            ? `Última tentativa (${clock.format(last.at)}): ${last.error}`
            : `Última sincronização manual (${clock.format(last.at)}): ${plural(last.acked, "item enviado", "itens enviados")}${last.conflicts ? ` · ${plural(last.conflicts, "com problema", "com problema")}` : ""}.`
          : `Último envio: ${status.last_success_at ? time.format(status.last_success_at) : "nunca"} · último recebimento: ${status.last_pull_at ? time.format(status.last_pull_at) : "nunca"}.`}
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
          {error}
        </p>
      )}

      {summary.stalled && (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-500/70 bg-amber-950/40 p-3">
          <p className="font-semibold text-amber-100">Envio parado em: {summary.stalled.label}</p>
          <p className="text-amber-50">{summary.stalled.reason}</p>
          <p className="text-sm text-amber-200/80">
            {plural(summary.stalled.attempts, "tentativa", "tentativas")}
            {` · próxima tentativa automática às ${clock.format(summary.stalled.next_attempt_at)}`}.{" "}
            {summary.stalled.transient
              ? "É falha de conexão ou de login: nada se perde e o envio continua sozinho."
              : "A fila espera este item para não enviar fora de ordem."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={requestSyncNow} className={`${action} bg-amber-400 text-zinc-950`}>
              Tentar agora
            </button>
            {summary.stalled.canSkip && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => act("skip", () => skipHead(getDB(), LOCAL_TENANT_ID, summary.stalled!.mutation_id))}
                className={`${action} bg-zinc-800`}
              >
                Pular e revisar depois
              </button>
            )}
          </div>
        </div>
      )}

      {summary.issues.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-red-300">
            {plural(summary.issues.length, "item recusado pela nuvem", "itens recusados pela nuvem")} — o resto continua subindo
          </h3>
          <ul className="flex flex-col gap-2">
            {summary.issues.map((issue) => (
              <IssueRow key={issue.mutation_id} issue={issue} busy={busy} onAct={act} />
            ))}
          </ul>
        </div>
      )}

      {(pullConflicts?.length ?? 0) > 0 && (
        <details className="text-sm">
          <summary className="min-h-10 cursor-pointer content-center text-zinc-300">
            {plural(pullConflicts!.length, "divergência ao baixar", "divergências ao baixar")} (a versão deste aparelho foi mantida)
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {pullConflicts!.slice(0, 20).map((c) => (
              <li key={`${c.entity}:${c.entity_id}`} className="rounded-lg bg-zinc-800 px-3 py-2">
                {c.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {summary.dismissed > 0 && <p className="text-xs text-zinc-500">{plural(summary.dismissed, "item descartado ou substituído", "itens descartados ou substituídos")} (histórico).</p>}
    </section>
  );
}

function IssueRow({
  issue,
  busy,
  onAct,
}: {
  issue: SyncIssue;
  busy: string | null;
  onAct: (key: string, fn: () => Promise<unknown>, thenSync?: boolean) => void;
}) {
  const key = (k: string) => `${k}:${issue.mutation_id}`;
  const editable = issue.entity !== "rally_event";
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-red-950/40 p-3">
      <p className="font-semibold">Falha ao sincronizar: {issue.label}</p>
      <p className="text-sm text-zinc-200">{issue.reason}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onAct(key("retry"), () => retryEntry(getDB(), LOCAL_TENANT_ID, issue.mutation_id))}
          className={`${action} bg-amber-400 text-zinc-950`}
        >
          {editable ? "Enviar a versão deste aparelho" : "Tentar de novo"}
        </button>
        {issue.canUseRemote && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onAct(key("remote"), () => acceptRemote(getDB(), LOCAL_TENANT_ID, issue.mutation_id))}
            className={`${action} bg-zinc-800`}
          >
            Usar a versão da nuvem
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onAct(key("dismiss"), () => dismissEntry(getDB(), LOCAL_TENANT_ID, issue.mutation_id), false)}
          className={`${action} bg-zinc-800 text-zinc-300`}
        >
          Ignorar
        </button>
      </div>
    </li>
  );
}
