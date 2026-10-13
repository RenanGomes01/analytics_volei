import type { Modality } from "../types";
import type { AthleteAggregate } from "./aggregate";

/** Métricas de ranking de atletas numa competição. */
export type RankingMetric = "points" | "attack" | "aces" | "blocks" | "reception" | "digs";

export interface RankingSpec {
  metric: RankingMetric;
  label: string;
  /** Valor ordenado (maior = melhor). null = sem base de cálculo. */
  value: (a: AthleteAggregate) => number | null;
  /** Volume que sustenta o valor (desempate e mínimo). */
  volume: (a: AthleteAggregate) => number;
  /** Volume mínimo para entrar: um "1 de 1 = 100%" não pode liderar. */
  min: number;
  /** Contagens exigem valor > 0 para aparecer; porcentagens podem ser 0 ou negativas. */
  kind: "count" | "rate";
}

export function rankingSpecs(modality: Modality): RankingSpec[] {
  return [
    { metric: "points", label: "Maiores pontuadores", value: (a) => a.points, volume: (a) => a.matches, min: 0, kind: "count" },
    {
      metric: "attack",
      label: "Melhores atacantes",
      value: (a) => a.attack.efficiency,
      volume: (a) => a.attack.attempts,
      min: 10,
      kind: "rate",
    },
    { metric: "aces", label: "Mais aces", value: (a) => a.serve.aces, volume: (a) => a.serve.attempts, min: 0, kind: "count" },
    { metric: "blocks", label: "Paredões", value: (a) => a.blocks, volume: (a) => a.matches, min: 0, kind: "count" },
    {
      metric: "reception",
      label: modality === "beach" ? "Melhor passe (na mão)" : "Melhor recepção (#+)",
      value: (a) => a.reception.positive.pct,
      volume: (a) => a.reception.attempts,
      min: 10,
      kind: "rate",
    },
    { metric: "digs", label: "Mais defesas", value: (a) => a.digs, volume: (a) => a.matches, min: 0, kind: "count" },
  ];
}

export interface RankingRow {
  athlete_id: string;
  value: number;
  volume: number;
}

/** Ordena por valor (desc), depois volume (desc), depois nome (asc). Aplica o volume mínimo. */
export function rankAthletes(
  athletes: readonly AthleteAggregate[],
  spec: RankingSpec,
  { nameOf, limit = 5, min = spec.min }: { nameOf: (id: string) => string; limit?: number; min?: number },
): RankingRow[] {
  const rows: RankingRow[] = [];
  for (const a of athletes) {
    const value = spec.value(a);
    const volume = spec.volume(a);
    if (value === null || volume < min) continue;
    if (spec.kind === "count" && value <= 0) continue;
    rows.push({ athlete_id: a.athlete_id, value, volume });
  }
  rows.sort(
    (x, y) => y.value - x.value || y.volume - x.volume || nameOf(x.athlete_id).localeCompare(nameOf(y.athlete_id), "pt-BR"),
  );
  return rows.slice(0, limit);
}
