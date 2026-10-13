import type { ModalityRules } from "../rules/modality";
import type { RallyPhase, TeamSide, TouchEvent } from "../types";
import { countTouches } from "./touch-counter";

/**
 * Fase do próximo toque de `team` no rali atual.
 * side_out (K1) = a primeira posse da equipe que recebe o saque; todo o resto é counter_attack (K2).
 */
export function phaseForTouch(
  rallyTouches: readonly TouchEvent[],
  team: TeamSide,
  servingTeam: TeamSide,
  rules: ModalityRules,
): RallyPhase {
  if (team === servingTeam) return "counter_attack";

  const { possessions } = countTouches(rallyTouches, rules);
  const receivingPossessions = possessions.filter((p) => p.team === team).length;
  if (receivingPossessions === 0) return "side_out";
  if (receivingPossessions === 1 && possessions.at(-1)?.team === team) return "side_out";
  return "counter_attack";
}
