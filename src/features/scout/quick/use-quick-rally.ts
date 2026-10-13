"use client";

import { useCallback, useEffect, useState } from "react";
import { getDB } from "@/db/client";
import type { NextAction } from "@/domain/rally/next-action";
import {
  buildQuickRally,
  pointOutcomes,
  tapsFromTouches,
  type QuickChoice,
  type QuickOutcome,
  type QuickTap,
} from "@/domain/rally/quick-rally";
import type { MatchState } from "@/domain/rally/replay";
import type { TeamSide } from "@/domain/types";
import { appendRally, undoLastRally, type MatchScope } from "@/services/rally-ledger-service";

const vibrate = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Retorno tátil opcional.
  }
};

/**
 * Rali em andamento no modo rápido. Os toques ficam na tela (e no sessionStorage, para sobreviver a
 * um recarregamento acidental) e só vão para o ledger, numa transação, quando o ponto é marcado.
 */
export function useQuickRally(scope: MatchScope, state: MatchState, next: NextAction) {
  const key = `scout:quick:${scope.match_id}`;
  const [taps, setTaps] = useState<QuickTap[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "[]") as QuickTap[];
    } catch {
      return [];
    }
  });
  const [blockNext, setBlockNext] = useState(false);
  const [pending, setPending] = useState<{ winner: TeamSide; options: QuickOutcome[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(taps));
    } catch {
      // Armazenamento indisponível: o rali em andamento vale só nesta tela.
    }
  }, [key, taps]);

  /** Quem saca: sugestão do beach (alternância) quando o rali ainda não começou. */
  const suggestedServer = taps.length === 0 && next.stage === "awaiting_serve" ? next.suggested_athlete_id : null;

  const tapAthlete = useCallback(
    (team: TeamSide, athlete_id: string) => {
      setError(null);
      const tap: QuickTap = { team, athlete_id, ...(blockNext ? { block: true } : {}) };
      let nextTaps: QuickTap[];
      if (taps.length > 0) nextTaps = [...taps, tap];
      else if (team === state.serving_team) nextTaps = [{ team, athlete_id }]; // o primeiro toque é o saque
      // Tocou direto em quem recebeu: o saque entra junto, se soubermos quem sacou.
      else if (suggestedServer) nextTaps = [{ team: state.serving_team, athlete_id: suggestedServer }, tap];
      else {
        setError("Toque primeiro em quem sacou.");
        return;
      }
      setBlockNext(false);
      setTaps(nextTaps);
      vibrate();
    },
    [blockNext, taps, state.serving_team, suggestedServer],
  );

  const openPoint = useCallback(
    (winner: TeamSide) => {
      setError(null);
      setPending({ winner, options: pointOutcomes(taps, winner) });
    },
    [taps],
  );

  const choose = useCallback(
    async (choice: QuickChoice) => {
      if (!pending || saving) return;
      setSaving(true);
      try {
        const { touches, end } = buildQuickRally(taps, pending.winner, choice);
        await appendRally(getDB(), scope, touches, end);
        setTaps([]);
        setPending(null);
        vibrate();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [pending, saving, taps, scope],
  );

  /** Durante o rali: apaga o último toque. Sem toques: desfaz o último ponto e devolve os toques. */
  const undo = useCallback(async () => {
    setError(null);
    if (blockNext) return setBlockNext(false);
    if (taps.length > 0) return setTaps((t) => t.slice(0, -1));
    try {
      const back = await undoLastRally(getDB(), scope);
      setTaps(tapsFromTouches(back));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [blockNext, taps.length, scope]);

  return {
    taps,
    suggestedServer,
    blockNext,
    toggleBlockNext: () => setBlockNext((b) => !b),
    tapAthlete,
    openPoint,
    pending,
    cancelPoint: () => setPending(null),
    /** Rali anulado pela arbitragem (repetir): descarta os toques, sem ponto. */
    replayRally: () => {
      setPending(null);
      setTaps([]);
    },
    choose,
    undo,
    saving,
    error,
    dismissError: () => setError(null),
  };
}
