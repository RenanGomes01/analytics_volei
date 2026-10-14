"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getDB } from "@/db/client";
import { nextAction } from "@/domain/rally/next-action";
import { LedgerDraft } from "@/domain/rally/plan-events";
import { activeEvents, replayMatch } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import type { Athlete } from "@/domain/types";
import { newId } from "@/lib/id";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { getDeviceId } from "@/services/device-service";
import { getMatch } from "@/services/match-service";
import { listMatchEvents, persistEvents } from "@/services/rally-ledger-service";
import { ScoutLedger } from "./scout-ledger";

/**
 * Executa um comando do scout sobre o ledger em memória: planeja (síncrono, pode lançar o erro do
 * comando), mostra na hora e grava em segundo plano. `expectedSize` = tamanho do ledger que a tela
 * mostrava no toque; se ele já mudou (toque duplo antes do React redesenhar), o toque é ignorado.
 * Devolve undefined quando o toque foi ignorado ou a partida ainda não carregou.
 */
export type ScoutExec = <T>(plan: (draft: LedgerDraft) => T, expectedSize?: number) => T | undefined;

/**
 * Dados da partida. A tela inteira é derivada daqui: ledger em memória → replay → próximo passo.
 * `match`: undefined = carregando, null = não encontrada.
 */
export function useMatchData(matchId: string) {
  const scope = useMemo(() => ({ tenant_id: LOCAL_TENANT_ID, match_id: matchId }), [matchId]);
  const ledger = useMemo(() => new ScoutLedger((events) => persistEvents(getDB(), events)), []);
  useEffect(() => () => ledger.dispose(), [ledger]);

  const match = useLiveQuery(async () => (await getMatch(getDB(), LOCAL_TENANT_ID, matchId)) ?? null, [matchId]);
  const athletes = useLiveQuery(async () => {
    if (!match) return new Map<string, Athlete>();
    const ids = [...match.team_a.athlete_ids, ...match.team_b.athlete_ids];
    const rows = await getDB().athletes.bulkGet(ids);
    return new Map(rows.flatMap((a) => (a ? [[a.id, a] as const] : [])));
  }, [match]);
  const persisted = useLiveQuery(() => listMatchEvents(getDB(), scope), [scope]);
  useEffect(() => {
    if (persisted) ledger.setPersisted(persisted);
  }, [ledger, persisted]);

  // Lido uma vez ao abrir: a gravação de cada lance não toca mais a `meta`.
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getDeviceId(getDB()).then(
      (id) => alive && setDeviceId(id),
      (e: unknown) => alive && setDeviceError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  const snapshot = useSyncExternalStore(ledger.subscribe, ledger.getSnapshot, ledger.getSnapshot);

  const derived = useMemo(() => {
    if (!match || !snapshot.loaded) return null;
    const events = snapshot.events;
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
  }, [match, snapshot.loaded, snapshot.events]);

  const exec: ScoutExec = useCallback(
    (plan, expectedSize) => {
      if (!match || !deviceId || !ledger.getSnapshot().loaded) return undefined;
      const events = ledger.events;
      if (expectedSize !== undefined && events.length !== expectedSize) return undefined;
      const draft = new LedgerDraft(events, { scope, match, device_id: deviceId, newId, now: Date.now });
      const result = plan(draft);
      ledger.submit(draft.added);
      return result;
    },
    [ledger, match, deviceId, scope],
  );

  const save = useMemo(
    () => ({
      unsaved: snapshot.unsaved,
      error: snapshot.error,
      timings: snapshot.timings,
      retry: () => ledger.retry(),
      whenIdle: () => ledger.whenIdle(),
    }),
    [ledger, snapshot.unsaved, snapshot.error, snapshot.timings],
  );

  return { scope, match, athletes, derived, exec, ready: !!deviceId, deviceError, save };
}
