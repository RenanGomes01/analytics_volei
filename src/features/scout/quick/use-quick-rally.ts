"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextAction } from "@/domain/rally/next-action";
import {
  buildQuickRally,
  pointOutcomes,
  tapsFromTouches,
  type QuickChoice,
  type QuickOutcome,
  type QuickTap,
} from "@/domain/rally/quick-rally";
import { planRally, planUndoLastRally, type MatchScope } from "@/domain/rally/plan-events";
import type { MatchState } from "@/domain/rally/replay";
import type { TeamSide } from "@/domain/types";
import type { ScoutExec } from "../use-match-data";

const vibrate = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Retorno tátil opcional.
  }
};

/**
 * Rali em andamento no modo rápido. Os toques ficam na tela (e no sessionStorage, para sobreviver a
 * um recarregamento acidental) e só vão para o ledger quando o ponto é marcado: o rali inteiro aparece
 * no placar no mesmo toque e é gravado numa transação, em segundo plano (Fase 14).
 */
export function useQuickRally(scope: MatchScope, exec: ScoutExec, state: MatchState, next: NextAction) {
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
    (choice: QuickChoice) => {
      if (!pending) return;
      try {
        const { touches, end } = buildQuickRally(taps, pending.winner, choice);
        if (exec((d) => planRally(d, touches, end)) === undefined) return;
        setTaps([]);
        setPending(null);
        vibrate();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [pending, taps, exec],
  );

  /** Durante o rali: apaga o último toque. Sem toques: desfaz o último ponto e devolve os toques. */
  const undo = useCallback(() => {
    setError(null);
    if (blockNext) return setBlockNext(false);
    if (taps.length > 0) return setTaps((t) => t.slice(0, -1));
    try {
      const back = exec(planUndoLastRally);
      if (back) setTaps(tapsFromTouches(back));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [blockNext, taps.length, exec]);

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
    error,
    dismissError: () => setError(null),
  };
}
