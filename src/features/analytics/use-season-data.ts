"use client";

import { useVisibleLiveQuery } from "@/lib/use-visible-live-query";
import { useMemo } from "react";
import { getDB } from "@/db/client";
import { pairKey } from "@/domain/roster/identity";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { loadSeason, type SeasonData } from "@/services/season-service";

export interface SeasonView extends SeasonData {
  athleteName: (id: string) => string;
  /** Nome da dupla: o do cadastro (se existir) ou o do retrato da partida mais recente. */
  teamName: (key: string) => string;
}

/** Temporada inteira do aparelho, reativa ao banco local. `undefined` enquanto carrega. */
export function useSeasonData(): SeasonView | undefined {
  const data = useVisibleLiveQuery(() => loadSeason(getDB(), LOCAL_TENANT_ID), []);
  return useMemo(() => {
    if (!data) return undefined;
    const registry = new Map(data.teams.map((t) => [pairKey(t.athlete_ids, data.aliases), t.name]));
    const snapshot = new Map<string, string>();
    for (const { match } of data.matches) {
      snapshot.set(pairKey(match.team_a.athlete_ids, data.aliases), match.team_a.name);
      snapshot.set(pairKey(match.team_b.athlete_ids, data.aliases), match.team_b.name);
    }
    return {
      ...data,
      athleteName: (id) => data.athletes.get(id)?.name ?? id.slice(0, 6),
      teamName: (key) => registry.get(key) ?? snapshot.get(key) ?? key,
    };
  }, [data]);
}

/** Lê e grava filtros na URL sem recarregar (para compartilhar/favoritar o recorte). */
export function replaceQuery(params: Record<string, string | undefined>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url);
}
