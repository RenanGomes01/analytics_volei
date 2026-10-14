"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState, useSyncExternalStore } from "react";

/**
 * Consulta que fica em espera: nunca resolve e não lê tabela nenhuma. O Dexie não assina nada para
 * ela, então nenhuma gravação a reexecuta; o useLiveQuery continua devolvendo o último resultado.
 */
const PAUSED = () => new Promise<never>(() => {});

/** Com a aba oculta, troca a consulta pela espera (puro, para teste). */
export function pausedWhenHidden<T>(visible: boolean, querier: () => Promise<T> | T): () => Promise<T> | T {
  return visible ? querier : PAUSED;
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState !== "hidden", () => true);
}

/**
 * useLiveQuery que só REEXECUTA com a aba visível (Fase 14). Cada lance do scout avisa TODAS as abas
 * do app; uma aba esquecida em Rankings ou Conta reexecutava consultas pesadas (temporada inteira,
 * resumo do sync) a cada toque, disputando CPU e IndexedDB com o scout no tablet. A primeira leitura
 * roda sempre (uma aba aberta em segundo plano não fica em "Carregando…"); depois, oculta, a aba
 * mantém o último resultado e, ao voltar a ficar visível, consulta de novo.
 */
export function useVisibleLiveQuery<T>(querier: () => Promise<T> | T, deps: unknown[]): T | undefined {
  const visible = usePageVisible();
  const [loaded, setLoaded] = useState(false);
  const active = visible || !loaded;
  const value = useLiveQuery(pausedWhenHidden(active, querier), [...deps, active]);
  // Ajuste de estado durante o render (padrão do React para estado derivado), sem efeito.
  if (!loaded && value !== undefined) setLoaded(true);
  return value;
}
