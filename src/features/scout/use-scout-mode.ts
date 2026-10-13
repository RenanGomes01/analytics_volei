"use client";

import { useCallback, useState } from "react";

export type ScoutMode = "quick" | "detailed";

/** Modo de scout desta partida, lembrado neste aparelho. Padrão: rápido (acompanha o ritmo do jogo). */
export function useScoutMode(matchId: string) {
  const key = `scout:mode:${matchId}`;
  const [mode, setMode] = useState<ScoutMode>(() => {
    try {
      return localStorage.getItem(key) === "detailed" ? "detailed" : "quick";
    } catch {
      return "quick";
    }
  });

  const change = useCallback(
    (next: ScoutMode) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Armazenamento indisponível: a escolha vale só nesta sessão.
      }
      setMode(next);
    },
    [key],
  );

  return [mode, change] as const;
}
