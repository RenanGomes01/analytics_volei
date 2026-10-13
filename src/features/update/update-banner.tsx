"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { checkForUpdate, isAppOutdated, markAppOutdated, subscribeAppOutdated, watchForUpdates } from "./app-update";

const CHECK_INTERVAL_MS = 30 * 60_000;

export function useAppOutdated(): boolean {
  return useSyncExternalStore(subscribeAppOutdated, isAppOutdated, () => false);
}

/**
 * Avisa que há versão nova. Nunca recarrega sozinho: o analista escolhe o momento (entre ralis).
 * Os lances estão no IndexedDB, então recarregar não perde nada.
 * Procura versão nova a cada 30 min, ao voltar para a aba e quando a rede volta.
 */
export function UpdateBanner() {
  const outdated = useAppOutdated();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const stop = watchForUpdates(container, markAppOutdated);
    const check = () => {
      if (document.visibilityState === "visible") void checkForUpdate(container);
    };
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      stop();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);

  if (!outdated || dismissed) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-2 top-2 z-[60] mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-sky-700 px-4 py-2 text-white shadow-lg"
    >
      <p className="flex-1 text-sm leading-snug">
        <strong>Nova versão disponível.</strong> Atualize quando o rali acabar: seus lances estão salvos neste
        aparelho.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="min-h-12 shrink-0 rounded-xl bg-white px-4 font-bold text-sky-800"
      >
        Atualizar
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="min-h-12 shrink-0 rounded-xl px-3 font-semibold">
        Depois
      </button>
    </div>
  );
}
