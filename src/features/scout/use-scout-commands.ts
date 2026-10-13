"use client";

import { useCallback, useEffect, useReducer } from "react";
import { getDB } from "@/db/client";
import type { NextAction } from "@/domain/rally/next-action";
import type { Quality, Skill, TeamSide } from "@/domain/types";
import {
  appendRallyEnd,
  appendTouch,
  undoLastAction,
  type MatchScope,
} from "@/services/rally-ledger-service";
import { effectiveSelection, initialScoutUiState, scoutUiReducer } from "./scout-ui-reducer";

const vibrate = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibração é só um retorno tátil opcional.
  }
};

/**
 * Liga a seleção efêmera às escritas no ledger. Não há atualização otimista: a gravação local
 * é rápida e o useLiveQuery re-renderiza; quando o ledger muda, a seleção volta para idle.
 */
export function useScoutCommands(scope: MatchScope, next: NextAction | null, ledgerSize: number | null) {
  const [ui, dispatch] = useReducer(scoutUiReducer, initialScoutUiState);

  useEffect(() => {
    if (ledgerSize !== null) dispatch({ type: "ledgerChanged" });
  }, [ledgerSize]);

  const selection = next ? effectiveSelection(ui, next) : null;
  const saving = ui.mode === "saving";

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      if (!next || saving) return;
      dispatch({ type: "commitStart", next });
      try {
        // null = nada foi gravado (ex.: nada para desfazer); o ledger não muda, então liberamos aqui.
        if ((await write()) === null) dispatch({ type: "ledgerChanged" });
        else vibrate();
      } catch (error) {
        dispatch({ type: "commitFailed", message: error instanceof Error ? error.message : String(error) });
      }
    },
    [next, saving],
  );

  return {
    ui,
    selection,
    saving,
    pickAthlete: (team: TeamSide, athlete_id: string) => next && dispatch({ type: "pickAthlete", team, athlete_id, next }),
    pickSkill: (skill: Skill) => next && dispatch({ type: "pickSkill", skill, next }),
    cancel: () => dispatch({ type: "cancel" }),
    dismissError: () => dispatch({ type: "dismissError" }),
    commitQuality: (quality: Quality) =>
      selection && run(() => appendTouch(getDB(), scope, { ...selection, quality })),
    pointTo: (point_to: TeamSide) => run(() => appendRallyEnd(getDB(), scope, { point_to, reason: "manual" })),
    undo: () => run(() => undoLastAction(getDB(), scope)),
  };
}
