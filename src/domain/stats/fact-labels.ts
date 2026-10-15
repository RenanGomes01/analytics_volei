import { POINT_DETAIL_LABEL } from "../rally/quick-rally";
import type { TouchFact } from "./facts";

/**
 * Rótulos PT-BR dos lances para o drill-down (Fase 15). O "tipo de ataque" cruza o detalhe registrado
 * (largada/shot, explorou o bloqueio) com a posição na posse: "Largada de segunda", "Ataque (3º toque)".
 */

type LabelFact = Pick<TouchFact, "skill" | "detail" | "touch_in_possession" | "delta" | "quality">;

function touchSuffix(n: number): string {
  if (n <= 1) return "de primeira";
  if (n === 2) return "de segunda";
  return "(3º toque)";
}

/** Sufixo para frases de erro: "Ataque fora de segunda", "Ataque bloqueado no 3º toque". */
const errorSuffix = (n: number) => (n >= 3 ? "no 3º toque" : touchSuffix(n));

export function attackLabel(f: LabelFact): string {
  const base = f.detail === "shot" ? "Largada" : f.detail === "block_out" ? "Explorando o bloqueio" : "Ataque";
  return `${base} ${touchSuffix(f.touch_in_possession)}`;
}

const detailOf = (f: LabelFact) => (f.detail ? POINT_DETAIL_LABEL[f.detail] : null);

/** Onde foi o erro. */
export function errorLabel(f: LabelFact): string {
  const d = detailOf(f);
  switch (f.skill) {
    case "serve":
      return f.detail === "net" ? "Saque na rede" : f.detail === "out" ? "Saque fora" : "Erro de saque";
    case "attack":
      if (f.delta.attack_blocked) return `Ataque bloqueado ${errorSuffix(f.touch_in_possession)}`;
      if (f.detail === "out") return `Ataque fora ${errorSuffix(f.touch_in_possession)}`;
      if (f.detail === "net") return `Ataque na rede ${errorSuffix(f.touch_in_possession)}`;
      if (f.detail === "shot") return `Largada errada ${errorSuffix(f.touch_in_possession)}`;
      return `Erro de ataque ${errorSuffix(f.touch_in_possession)}`;
    case "reception":
      return "Erro de recepção (ace sofrido)";
    case "block":
      return d ? `Erro de bloqueio (${d})` : "Erro de bloqueio";
    case "dig":
      return "Erro de defesa";
    case "set":
      return d ? `Erro de levantamento (${d})` : "Erro de levantamento";
    case "fault":
      return d ? `Falta: ${d}` : "Falta";
    default:
      return "Erro na bola de graça";
  }
}

const SKILL_NAME: Record<TouchFact["skill"], string> = {
  serve: "Saque",
  reception: "Recepção",
  set: "Levantamento",
  attack: "Ataque",
  block: "Bloqueio",
  dig: "Defesa",
  freeball: "Bola de graça",
  fault: "Falta",
};

/** Tipo do lance: ataque pelo tipo×toque, erros por onde foram, o resto pelo fundamento. */
export function typeLabel(f: LabelFact, errors = false): string {
  if (errors || f.quality === "=" || f.delta.attack_blocked) return errorLabel(f);
  if (f.skill === "attack") return attackLabel(f);
  return SKILL_NAME[f.skill];
}

/** Como o lance terminou para quem o fez. */
export function outcomeLabel(f: LabelFact): string {
  const d = f.delta;
  if (d.aces) return "Ace";
  if (d.kills) return "Ponto de ataque";
  if (d.blocks) return "Ponto de bloqueio";
  if (d.attack_blocked) return "Bloqueado";
  if (d.errors) return "Erro";
  return "Seguiu em jogo";
}

export const touchLabel = (n: number) => (n <= 1 ? "1º toque" : n === 2 ? "2º toque" : "3º toque ou mais");

type DuelFact = Pick<TouchFact, "skill" | "delta" | "opponent_id" | "opponent_skill">;

/**
 * Quem enfrentou quem (Fase 16), quando o ledger tem o toque do outro lado: "Bloqueou Vinícius",
 * "Bloqueado por Ana", "Ace em Bia". null sem adversária registrada (nunca um nome inventado).
 */
export function duelLabel(f: DuelFact, nameOf: (id: string) => string): string | null {
  if (!f.opponent_id) return null;
  const n = nameOf(f.opponent_id);
  switch (f.skill) {
    case "block":
      return `Bloqueou ${n}`;
    case "attack":
      return f.opponent_skill === "block" ? `Bloqueado por ${n}` : `Defendido por ${n}`;
    case "serve":
      return f.delta.aces ? `Ace em ${n}` : `Sacou em ${n}`;
    case "reception":
      return `Recebeu o saque de ${n}`;
    case "dig":
      return `Defendeu ataque de ${n}`;
    default:
      return null;
  }
}
