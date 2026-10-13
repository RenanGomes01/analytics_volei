import { defaultSkillFor, type NextAction } from "@/domain/rally/next-action";
import type { Skill, TeamSide } from "@/domain/types";

/**
 * Estado EFÊMERO da tela de scout: só a seleção antes de confirmar o lance.
 * Todo o resto (placar, rali, posse) é derivado do ledger.
 */
export interface Selection {
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
}

export type ScoutUiState = (
  | { mode: "idle" } // usa a pré-seleção sugerida pelo NextAction, se houver
  | { mode: "cleared" } // o analista cancelou a sugestão
  | { mode: "armed"; selection: Selection }
  | { mode: "saving"; selection: Selection | null }
) & { error: string | null };

export type ScoutUiAction =
  | { type: "pickAthlete"; team: TeamSide; athlete_id: string; next: NextAction }
  | { type: "pickSkill"; skill: Skill; next: NextAction }
  | { type: "cancel" }
  | { type: "commitStart"; next: NextAction }
  | { type: "commitFailed"; message: string }
  | { type: "ledgerChanged" }
  | { type: "dismissError" };

export const initialScoutUiState: ScoutUiState = { mode: "idle", error: null };

/** Seleção efetiva: a escolha explícita do analista ou, em idle, a sugestão derivada. */
export function effectiveSelection(state: ScoutUiState, next: NextAction): Selection | null {
  switch (state.mode) {
    case "armed":
    case "saving":
      return state.selection;
    case "cleared":
      return null;
    case "idle": {
      const team = next.primary_team;
      if (!team || !next.suggested_athlete_id) return null;
      return { team, athlete_id: next.suggested_athlete_id, skill: defaultSkillFor(next, team) };
    }
  }
}

export function scoutUiReducer(state: ScoutUiState, action: ScoutUiAction): ScoutUiState {
  const error = state.error;
  switch (action.type) {
    case "pickAthlete": {
      if (state.mode === "saving" || !action.next.allowed_teams.includes(action.team)) return state;
      const current = effectiveSelection(state, action.next);
      if (current?.team === action.team && current.athlete_id === action.athlete_id) {
        return { mode: "cleared", error };
      }
      // Trocar de atleta na mesma equipe mantém o fundamento escolhido.
      const skill = current?.team === action.team ? current.skill : defaultSkillFor(action.next, action.team);
      return { mode: "armed", selection: { team: action.team, athlete_id: action.athlete_id, skill }, error };
    }
    case "pickSkill": {
      if (state.mode === "saving") return state;
      const current = effectiveSelection(state, action.next);
      if (!current) return state;
      return { mode: "armed", selection: { ...current, skill: action.skill }, error };
    }
    case "cancel":
      return state.mode === "saving" ? state : { mode: "cleared", error };
    case "commitStart":
      if (state.mode === "saving") return state;
      return { mode: "saving", selection: effectiveSelection(state, action.next), error: null };
    case "commitFailed":
      if (state.mode !== "saving") return state;
      return state.selection
        ? { mode: "armed", selection: state.selection, error: action.message }
        : { mode: "idle", error: action.message };
    case "ledgerChanged":
      return { mode: "idle", error: state.mode === "saving" ? null : error };
    case "dismissError":
      return { ...state, error: null };
  }
}
