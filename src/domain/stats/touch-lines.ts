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

  // ---- Fase 15: micro-métricas (todas somáveis; cada uma é o "drill" de uma coluna) ----
  /** Ataque no 1º toque da posse (bola de primeira) e no 3º toque ou depois. */
  attack_first: number;
  attack_third: number;
  /** Largadas/shots (detalhe `shot`). */
  attack_shots: number;
  /** Ataques bloqueados para ponto do adversário. */
  attack_blocked: number;
  /** Ataques que exploraram o bloqueio e viraram ponto (detalhe `block_out`). */
  attack_block_out_kills: number;
  /** Ataque na virada de bola (K1) e no contra-ataque (K2). */
  attack_k1_attempts: number;
  attack_k1_kills: number;
  attack_k1_errors: number;
  attack_k2_attempts: number;
  attack_k2_kills: number;
  attack_k2_errors: number;
  /** Ralis ganhos com o saque da atleta (quebra de saque dela). */
  serve_won: number;
  /** Saques recebidos com qualidade avaliada / recepções ruins forçadas (-, /, =). */
  serve_pressure_rated: number;
  serve_pressure_forced: number;
  /** Ralis ganhos pela equipe depois da recepção da atleta (virada de bola dela). */
  reception_won: number;
  /** Saques recebidos pela equipe (todas as atletas em quadra): base do "alvo do saque". */
  serves_faced: number;
  block_touches: number;
  block_errors: number;
  /** Bloqueios do time explorados pelo ataque adversário (contado na equipe que bloqueou). */
  blocks_exploited: number;
  dig_positive: number;
  dig_errors: number;
  /** Ralis ganhos pela equipe depois da defesa da atleta (contra-ataque convertido). */
  dig_won: number;
  sets: number;
  set_errors: number;
  /** Faltas sem contato (rede, invasão, condução…). */
  faults: number;
  /** Erros que deram o ponto ao adversário (lance = ou ataque bloqueado, rali perdido). */
  points_given: number;
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
  attack_first: 0,
  attack_third: 0,
  attack_shots: 0,
  attack_blocked: 0,
  attack_block_out_kills: 0,
  attack_k1_attempts: 0,
  attack_k1_kills: 0,
  attack_k1_errors: 0,
  attack_k2_attempts: 0,
  attack_k2_kills: 0,
  attack_k2_errors: 0,
  serve_won: 0,
  serve_pressure_rated: 0,
  serve_pressure_forced: 0,
  reception_won: 0,
  serves_faced: 0,
  block_touches: 0,
  block_errors: 0,
  blocks_exploited: 0,
  dig_positive: 0,
  dig_errors: 0,
  dig_won: 0,
  sets: 0,
  set_errors: 0,
  faults: 0,
  points_given: 0,
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
  /** Posição do lance na posse da equipe: 1º, 2º, 3º… (sequência de toques seguidos do mesmo lado). */
  touch_in_possession?: number;
}

const BAD_RECEPTION = new Set(["-", "/", "="]);

