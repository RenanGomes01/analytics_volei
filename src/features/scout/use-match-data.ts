"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { getDB } from "@/db/client";
import { nextAction } from "@/domain/rally/next-action";
import { activeEvents, replayMatch } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import type { Athlete } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { getMatch } from "@/services/match-service";
import { listMatchEvents } from "@/services/rally-ledger-service";

/**
 * Dados reativos da partida. A tela inteira é derivada daqui: ledger → replay → próximo passo.
 * `match`: undefined = carregando, null = não encontrada.
 */
export function useMatchData(matchId: string) {
  const scope = useMemo(() => ({ tenant_id: LOCAL_TENANT_ID, match_id: matchId }), [matchId]);

  const match = useLiveQuery(async () => (await getMatch(getDB(), LOCAL_TENANT_ID, matchId)) ?? null, [matchId]);
  const athletes = useLiveQuery(async () => {
    if (!match) return new Map<string, Athlete>();
    const ids = [...match.team_a.athlete_ids, ...match.team_b.athlete_ids];
    const rows = await getDB().athletes.bulkGet(ids);
    return new Map(rows.flatMap((a) => (a ? [[a.id, a] as const] : [])));
  }, [match]);
  const events = useLiveQuery(() => listMatchEvents(getDB(), scope), [scope]);

  const derived = useMemo(() => {
    if (!match || !events) return null;
    const rules = rulesFor(match.modality);
    const state = replayMatch(events, { rules, first_server: match.first_server });
    return {
      events,
      rules,
      state,
      next: nextAction(state, match, rules),
      lastActive: activeEvents(events).at(-1) ?? null,
      ledgerSize: events.length,
    };
  }, [match, events]);

  return { scope, match, athletes, derived };
}
