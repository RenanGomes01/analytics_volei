"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { getLinkedAccount } from "@/services/sync/account-service";
import { getSyncSummary, type SummaryGroup } from "@/services/sync/sync-summary";
import { SYNC_MODE } from "@/features/sync/sync-config";
import { nextConnectionBanner, type ConnectionBanner } from "./connection-banner";
import { useOnline } from "./use-network";

const SYNCED_MS = 4_000;
const WORDS: [SummaryGroup, string, string][] = [
  ["match", "partida", "partidas"],
  ["athlete", "atleta", "atletas"],
  ["team", "dupla", "duplas"],
  ["tournament", "torneio", "torneios"],
];

/** "15 partidas e 4 atletas" a partir do resumo da fila. */
function describePending(pending: Record<SummaryGroup, number> | undefined, total: number): string {
  const parts = WORDS.filter(([g]) => (pending?.[g] ?? 0) > 0).map(([g, one, many]) => `${pending![g]} ${pending![g] === 1 ? one : many}`);
  if (parts.length === 0) return `${total} ${total === 1 ? "item" : "itens"}`;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/**
 * Faixa de conexão sob o cabeçalho (fora da tela de scout): avisa que está offline e, quando a rede
 * volta com dados na fila, leva à central de sincronização.
 */
export function NetworkBanner() {
  const online = useOnline();
  const cloud = SYNC_MODE !== "off";
  const summary = useLiveQuery(() => (cloud ? getSyncSummary(getDB(), LOCAL_TENANT_ID, { maxIssues: 0, maxMatches: 0 }) : null), [cloud]);
  const linked = useLiveQuery(() => (cloud ? getLinkedAccount(getDB()) : null), [cloud]);
  const pending = summary?.pendingTotal ?? 0;
  const [dismissed, setDismissed] = useState(false);
  const input = { online, pending, cloud, linked: !!linked, dismissed };
  const key = `${online}|${pending}|${cloud}|${!!linked}|${dismissed}`;
  const [seen, setSeen] = useState(key);
  const [banner, setBanner] = useState<ConnectionBanner>(() => nextConnectionBanner({ kind: "none" }, input));

  // Máquina de estados pura (connection-banner.ts), avançada quando a entrada muda — durante o
  // render, sem efeito (o "reconectado" depende de ter passado pelo offline).
  if (seen !== key) {
    setSeen(key);
    setBanner((prev) => nextConnectionBanner(prev, input));
    if (!online && dismissed) setDismissed(false);
  }

  useEffect(() => {
    if (banner.kind !== "synced") return;
    const timer = setTimeout(() => setBanner({ kind: "none" }), SYNCED_MS);
    return () => clearTimeout(timer);
  }, [banner.kind]);

  if (banner.kind === "none") return null;
  if (banner.kind === "offline") {
    return (
      <p role="status" className="bg-amber-500 px-4 py-2 text-center font-semibold text-zinc-950">
        Sem internet — tudo está sendo salvo neste aparelho.
      </p>
    );
  }
  if (banner.kind === "synced") {
    return (
      <p role="status" className="bg-emerald-700 px-4 py-2 text-center font-semibold text-white">
        ✓ Conexão de volta e tudo enviado para a nuvem.
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-emerald-700 px-4 py-2 text-white">
      <span className="font-semibold">
        Conexão restabelecida! Você tem {describePending(summary?.pending, banner.pending)} {banner.pending === 1 ? "pronto" : "prontos"} para subir.
        {!banner.linked && " Entre na conta para enviar."}
      </span>
      <HardLink href="/account" className="min-h-11 content-center rounded-xl bg-white px-4 font-bold text-emerald-900">
        Ir para Sincronização
      </HardLink>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Fechar aviso" className="min-h-11 min-w-11 rounded-xl text-lg">
        ✕
      </button>
    </div>
  );
}
