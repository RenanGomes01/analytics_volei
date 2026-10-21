import type { PointTone } from "@/domain/stats/point-tone";

/**
 * Paleta dos gráficos (tema escuro do app). Slots categóricos da skill dataviz, passos do modo escuro,
 * validados contra a superfície dos cartões (#18181b) com scripts/validate_palette.js: todos PASS
 * (contraste ≥ 3:1, CVD adjacente ΔE ≥ 8,4, visão normal ΔE ≥ 19,8). Ordem fixa, nunca reciclada;
 * a cor segue a entidade (ex.: K1 sempre azul), não a posição.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const;

export const CHART = {
  surface: "#18181b",
  textPrimary: "#f0efec",
  textSecondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
} as const;

/** Pontos/valores com volume abaixo do mínimo: esmaecidos, nunca escondidos. */
export const LOW_VOLUME_OPACITY = 0.35;

export const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

/**
 * Cores semânticas das barras de ponto (Fase 21), por `PointTone` (domain/stats/point-tone.ts).
 * Mérito próprio na cor principal; erro do adversário em cinza claro; erro próprio em vermelho
 * (alerta); mérito do adversário em azul frio. Nunca só a cor: o cartão mostra `ToneLegend` e o
 * rótulo da linha já diz a causa. No PDF, `print` diferencia por tom de cinza/tracejado.
 */
export const TONE = {
  merit: { bar: "bg-amber-400", label: "Mérito próprio", print: "print-bar-strong" },
  gift: { bar: "bg-zinc-300", label: "Erro do adversário", print: "print-bar-gift" },
  own_error: { bar: "bg-red-500", label: "Erro próprio", print: "print-bar-strong" },
  opponent_merit: { bar: "bg-sky-500", label: "Mérito do adversário", print: "print-bar" },
  unknown: { bar: "bg-zinc-600", label: "Sem detalhe", print: "print-bar-gift" },
} as const satisfies Record<PointTone, { bar: string; label: string; print: string }>;
