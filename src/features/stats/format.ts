import type { Rate } from "@/domain/stats/types";

/** "62%", "-25%" ou "–" quando não há base de cálculo. */
export function pct(value: Rate | number | null): string {
  const n = value !== null && typeof value === "object" ? value.pct : value;
  return n === null ? "–" : `${Math.round(n * 100)}%`;
}

/** "13/21" */
export const fraction = (r: Rate): string => `${r.num}/${r.den}`;
