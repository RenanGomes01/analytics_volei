"use client";

import { useEffect } from "react";
import { dismissToast, showFlashToasts, useToasts, type ToastKind } from "./toast";

const TONE: Record<ToastKind, string> = {
  success: "bg-emerald-700 text-white",
  error: "bg-red-700 text-white",
  info: "bg-zinc-700 text-zinc-50",
};
const ICON: Record<ToastKind, string> = { success: "✓", error: "⚠", info: "ℹ" };

/** Pilha de avisos no rodapé (acima da área segura), em todas as telas. */
export function Toaster() {
  const toasts = useToasts();
  useEffect(() => showFlashToasts(), []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-xl ${TONE[t.kind]}`}
        >
          <span aria-hidden className="text-lg">
            {ICON[t.kind]}
          </span>
          <span className="flex-1 font-medium">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
              className="min-h-11 rounded-xl bg-black/25 px-3 font-bold underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Fechar aviso" className="min-h-11 min-w-11 rounded-xl text-lg opacity-80">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
