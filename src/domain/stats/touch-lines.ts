import type { RallyResult } from "../rally/replay";
import type { RallyEndReason, TeamSide, TouchEvent } from "../types";

/** Contadores brutos de lances, somáveis por atleta e por equipe. */
export interface TouchCounters {
  attack_attempts: number;
  kills: number;
  attack_errors: number;
  serve_attempts: number;
  aces: number;
  serve_errors: number;
  receptions: number;
  reception_positive: number;
  reception_errors: number;
  blocks: number;
  digs: number;
  errors: number;
}

export const emptyTouchCounters = (): TouchCounters => ({
  attack_attempts: 0,
  kills: 0,
  attack_errors: 0,
  serve_attempts: 0,
  aces: 0,
  serve_errors: 0,
  receptions: 0,
  reception_positive: 0,
  reception_errors: 0,
  blocks: 0,
  digs: 0,
  errors: 0,
});

export type TouchDelta = Partial<TouchCounters>;

/** Ataque bloqueado para ponto: o próximo contato é um bloqueio `#` do adversário. */
function isStuffed(attack: TouchEvent, next: TouchEvent | undefined): boolean {
  return !!next && next.team !== attack.team && next.skill === "block" && next.quality === "#";
}

/** Resultado do rali do ponto de vista de um lance. */
export interface TouchOutcome {
  /** O rali terminou com ponto para a equipe do lance. */
  won: boolean;
  reason: RallyEndReason | null;
}

/** O que um lance soma às estatísticas. */
export function touchDelta(touch: TouchEvent, next: TouchEvent | undefined, { won, reason }: TouchOutcome): TouchDelta {
  const isError = touch.quality === "=";
  switch (touch.skill) {
    case "serve":
      return {
        serve_attempts: 1,
        // Ace = rali ganho com motivo "ace": saque # ou recepção = do adversário logo após o saque.
        aces: won && reason === "ace" ? 1 : 0,
        serve_errors: isError ? 1 : 0,
        errors: isError ? 1 : 0,
      };
    case "attack": {
      const failed = isError || isStuffed(touch, next);
      return {
        attack_attempts: 1,
        kills: touch.quality === "#" && won ? 1 : 0,
        attack_errors: failed ? 1 : 0,
        errors: failed ? 1 : 0,
      };
    }
    case "reception":
      return {
        receptions: 1,
        reception_positive: touch.quality === "#" || touch.quality === "+" ? 1 : 0,
        reception_errors: isError ? 1 : 0,
        errors: isError ? 1 : 0,
      };
    case "block":
      return { blocks: touch.quality === "#" && won ? 1 : 0, errors: isError ? 1 : 0 };
    case "dig":
      return { digs: isError ? 0 : 1, errors: isError ? 1 : 0 };
    default: // set, freeball, fault
      return { errors: isError ? 1 : 0 };
  }
}

/** Percorre os toques de um rali chamando `add` com a contribuição de cada lance. */
export function tallyTouches(
  rally: RallyResult,
  add: (team: TeamSide, athlete_id: string, delta: TouchDelta) => void,
): void {
  rally.touches.forEach((touch, i) => {
    const outcome = { won: rally.point_to === touch.team, reason: rally.reason };
    add(touch.team, touch.athlete_id, touchDelta(touch, rally.touches[i + 1], outcome));
  });
}

export function addCounters(target: TouchCounters, delta: TouchDelta): void {
  for (const key of Object.keys(delta) as (keyof TouchCounters)[]) target[key] += delta[key] ?? 0;
}
