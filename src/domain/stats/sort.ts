import type { StatColumn } from "./stat-columns";
import type { Rate } from "./types";

/**
 * Ordenação do construtor de relatórios (Fase 15) por QUALQUER coluna do dicionário. Porcentagens
 * ordenam pelo valor; sem base de cálculo ("–") vai sempre para o fim, nos dois sentidos.
 */

export type SortDir = "desc" | "asc";

export function sortValue(v: number | Rate | string | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const m = /^(\d+)\/(\d+)$/.exec(v); // "2ª" = pontos/tentativas: ordena pelos pontos
    return m ? Number(m[1]) + Number(m[2]) / 1e6 : null;
  }
  return v.pct;
}

export function sortByColumn<T>(rows: readonly T[], col: StatColumn<T>, dir: SortDir, tieBreak?: (a: T, b: T) => number): T[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(col.value(a));
    const y = sortValue(col.value(b));
    if (x === null && y === null) return tieBreak?.(a, b) ?? 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (dir === "desc" ? y - x : x - y) || (tieBreak?.(a, b) ?? 0);
  });
}
