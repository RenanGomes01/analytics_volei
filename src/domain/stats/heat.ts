import { sortValue } from "./sort";
import { toneOf, type StatColumn, type StatTone } from "./stat-columns";
import type { TouchCounters } from "./touch-lines";
import type { Rate } from "./types";

/**
 * Mapa de calor das tabelas (Fase 19): para cada coluna com tom (stat-columns.ts), a intensidade de
 * cada linha entre o mínimo e o máximo do recorte e quem está no topo (líder nas "good", maior
 * ofensor nas "bad"). A linha de total nunca entra (o chamador passa só as linhas). Porcentagem com
 * base (`baseOf`) menor que `minVolume` fica fora da escala: sem cor e sem selo, mas nunca escondida. Puro.
 */

export interface ColumnScale {
  tone: StatTone;
  /** 0–1 por linha (mesma ordem da entrada); null = fora da escala. */
  intensity: (number | null)[];
  /** Índices das linhas no topo (empate: todas); vazio quando não há diferença. */
  top: number[];
}

const isRate = (v: unknown): v is Rate => typeof v === "object" && v !== null && "den" in v;

/**
 * Base de uma porcentagem: o denominador do `Rate` ou, nas taxas que voltam número (eficiência), o
 * `drill` da coluna aplicado aos contadores da linha (a mesma base do drill-down). null em contagens.
 */
export function baseOf<L>(column: StatColumn<L>, line: L): number | null {
  if (column.format !== "pct") return null;
  const v = column.value(line);
  if (isRate(v)) return v.den;
  const counters = (line as { counters?: TouchCounters }).counters;
  return column.drill && counters ? column.drill(counters) : null;
}

export function columnScale<L>(lines: readonly L[], column: StatColumn<L>, minVolume = 5): ColumnScale | null {
  const tone = toneOf(column);
  if (!tone || column.format === "text") return null;
  const values = lines.map((l) => {
    const base = baseOf(column, l);
    if (base !== null && base < minVolume) return null;
    return sortValue(column.value(l));
  });
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return { tone, intensity: values.map(() => null), top: [] };
  const min = Math.min(...present);
  const max = Math.max(...present);
  if (max === min) return { tone, intensity: values.map((v) => (v === null ? null : 0)), top: [] };
  return {
    tone,
    intensity: values.map((v) => (v === null ? null : (v - min) / (max - min))),
    top: values.flatMap((v, i) => (v === max ? [i] : [])),
  };
}
