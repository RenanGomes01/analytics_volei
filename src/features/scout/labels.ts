import type { RallyEndReason, RallyPhase, Quality, Skill } from "@/domain/types";

export const SKILL_LABEL: Record<Skill, string> = {
  serve: "Saque",
  reception: "Recepção",
  set: "Levant.",
  attack: "Ataque",
  block: "Bloqueio",
  dig: "Defesa",
  freeball: "Bola de graça",
  fault: "Falta",
};

/** Pergunta no topo do painel, pelo fundamento esperado no momento do rali. */
export const SKILL_PROMPT: Record<Skill, string> = {
  serve: "Quem vai sacar?",
  reception: "Quem recebeu?",
  set: "Quem levantou?",
  attack: "Quem atacou?",
  block: "Quem bloqueou ou defendeu?",
  dig: "Quem defendeu?",
  freeball: "Quem passou de graça?",
  fault: "Quem fez a falta?",
};

/** Fundamentos especiais: ficam numa fila separada dos fundamentos de jogo. */
export const SPECIAL_SKILLS: readonly Skill[] = ["freeball", "fault"];

export const QUALITIES: readonly Quality[] = ["#", "+", "!", "-", "/", "="];

export const QUALITY_STYLE: Record<Quality, { hint: string; className: string }> = {
  "?": { hint: "Não avaliado", className: "bg-zinc-600 text-zinc-50" },
  "#": { hint: "Perfeito", className: "bg-emerald-600 text-white" },
  "+": { hint: "Positivo", className: "bg-lime-600 text-white" },
  "!": { hint: "Regular", className: "bg-amber-500 text-zinc-950" },
  "-": { hint: "Negativo", className: "bg-orange-600 text-white" },
  "/": { hint: "Ruim", className: "bg-rose-600 text-white" },
  "=": { hint: "Erro", className: "bg-red-800 text-white" },
};

export const PHASE_LABEL: Record<RallyPhase, string> = {
  side_out: "K1 · Virada de bola",
  counter_attack: "K2 · Contra-ataque",
};

export const REASON_LABEL: Record<RallyEndReason, string> = {
  kill: "ataque",
  ace: "ace",
  error: "erro",
  four_touches: "4 toques",
  manual: "marcado",
};
