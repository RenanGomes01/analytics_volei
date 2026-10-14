"use client";

import { HardLink } from "@/components/hard-link";
import { useAppOutdated } from "@/features/update/update-banner";
import { SYNC_MODE } from "./sync-config";
import { useSyncStatus } from "./use-sync-status";

const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" });

/** Selo discreto do estado do sync; leva à tela Conta. Não aparece na tela de scout. */
export function SyncBadge() {
  const status = useSyncStatus();
  const outdated = useAppOutdated();
  if (!status) return null;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  let text: string;
  let tone = "bg-zinc-800 text-zinc-300";
  if (outdated) {
    text = "⚠ versão desatualizada · atualize o app";
    tone = "bg-sky-800 text-sky-50";
  } else if (SYNC_MODE === "off") {
    text = `☁ sincronização desligada · ${status.pending} na fila`;
  } else if (status.blocked) {
    text = `☁ ${status.pending} na fila · ${status.blocked}`;
    tone = "bg-amber-900/60 text-amber-100";
  } else if (status.conflicts + status.pull_conflicts > 0) {
    text = `⚠ ${plural(status.conflicts + status.pull_conflicts, "divergência")}`;
    tone = "bg-red-900 text-red-100";
  } else if (status.pending > 0) {
    text = `☁ ${plural(status.pending, "pendente")}${status.last_error ? " · sem conexão" : ""}`;
    tone = "bg-amber-900/60 text-amber-100";
  } else {
    text = "✓ sincronizado";
  }

  const title = [
    status.last_success_at ? `Última sincronização: ${time.format(status.last_success_at)}` : "Nunca sincronizado",
    status.last_pull_at ? `Último recebimento: ${time.format(status.last_pull_at)}` : null,
    status.last_error ? `Último erro: ${status.last_error}` : null,
    status.pull_error ? `Erro ao baixar: ${status.pull_error}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <HardLink href="/account" role="status" title={title} className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {text}
    </HardLink>
  );
}
