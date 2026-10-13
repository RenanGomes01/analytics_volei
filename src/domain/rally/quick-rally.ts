import type { Quality, RallyEndReason, Skill, TeamSide } from "../types";

/**
 * Modo rápido: durante o rali o analista só toca em QUEM tocou na bola; no fim marca o ponto e
 * como ele aconteceu. Os fundamentos são deduzidos pela sequência inteira de toques, e a qualidade
 * do lance final sai de "como foi o ponto". Os demais toques ficam `?` (não avaliado). Puro.
 */

export interface QuickTap {
  team: TeamSide;
  athlete_id: string;
  /** O analista marcou que este toque foi bloqueio (não dá para deduzir). */
  block?: boolean;
}

export interface QuickTouch {
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
  quality: Quality;
}

/**
 * Fundamento de cada toque. 1º = saque. Em cada posse: 1º toque = passe (logo após o saque ou a
 * bola de graça) ou defesa; último toque de uma posse que cruzou a rede (com 2+ toques) = ataque;
 * os do meio = levantamento. Bloqueio não dá para deduzir: o analista marca. Como a sequência
 * inteira é usada, o ataque de segunda sai certo.
 */
export function inferSkills(taps: readonly QuickTap[]): QuickTouch[] {
  if (taps.length === 0) return [];
  const touches: QuickTouch[] = [{ ...strip(taps[0]), skill: "serve", quality: "?" }];

  // Posses depois do saque: sequências de toques da mesma equipe.
  const possessions: QuickTap[][] = [];
  for (const tap of taps.slice(1)) {
    const current = possessions.at(-1);
    if (current && current[0].team === tap.team) current.push(tap);
    else possessions.push([tap]);
  }

  possessions.forEach((possession, k) => {
    const crossed = k < possessions.length - 1;
    const afterFreeball = touches.at(-1)!.skill === "freeball";
    const n = possession.length;
    possession.forEach((tap, i) => {
      let skill: Skill;
      if (tap.block) skill = "block";
      else if (i === 0) skill = k === 0 || afterFreeball ? "reception" : "dig";
      // Último toque de uma posse que cruzou, ou o 3º toque da posse final: ataque.
      else if (i === n - 1 && (crossed || i >= 2)) skill = "attack";
      else skill = "set";
      touches.push({ ...strip(tap), skill, quality: "?" });
    });
  });
  return touches;
}

const strip = ({ team, athlete_id }: QuickTap) => ({ team, athlete_id });

export type QuickOutcomeId =
  | "ace"
  | "kill"
  | "block_point"
  | "serve_error"
  | "reception_error"
  | "attack_error"
  | "kill_through_defense"
  | "dig_error"
  | "block_error"
  | "ball_error"
  | "fault";

export interface QuickOutcome {
  id: QuickOutcomeId;
  label: string;
}

/** Opções de "como foi o ponto", da mais provável para a menos, pelo último toque e por quem pontuou. */
export function pointOutcomes(taps: readonly QuickTap[], winner: TeamSide): QuickOutcome[] {
  const touches = inferSkills(taps);
  const last = touches.at(-1);
  const fault: QuickOutcome = { id: "fault", label: "Falta / outro (rede, invasão, arbitragem)" };
  if (!last) return [fault];

  if (last.team === winner) {
    if (last.skill === "serve") return [{ id: "ace", label: "Ace" }, fault];
    if (last.skill === "block") return [{ id: "block_point", label: "Ponto de bloqueio" }, fault];
    return [{ id: "kill", label: "Ponto de ataque" }, fault];
  }

  switch (last.skill) {
    case "serve":
      return [{ id: "serve_error", label: "Erro de saque" }, fault];
    case "reception":
      return [{ id: "reception_error", label: "Ace (passe não segurou)" }, fault];
    case "dig": {
      const attacked = touches.at(-2)?.team === winner && touches.at(-2)?.skill === "attack";
      return [
        ...(attacked ? [{ id: "kill_through_defense" as const, label: "Ponto de ataque (defesa não segurou)" }] : []),
        { id: "dig_error", label: "Erro de defesa" },
        fault,
      ];
    }
    case "attack":
      return [{ id: "attack_error", label: "Erro de ataque (fora / rede)" }, fault];
    case "block":
      return [{ id: "block_error", label: "Erro de bloqueio (rede / fora)" }, fault];
    default:
      return [{ id: "ball_error", label: "Erro (levantamento / bola de graça)" }, fault];
  }
}

export interface QuickRally {
  touches: QuickTouch[];
  end: { point_to: TeamSide; reason: RallyEndReason };
}

/** Eventos do rali: o lance final ganha a qualidade que o ponto revela; o fim do rali é explícito. */
export function buildQuickRally(taps: readonly QuickTap[], winner: TeamSide, outcome: QuickOutcomeId): QuickRally {
  const touches = inferSkills(taps);
  const last = touches.at(-1);
  const set = (t: QuickTouch | undefined, patch: Partial<QuickTouch>) => t && Object.assign(t, patch);

  switch (outcome) {
    case "ace":
      set(last, { quality: "#" });
      return { touches, end: { point_to: winner, reason: "ace" } };
    case "kill":
      set(last, { skill: last?.skill === "serve" ? "serve" : "attack", quality: "#" }); // ataque de segunda, largada…
      return { touches, end: { point_to: winner, reason: "kill" } };
    case "block_point":
      set(last, { skill: "block", quality: "#" });
      return { touches, end: { point_to: winner, reason: "kill" } };
    case "kill_through_defense":
      set(touches.at(-2), { quality: "#" });
      set(last, { quality: "=" });
      return { touches, end: { point_to: winner, reason: "kill" } };
    case "reception_error":
      set(last, { quality: "=" });
      return { touches, end: { point_to: winner, reason: "ace" } };
    case "serve_error":
    case "attack_error":
    case "dig_error":
    case "block_error":
    case "ball_error":
      set(last, { quality: "=" });
      return { touches, end: { point_to: winner, reason: "error" } };
    case "fault":
      return { touches, end: { point_to: winner, reason: "manual" } };
  }
}

/** Toques de volta para o modo rápido (ex.: ao desfazer um ponto para corrigir). */
export const tapsFromTouches = (touches: readonly Pick<QuickTouch, "team" | "athlete_id" | "skill">[]): QuickTap[] =>
  touches.map((t) => ({ team: t.team, athlete_id: t.athlete_id, ...(t.skill === "block" ? { block: true } : {}) }));
