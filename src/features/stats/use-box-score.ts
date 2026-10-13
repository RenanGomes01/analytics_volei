"use client";

import { useMemo } from "react";
import { computeBoxScore } from "@/domain/stats/box-score";
import type { StatsFilter } from "@/domain/stats/types";
import type { ModalityRules } from "@/domain/rules/modality";
import type { Match, RallyEvent } from "@/domain/types";

/**
 * Box Score derivado dos MESMOS eventos que o useLiveQuery da tela entrega:
 * cada lance gravado recalcula as estatísticas na hora, sem rede e sem segunda consulta ao banco.
 */
export function useBoxScore(events: readonly RallyEvent[], match: Match, rules: ModalityRules, filter: StatsFilter) {
  return useMemo(
    () =>
      computeBoxScore(
        events,
        {
          rules,
          first_server: match.first_server,
          roster: { A: match.team_a.athlete_ids, B: match.team_b.athlete_ids },
        },
        filter,
      ),
    [events, match, rules, filter],
  );
}
