"use client";

import { useSyncExternalStore } from "react";

/**
 * O que o SyncAgent está fazendo agora, para a central de sincronização: "Sincronizando…" e o
 * resultado do último ciclo pedido à mão. Só memória (o estado durável fica no outbox/meta).
 */
export interface SyncActivity {
  running: boolean;
  last: { at: number; acked: number; conflicts: number; error: string | null } | null;
}

let state: SyncActivity = { running: false, last: null };
const listeners = new Set<() => void>();

export function setSyncActivity(patch: Partial<SyncActivity>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: SyncActivity = { running: false, last: null };

export function useSyncActivity(): SyncActivity {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
