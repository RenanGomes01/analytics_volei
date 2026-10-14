import type { PointDetail, Quality, RallyEndReason, Skill, TeamSide } from "../types";

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
  detail?: PointDetail;
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
  | "blocked"
  | "serve_error"
  | "reception_error"
  | "attack_error"
  | "kill_through_defense"
  | "dig_error"
  | "block_error"
  | "ball_error"
  | "fault"
  /** Saída de emergência: o analista não viu como foi. Ponto sem lance (motivo "marcado"). */
  | "unseen";

export interface QuickOutcome {
  id: QuickOutcomeId;
  label: string;
  detail?: PointDetail;
  /** Precisa de mais um toque: em quem bloqueou (equipe que pontuou). */
  pick?: "blocker";
  /** O último toque (1º/2º da posse) foi na verdade um ataque: bola de primeira/segunda. */
  as_attack?: boolean;
}

/** A escolha final do analista. */
export interface QuickChoice {
  outcome: QuickOutcomeId;
  detail?: PointDetail;
  /** Bloqueador ("Bloqueado") ou quem cometeu a falta ("Falta"); ausente = não sabe quem. */
  athlete_id?: string;
  /** Converte o último toque em ataque (bola de primeira/segunda que errou ou foi bloqueada). */
  as_attack?: boolean;
}

/** Faltas do vôlei de praia: cometidas pela equipe que PERDEU o ponto. */
export const BEACH_FAULTS: { detail: PointDetail; label: string }[] = [
  { detail: "net_touch", label: "Toque na rede" },
  { detail: "invasion", label: "Invasão" },
  { detail: "double", label: "Dois toques" },
  { detail: "lift", label: "Condução" },
  { detail: "four_hits", label: "Quatro toques" },
  { detail: "foot_fault", label: "Pé na linha (saque)" },
  { detail: "serve_delay", label: "Demora no saque" },
  { detail: "service_order", label: "Ordem de saque" },
  { detail: "open_hand_tip", label: "Largada de dedos" },
  { detail: "serve_attack", label: "Ataque/bloqueio no saque" },
  { detail: "penalty", label: "Penalidade (cartão)" },
  { detail: "other", label: "Outro / arbitragem" },
];

/** Rótulo curto do detalhe, para o rastro do rali e relatórios. */
export const POINT_DETAIL_LABEL: Record<PointDetail, string> = {
  out: "fora",
  net: "na rede",
  blocked: "bloqueado",
  shot: "largada/shot",
  block_out: "explorou o bloqueio",
  foot_fault: "pé na linha",
  net_touch: "toque na rede",
  invasion: "invasão",
  double: "dois toques",
  lift: "condução",
  four_hits: "4 toques",
  serve_delay: "demora no saque",
  service_order: "ordem de saque",
  open_hand_tip: "largada de dedos",
  serve_attack: "ataque/bloqueio no saque",
  penalty: "penalidade",
  other: "arbitragem",
};

/**
 * Opções de "como foi o ponto", pelo último toque e por quem pontuou (a primeira é a mais provável).
 * "Falta…" (BEACH_FAULTS) fica sempre disponível à parte, na tela.
 */
export function pointOutcomes(taps: readonly QuickTap[], winner: TeamSide): QuickOutcome[] {
  return outcomesForTouches(inferSkills(taps), winner);
}

/** O mesmo, sobre toques já classificados (modo detalhado: fundamentos escolhidos pelo analista). */
export function outcomesForTouches(touches: readonly Pick<QuickTouch, "team" | "skill">[], winner: TeamSide): QuickOutcome[] {
  return [...lanceOutcomes(touches, winner), { id: "unseen", label: "Não vi como foi" }];
}

