"use client";

import { useCallback, useState } from "react";

/** Inversão visual dos lados (A à direita). Preferência local deste aparelho, por partida. */
export function useSideSwap(matchId: string) {
  const key = `scout:swap:${matchId}`;
  const [swapped, setSwapped] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setSwapped((value) => {
      try {
        localStorage.setItem(key, value ? "0" : "1");
      } catch {
        // Armazenamento indisponível: a troca vale só nesta sessão.
      }
      return !value;
    });
  }, [key]);

  return [swapped, toggle] as const;
}
