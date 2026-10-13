import type { Rate } from "./types";

/** Única fonte de divisão das estatísticas: denominador 0 vira `pct: null`, nunca NaN nem 0%. */
export function rate(num: number, den: number): Rate {
  return { num, den, pct: den === 0 ? null : num / den };
}

export function efficiency(kills: number, errors: number, attempts: number): number | null {
  return attempts === 0 ? null : (kills - errors) / attempts;
}
