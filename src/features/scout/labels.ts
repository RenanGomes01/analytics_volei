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

export const QUALITIES: readonly Quality[] = ["#", "+", "!", "-", "/", "="];

export const QUALITY_STYLE: Record<Quality, { hint: string; className: string }> = {
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
