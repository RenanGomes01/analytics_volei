import type { TeamAggregate } from "./aggregate";

/** Rankings de duplas numa temporada/competição, com volume mínimo (como o de atletas). Puro. */
export type TeamMetric = "wins" | "win_rate" | "side_out" | "break_point" | "point_diff";

export interface TeamRankingSpec {
  metric: TeamMetric;
  label: string;
  value: (t: TeamAggregate) => number | null;
  volume: (t: TeamAggregate) => number;
  min: number;
  /** Texto do mínimo exigido, para a tela. */
  minLabel?: string;
  kind: "count" | "rate" | "diff";
}

const decided = (t: TeamAggregate) => t.wins + t.losses;

export const TEAM_RANKINGS: TeamRankingSpec[] = [
  { metric: "wins", label: "Mais vitórias", value: (t) => t.wins, volume: (t) => t.matches, min: 0, kind: "count" },
  {
    metric: "win_rate",
    label: "% de vitórias",
    value: (t) => (decided(t) ? t.wins / decided(t) : null),
    volume: decided,
    min: 3,
    minLabel: "mín. 3 jogos encerrados",
    kind: "rate",
  },
  {
    metric: "side_out",
    label: "Virada de bola (K1)",
    value: (t) => t.side_out.pct,
    volume: (t) => t.side_out.den,
    min: 30,
    minLabel: "mín. 30 ralis recebendo",
    kind: "rate",
  },
  {
    metric: "break_point",
    label: "Quebra de saque (K2)",
    value: (t) => t.break_point.pct,
    volume: (t) => t.break_point.den,
    min: 30,
    minLabel: "mín. 30 ralis sacando",
    kind: "rate",
  },
  { metric: "point_diff", label: "Saldo de pontos", value: (t) => t.points_for - t.points_against, volume: (t) => t.matches, min: 1, kind: "diff" },
];

export interface TeamRankingRow {
  pair_key: string;
  value: number;
  volume: number;
}

export function rankTeams(
  teams: readonly TeamAggregate[],
  spec: TeamRankingSpec,
  { nameOf, limit = 5, min = spec.min }: { nameOf: (key: string) => string; limit?: number; min?: number },
): TeamRankingRow[] {
  const rows: TeamRankingRow[] = [];
  for (const t of teams) {
    const value = spec.value(t);
    const volume = spec.volume(t);
    if (value === null || volume < min) continue;
    if (spec.kind === "count" && value <= 0) continue;
    rows.push({ pair_key: t.pair_key, value, volume });
  }
  rows.sort((x, y) => y.value - x.value || y.volume - x.volume || nameOf(x.pair_key).localeCompare(nameOf(y.pair_key), "pt-BR"));
  return rows.slice(0, limit);
}
