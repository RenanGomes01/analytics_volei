"use client";

import { useEffect } from "react";

/** Mantém a tela do tablet ligada enquanto `enabled`. Reaquisita ao voltar para a aba. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) void sentinel.release();
      } catch {
        // Sem permissão ou bateria baixa: a tela pode apagar, mas o scout segue funcionando.
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release();
    };
  }, [enabled]);
}
