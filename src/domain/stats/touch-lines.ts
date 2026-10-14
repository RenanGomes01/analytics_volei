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
  /** Erro de saque com detalhe (modo rápido "Saque na rede/fora" ou detalhado "= Rede/= Fora"). */
  serve_errors_net: number;
  serve_errors_out: number;
  /** Ataques no 2º toque da posse (bola de segunda) e os que viraram ponto. */
  second_ball_attempts: number;
  second_ball_kills: number;
  receptions: number;
  /** Recepções com qualidade avaliada (sem `?`): denominador da % de passe bom. */
  receptions_rated: number;
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
  serve_errors_net: 0,
  serve_errors_out: 0,
  second_ball_attempts: 0,
  second_ball_kills: 0,
  receptions: 0,
  receptions_rated: 0,
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
  /** O lance é o 2º toque da posse da equipe (para bola de segunda). */
  second_touch?: boolean;
}

/** O que um lance soma às estatísticas. */
export function touchDelta(touch: TouchEvent, next: TouchEvent | undefined, { won, reason, second_touch }: TouchOutcome): TouchDelta {
  const isError = touch.quality === "=";
  switch (touch.skill) {
    case "serve":
      return {
        serve_attempts: 1,
        // Ace = rali ganho com motivo "ace": saque # ou recepção = do adversário logo após o saque.
        aces: won && reason === "ace" ? 1 : 0,
        serve_errors: isError ? 1 : 0,
        serve_errors_net: isError && touch.detail === "net" ? 1 : 0,
        serve_errors_out: isError && touch.detail === "out" ? 1 : 0,
        errors: isError ? 1 : 0,
      };
    case "attack": {
      const failed = isError || isStuffed(touch, next);
      const kill = touch.quality === "#" && won;
      return {
        attack_attempts: 1,
        kills: kill ? 1 : 0,
        second_ball_attempts: second_touch ? 1 : 0,
        second_ball_kills: second_touch && kill ? 1 : 0,
        attack_errors: failed ? 1 : 0,
        errors: failed ? 1 : 0,
      };
    }
    case "reception":
      return {
        receptions: 1,
        receptions_rated: touch.quality === "?" ? 0 : 1,
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
    const prev = rally.touches[i - 1];
    // 2º toque da posse: o anterior é da mesma equipe (e não o saque) e o antes dele é do outro lado.
    const second_touch = i >= 2 && prev.team === touch.team && prev.skill !== "serve" && rally.touches[i - 2].team !== touch.team;
    const outcome = { won: rally.point_to === touch.team, reason: rally.reason, second_touch };
    add(touch.team, touch.athlete_id, touchDelta(touch, rally.touches[i + 1], outcome));
  });
}

export function addCounters(target: TouchCounters, delta: TouchDelta): void {
  for (const key of Object.keys(delta) as (keyof TouchCounters)[]) target[key] += delta[key] ?? 0;
}
