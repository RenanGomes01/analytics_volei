import type { PointSourceKey } from "./point-sources";
import type { Fault, PointGroup } from "./rally-facts";

/**
 * Tom semântico das barras de ponto (Fase 21): de quem foi o lance, para a leitura bater de relance.
 * Só a semântica; as cores ficam em `TONE` (features/charts/palette.ts). Puro.
 *
 * - merit: ponto por mérito próprio (ataque, ace, bloqueio);
 * - gift: ponto que veio de erro do adversário;
 * - own_error: ponto cedido por erro próprio;
 * - opponent_merit: ponto cedido por mérito do adversário;
 * - unknown: sem detalhe ("Não vi como foi").
 */
export type PointTone = "merit" | "gift" | "own_error" | "opponent_merit" | "unknown";

/**
 * Lado de quem GANHOU: decide pelo grupo do placar, não pelo `fault` — o ponto de bloqueio tem
 * `fault: "own"` (o ataque bloqueado é erro de quem atacou), mas para quem bloqueou é mérito.
 */
export function scoredTone(group: PointGroup, fault: Fault): PointTone {
  if (fault === "none") return "unknown";
  return group === "opponent_errors" ? "gift" : "merit";
}

/** Lado de quem PERDEU: erro próprio × mérito do adversário. */
export function concededTone(fault: Fault): PointTone {
  return fault === "own" ? "own_error" : fault === "opponent" ? "opponent_merit" : "unknown";
}

/** Fontes de "Origem dos pontos". */
export const sourceTone = (key: PointSourceKey): PointTone => (key === "opponent_errors" ? "gift" : "merit");
