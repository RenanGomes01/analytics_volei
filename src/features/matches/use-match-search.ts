"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { matchesQuery } from "@/domain/roster/match-search";
import { replaceQuery } from "@/features/analytics/use-season-data";

/**
 * Filtro em tempo real de uma lista de partidas que já está em memória: o índice (texto normalizado
 * de cada item) é montado uma vez por mudança dos dados; cada tecla só filtra. Nada de consulta ao banco.
 * A busca fica na URL (`?q=`) para sobreviver ao "voltar" depois de abrir um perfil.
 */
export function useMatchSearch<T>(items: readonly T[] | undefined, textOf: (item: T) => string) {
  // Inicial lido da URL: as listas só aparecem depois do banco local, então não há divergência de hidratação.
  const [query, setQueryState] = useState(() => readQueryParam("q"));
  const setQuery = (q: string) => {
    setQueryState(q);
    replaceQuery({ q: q.trim() || undefined });
  };

  // `textOf` precisa ser estável (useCallback/useMemo no chamador), senão o índice refaz a cada render.
  const index = useMemo(() => (items ?? []).map((item) => [item, textOf(item)] as const), [items, textOf]);
  const deferred = useDeferredValue(query);
  const results = useMemo(() => index.filter(([, text]) => matchesQuery(text, deferred)).map(([item]) => item), [index, deferred]);
  return { query, setQuery, results, total: index.length, searching: deferred.trim().length > 0 };
}

/** Parâmetro da URL atual ("" no servidor). */
export const readQueryParam = (name: string): string =>
  typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get(name) ?? "");
