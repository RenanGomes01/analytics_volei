"use client";

import { useCallback, useEffect, useReducer } from "react";
import type { NextAction } from "@/domain/rally/next-action";
import {
  planRallyEnd,
  planResolvePoint,
  planTouch,
  planUndoLastAction,
  type LedgerDraft,
} from "@/domain/rally/plan-events";
import type { PointDetail, Quality, Skill, TeamSide } from "@/domain/types";
import type { DetailedPointPlan } from "@/domain/rally/resolve-detailed-point";
import { effectiveSelection, initialScoutUiState, scoutUiReducer } from "./scout-ui-reducer";
import type { ScoutExec } from "./use-match-data";

const vibrate = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibração é só um retorno tátil opcional.
  }
};

/**
 * Liga a seleção efêmera aos comandos do ledger. UI otimista (Fase 14): o comando é planejado sobre
 * o ledger em memória e aparece no mesmo toque; a gravação no IndexedDB segue em segundo plano
 * (`ScoutLedger`). Nada aqui espera o banco, então os botões nunca ficam presos em "salvando".
 * Toque duplo antes do React redesenhar é ignorado (o ledger já não tem o tamanho que a tela mostrava).
 */
export function useScoutCommands(exec: ScoutExec, next: NextAction | null, ledgerSize: number | null) {
  const [ui, dispatch] = useReducer(scoutUiReducer, initialScoutUiState);

  useEffect(() => {
    if (ledgerSize !== null) dispatch({ type: "ledgerChanged" });
  }, [ledgerSize]);

  const selection = next ? effectiveSelection(ui, next) : null;
  const saving = ui.mode === "saving";

  const run = useCallback(
    (plan: (draft: LedgerDraft) => unknown) => {
      if (!next || saving || ledgerSize === null) return;
      try {
        const result = exec(plan, ledgerSize);
        // undefined = toque ignorado; null = nada a desfazer. Em ambos o ledger não muda.
        if (result === undefined || result === null) return;
        vibrate();
        dispatch({ type: "ledgerChanged" });
      } catch (error) {
        dispatch({ type: "commitStart", next });
        dispatch({ type: "commitFailed", message: error instanceof Error ? error.message : String(error) });
      }
    },
    [exec, next, saving, ledgerSize],
  );

  return {
    ui,
    selection,
    saving,
    pickAthlete: (team: TeamSide, athlete_id: string) => next && dispatch({ type: "pickAthlete", team, athlete_id, next }),
    pickSkill: (skill: Skill) => next && dispatch({ type: "pickSkill", skill, next }),
    cancel: () => dispatch({ type: "cancel" }),
    dismissError: () => dispatch({ type: "dismissError" }),
    commitQuality: (quality: Quality, detail?: PointDetail) =>
      selection && run((d) => planTouch(d, { ...selection, quality, ...(detail ? { detail } : {}) })),
    pointTo: (point_to: TeamSide) => run((d) => planRallyEnd(d, { point_to, reason: "manual" })),
    /** "Como foi o ponto?" com o rali aberto (ex.: levantamento que virou bola de segunda). */
    resolvePoint: (plan: DetailedPointPlan) => run((d) => planResolvePoint(d, plan)),
    undo: () => run(planUndoLastAction),
  };
}