/** O que um lance soma às estatísticas. */
export function touchDelta(
  touch: TouchEvent,
  next: TouchEvent | undefined,
  { won, reason, second_touch, touch_in_possession = 0 }: TouchOutcome,
): TouchDelta {
  const isError = touch.quality === "=";
  const lost = (failed: boolean) => (failed && !won ? 1 : 0);
  switch (touch.skill) {
    case "serve": {
      // Pressão: só conta quando a recepção adversária logo depois foi avaliada.
      const received = next && next.team !== touch.team && next.skill === "reception" && next.quality !== "?";
      return {
        serve_attempts: 1,
        // Ace = rali ganho com motivo "ace": saque # ou recepção = do adversário logo após o saque.
        aces: won && reason === "ace" ? 1 : 0,
        serve_errors: isError ? 1 : 0,
        serve_errors_net: isError && touch.detail === "net" ? 1 : 0,
        serve_errors_out: isError && touch.detail === "out" ? 1 : 0,
        serve_won: won ? 1 : 0,
        serve_pressure_rated: received ? 1 : 0,
        serve_pressure_forced: received && BAD_RECEPTION.has(next.quality) ? 1 : 0,
        errors: isError ? 1 : 0,
        points_given: lost(isError),
      };
    }
    case "attack": {
      const stuffed = isStuffed(touch, next);
      const failed = isError || stuffed;
      const kill = touch.quality === "#" && won;
      const k1 = touch.phase === "side_out";
      return {
        attack_attempts: 1,
        kills: kill ? 1 : 0,
        second_ball_attempts: second_touch ? 1 : 0,
        second_ball_kills: second_touch && kill ? 1 : 0,
        attack_first: touch_in_possession === 1 ? 1 : 0,
        attack_third: touch_in_possession >= 3 ? 1 : 0,
        attack_shots: touch.detail === "shot" ? 1 : 0,
        attack_blocked: stuffed ? 1 : 0,
        attack_block_out_kills: kill && touch.detail === "block_out" ? 1 : 0,
        attack_k1_attempts: k1 ? 1 : 0,
        attack_k1_kills: k1 && kill ? 1 : 0,
        attack_k1_errors: k1 && failed ? 1 : 0,
        attack_k2_attempts: k1 ? 0 : 1,
        attack_k2_kills: !k1 && kill ? 1 : 0,
        attack_k2_errors: !k1 && failed ? 1 : 0,
        attack_errors: failed ? 1 : 0,
        errors: failed ? 1 : 0,
        points_given: lost(failed),
      };
    }
    case "reception":
      return {
        receptions: 1,
        receptions_rated: touch.quality === "?" ? 0 : 1,
        reception_positive: touch.quality === "#" || touch.quality === "+" ? 1 : 0,
        reception_errors: isError ? 1 : 0,
        reception_won: won ? 1 : 0,
        errors: isError ? 1 : 0,
        points_given: lost(isError),
      };
    case "block":
      return {
        blocks: touch.quality === "#" && won ? 1 : 0,
        block_touches: 1,
        block_errors: isError ? 1 : 0,
        errors: isError ? 1 : 0,
        points_given: lost(isError),
      };
    case "dig":
      return {
        digs: isError ? 0 : 1,
        dig_positive: touch.quality === "#" || touch.quality === "+" ? 1 : 0,
        dig_errors: isError ? 1 : 0,
        dig_won: !isError && won ? 1 : 0,
        errors: isError ? 1 : 0,
        points_given: lost(isError),
      };
    case "set":
      return { sets: 1, set_errors: isError ? 1 : 0, errors: isError ? 1 : 0, points_given: lost(isError) };
    case "fault":
      return { faults: 1, errors: isError ? 1 : 0, points_given: lost(isError) };
    default: // freeball
      return { errors: isError ? 1 : 0, points_given: lost(isError) };
  }
}

/** Posição de cada toque na posse da sua equipe (1, 2, 3…): toques seguidos do mesmo lado. */
export function possessionPositions(touches: readonly TouchEvent[]): number[] {
  const out: number[] = [];
  touches.forEach((t, i) => out.push(i > 0 && touches[i - 1].team === t.team ? out[i - 1] + 1 : 1));
  return out;
}

/** Percorre os toques de um rali chamando `add` com a contribuição de cada lance. */
export function tallyTouches(
  rally: RallyResult,
  add: (team: TeamSide, athlete_id: string, delta: TouchDelta, index: number) => void,
): void {
  const positions = possessionPositions(rally.touches);
  rally.touches.forEach((touch, i) => {
    const prev = rally.touches[i - 1];
    // 2º toque da posse: o anterior é da mesma equipe (e não o saque) e o antes dele é do outro lado.
    const second_touch = i >= 2 && positions[i] === 2 && prev.skill !== "serve";
    const outcome = { won: rally.point_to === touch.team, reason: rally.reason, second_touch, touch_in_possession: positions[i] };
    add(touch.team, touch.athlete_id, touchDelta(touch, rally.touches[i + 1], outcome), i);
  });
}

export function addCounters(target: TouchCounters, delta: TouchDelta): void {
  for (const key of Object.keys(delta) as (keyof TouchCounters)[]) target[key] += delta[key] ?? 0;
}
