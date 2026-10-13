import type { RallyResult } from "../rally/replay";
import { otherTeam, type TeamSide } from "../types";
import type { PointsBreakdown } from "./types";

/** Contadores por equipe que dependem do resultado do rali, não de um lance isolado. */
export interface RallyCounters {
  points: PointsBreakdown;
  receiving: { won: number; total: number };
  serving: { won: number; total: number };
}

export const emptyRallyCounters = (): RallyCounters => ({
  points: { total: 0, kills: 0, aces: 0, blocks: 0, opponent_errors: 0 },
  receiving: { won: 0, total: 0 },
  serving: { won: 0, total: 0 },
});

type PointCategory = Exclude<keyof PointsBreakdown, "total">;

/** Classifica o ponto pelo motivo do replay: a soma das categorias é sempre o placar. */
function pointCategory(rally: RallyResult): PointCategory {
  switch (rally.reason) {
    case "ace":
      return "aces";
    case "kill":
      return rally.touches.at(-1)?.skill === "block" ? "blocks" : "kills";
    default: // error, four_touches, manual
      return "opponent_errors";
  }
}

/** Soma pontos e side-out/break-point de um rali fechado. Ralis abertos não contam. */
export function tallyRally(rally: RallyResult, teams: Record<TeamSide, RallyCounters>): void {
  if (!rally.point_to) return;
  const winner = teams[rally.point_to];
  winner.points.total += 1;
  winner.points[pointCategory(rally)] += 1;

  const server = rally.serving_team;
  const receiver = otherTeam(server);
  teams[server].serving.total += 1;
  teams[receiver].receiving.total += 1;
  if (rally.point_to === server) teams[server].serving.won += 1;
  else teams[receiver].receiving.won += 1;
}
