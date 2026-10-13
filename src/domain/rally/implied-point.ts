import { otherTeam, type RallyEndReason, type TeamSide, type TouchEvent } from "../types";

export interface ImpliedPoint {
  point_to: TeamSide;
  reason: RallyEndReason;
}

/**
 * Ponto implícito pela qualidade de um lance terminal:
 * `=` é erro (ponto do adversário); `#` em saque é ace e em ataque/bloqueio é ponto de quem tocou.
 */
export function impliedPoint(touch: Pick<TouchEvent, "team" | "skill" | "quality">): ImpliedPoint | null {
  if (touch.quality === "=") return { point_to: otherTeam(touch.team), reason: "error" };
  if (touch.quality !== "#") return null;
  if (touch.skill === "serve") return { point_to: touch.team, reason: "ace" };
  if (touch.skill === "attack" || touch.skill === "block") return { point_to: touch.team, reason: "kill" };
  return null;
}
