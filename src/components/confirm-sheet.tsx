"use client";

import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** Ação destrutiva (vermelho) ou neutra (âmbar). */
  danger?: boolean;
  /** false = só explica por que não dá (o botão de confirmar some). */
  canConfirm?: boolean;
  /** Pode lançar: a mensagem aparece no próprio diálogo e ele continua aberto. */
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

/**
 * Confirmação dentro do app (sem `confirm()` do navegador, que trava o PWA em tela cheia e não
 * explica nada). Mostra o erro do serviço — ex.: "joga em 3 partidas" — sem fechar.
 */
export function ConfirmSheet({ title, children, confirmLabel, danger = false, canConfirm = true, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5 text-zinc-100">
        <h2 className="text-xl font-bold">{title}</h2>
        {children && <div className="flex flex-col gap-2 text-zinc-300">{children}</div>}
        {error && (
          <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-14 flex-1 rounded-2xl bg-zinc-800 font-semibold">
            {canConfirm ? "Cancelar" : "Entendi"}
          </button>
          {canConfirm && (
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className={`min-h-14 flex-1 rounded-2xl font-bold disabled:opacity-50 ${danger ? "bg-red-700 text-white" : "bg-amber-400 text-zinc-950"}`}
            >
              {busy ? "Salvando…" : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
