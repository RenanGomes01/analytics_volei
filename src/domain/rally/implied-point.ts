import { otherTeam, type RallyEndReason, type TeamSide, type TouchEvent } from "../types";

export interface ImpliedPoint {
  point_to: TeamSide;
  reason: RallyEndReason;
}

type Lance = Pick<TouchEvent, "team" | "skill" | "quality">;

/**
 * Ponto implícito pela qualidade de um lance terminal:
 * `=` é erro (ponto do adversário); `#` em saque é ace e em ataque/bloqueio é ponto de quem tocou.
 * Recepção `=` logo após o saque adversário é o espelho do ace: ponto e ace para quem sacou.
 * `previous` é o toque anterior do rali (necessário só para essa regra).
 */
export function impliedPoint(touch: Lance, previous?: Lance): ImpliedPoint | null {
  if (touch.quality === "=") {
    const receivedServe = touch.skill === "reception" && previous?.skill === "serve" && previous.team !== touch.team;
    return { point_to: otherTeam(touch.team), reason: receivedServe ? "ace" : "error" };
  }
  if (touch.quality !== "#") return null;
  if (touch.skill === "serve") return { point_to: touch.team, reason: "ace" };
  if (touch.skill === "attack" || touch.skill === "block") return { point_to: touch.team, reason: "kill" };
  return null;
}