function lanceOutcomes(touches: readonly Pick<QuickTouch, "team" | "skill">[], winner: TeamSide): QuickOutcome[] {
  const last = touches.at(-1);
  if (!last) return [];
  // Posição do último toque dentro da posse da equipe (1º, 2º…), para reconhecer bola de primeira/segunda.
  let nth = 0;
  for (let i = touches.length - 1; i >= 1 && touches[i].team === last.team; i--) nth++;
  const early = last.skill === "set" || ((last.skill === "reception" || last.skill === "dig") && nth === 1);
  const earlyName = last.skill === "set" ? "segunda" : "primeira";

  if (last.team === winner) {
    if (last.skill === "serve") return [{ id: "ace", label: "Ace" }];
    if (last.skill === "block") return [{ id: "block_point", label: "Ponto de bloqueio" }];
    if (early) {
      return [
        { id: "kill", label: `Bola de ${earlyName} (ponto)` },
        { id: "kill", label: `Largada de ${earlyName}`, detail: "shot" },
        { id: "kill", label: "Explorou o bloqueio", detail: "block_out" },
      ];
    }
    return [
      { id: "kill", label: "Ponto de ataque" },
      { id: "kill", label: "Largada / shot", detail: "shot" },
      { id: "kill", label: "Explorou o bloqueio", detail: "block_out" },
    ];
  }

  const earlyAttack: QuickOutcome[] =
    last.skill === "set"
      ? [
          { id: "attack_error", label: "Bola de segunda fora", detail: "out", as_attack: true },
          { id: "attack_error", label: "Bola de segunda na rede", detail: "net", as_attack: true },
          { id: "blocked", label: "Bola de segunda bloqueada →", detail: "blocked", pick: "blocker", as_attack: true },
        ]
      : [];

  switch (last.skill) {
    case "serve":
      return [
        { id: "serve_error", label: "Saque fora", detail: "out" },
        { id: "serve_error", label: "Saque na rede", detail: "net" },
      ];
    case "reception":
      return [{ id: "reception_error", label: "Ace (passe não segurou)" }];
    case "dig": {
      const attacked = touches.at(-2)?.team === winner && touches.at(-2)?.skill === "attack";
      return [
        ...(attacked ? [{ id: "kill_through_defense" as const, label: "Ponto de ataque (defesa não segurou)" }] : []),
        { id: "dig_error", label: "Erro de defesa" },
      ];
    }
    case "attack":
      return [
        { id: "attack_error", label: "Ataque fora", detail: "out" },
        { id: "attack_error", label: "Ataque na rede", detail: "net" },
        { id: "blocked", label: "Bloqueado →", detail: "blocked", pick: "blocker" },
      ];
    case "block":
      return [
        { id: "block_error", label: "Bloqueio jogou fora", detail: "out" },
        { id: "block_error", label: "Bloqueio na rede", detail: "net" },
      ];
    case "set":
      return [
        ...earlyAttack,
        { id: "ball_error", label: "Dois toques", detail: "double" },
        { id: "ball_error", label: "Condução", detail: "lift" },
        { id: "ball_error", label: "Levantamento fora", detail: "out" },
      ];
    default:
      return [
        { id: "ball_error", label: "Bola fora", detail: "out" },
        { id: "ball_error", label: "Bola na rede", detail: "net" },
      ];
  }
}

export interface QuickRally {
  touches: QuickTouch[];
  end: { point_to: TeamSide; reason: RallyEndReason; detail?: PointDetail };
}

const other = (t: TeamSide): TeamSide => (t === "A" ? "B" : "A");

/** Eventos do rali: o lance final ganha a qualidade (e o detalhe) que o ponto revela; o fim é explícito. */
export function buildQuickRally(taps: readonly QuickTap[], winner: TeamSide, choice: QuickChoice): QuickRally {
  return buildRallyFromTouches(inferSkills(taps), winner, choice);
}

/** O mesmo, sobre toques já classificados. Não altera a lista recebida. */
export function buildRallyFromTouches(classified: readonly QuickTouch[], winner: TeamSide, choice: QuickChoice): QuickRally {
  const touches = classified.map((t) => ({ ...t }));
  const last = touches.at(-1);
  const { detail } = choice;
  if (choice.as_attack && last && last.skill !== "serve") last.skill = "attack"; // bola de primeira/segunda
  const set = (t: QuickTouch | undefined, patch: Partial<QuickTouch>) => t && Object.assign(t, patch, detail ? { detail } : {});
  const end = (reason: RallyEndReason): QuickRally => ({ touches, end: { point_to: winner, reason, ...(detail ? { detail } : {}) } });

  switch (choice.outcome) {
    case "ace":
      set(last, { quality: "#" });
      return end("ace");
    case "kill":
      set(last, { skill: last?.skill === "serve" ? "serve" : "attack", quality: "#" }); // ataque de segunda, largada…
      return end("kill");
    case "block_point":
      set(last, { skill: "block", quality: "#" });
      return end("kill");
    case "blocked": {
      if (!choice.athlete_id) throw new Error("Escolha quem bloqueou.");
      // O ataque (último toque) fica sem qualidade: o bloqueio # seguinte já o torna erro do atacante.
      touches.push({ team: winner, athlete_id: choice.athlete_id, skill: "block", quality: "#", detail: "blocked" });
      return end("kill");
    }
    case "kill_through_defense":
      set(touches.at(-2), { quality: "#" });
      set(last, { quality: "=" });
      return end("kill");
    case "reception_error":
      set(last, { quality: "=" });
      return end("ace");
    case "serve_error":
    case "attack_error":
    case "dig_error":
    case "block_error":
    case "ball_error":
      set(last, { quality: "=" });
      return end("error");
    case "fault":
      // Falta de quem perdeu o ponto: com a atleta, vira um lance "falta =" dela; sem, só o fim do rali.
      if (choice.athlete_id) {
        touches.push({ team: other(winner), athlete_id: choice.athlete_id, skill: "fault", quality: "=", ...(detail ? { detail } : {}) });
        return end("error");
      }
      return end("manual");
    case "unseen":
      return end("manual");
  }
}

/** Toques de volta para o modo rápido (ex.: ao desfazer um ponto para corrigir). Faltas não são toques. */
export const tapsFromTouches = (touches: readonly Pick<QuickTouch, "team" | "athlete_id" | "skill">[]): QuickTap[] =>
  touches
    .filter((t) => t.skill !== "fault")
    .map((t) => ({ team: t.team, athlete_id: t.athlete_id, ...(t.skill === "block" ? { block: true } : {}) }));
