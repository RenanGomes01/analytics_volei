import type { PointDetail, Quality, RallyEndReason, Skill, TeamSide } from "../types";
import { buildRallyFromTouches, outcomesForTouches, type QuickChoice, type QuickOutcome } from "./quick-rally";

/**
 * Modo detalhado: "Ponto A/B" com o rali aberto pergunta "Como foi o ponto?" (as mesmas opções do
 * modo rápido). Os toques já estão no ledger, então a resposta vira um plano de correção append-only:
 * anula o trecho final que muda (ex.: o levantamento que foi, na verdade, bola de segunda) e o regrava
 * na mesma ordem, cada cópia com `replaces_event_id` para o Desfazer restaurar o original. Puro.
 */

export interface OpenTouch {
  id: string;
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
  quality: Quality;
  detail?: PointDetail;
}

export interface PointTouchInput {
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
  quality: Quality;
  detail?: PointDetail;
  /** Toque do ledger que esta cópia substitui (anulado no mesmo plano). */
  replaces_event_id?: string;
}

export interface DetailedPointPlan {
  /** Toques a anular, em ordem. Sempre um sufixo dos toques do rali aberto. */
  void_ids: string[];
  /** Toques a gravar depois das anulações, em ordem (substituições e toques novos, como a bloqueadora). */
  touches: PointTouchInput[];
  end: { point_to: TeamSide; reason: RallyEndReason; detail?: PointDetail };
}

export function detailedPointOutcomes(open: readonly OpenTouch[], winner: TeamSide): QuickOutcome[] {
  return outcomesForTouches(open, winner);
}

const sameTouch = (a: OpenTouch, b: Omit<OpenTouch, "id">) =>
  a.team === b.team && a.athlete_id === b.athlete_id && a.skill === b.skill && a.quality === b.quality && a.detail === b.detail;

export function resolveDetailedPoint(open: readonly OpenTouch[], winner: TeamSide, choice: QuickChoice): DetailedPointPlan {
  const { touches, end } = buildRallyFromTouches(
    open.map(({ team, athlete_id, skill, quality, detail }) => ({ team, athlete_id, skill, quality, ...(detail ? { detail } : {}) })),
    winner,
    choice,
  );
  // Primeiro toque que muda: dali em diante tudo é regravado, para a ordem do rali continuar certa.
  let first = open.findIndex((t, i) => !sameTouch(t, touches[i]));
  if (first === -1) first = open.length;

  const replaced = open.slice(first);
  return {
    void_ids: replaced.map((t) => t.id),
    touches: touches.slice(first).map((t, i) => ({ ...t, ...(i < replaced.length ? { replaces_event_id: replaced[i].id } : {}) })),
    end,
  };
}
