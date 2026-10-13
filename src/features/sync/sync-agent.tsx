"use client";

import { liveQuery } from "dexie";
import { useEffect } from "react";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { MockTransport } from "@/services/sync/mock-transport";
import { lastServerSeq, runSyncCycle } from "@/services/sync/sync-engine";
import type { SyncTransport } from "@/services/sync/transport";
import { isAppOutdated } from "@/features/update/app-update";
import { SYNC_MODE } from "./sync-config";

const INTERVAL_MS = 30_000;
const AFTER_WRITE_DELAY_MS = 2_000;

/** Só uma aba sincroniza por vez; as outras pulam o ciclo em vez de esperar. */
async function withSyncLock(fn: () => Promise<unknown>): Promise<void> {
  if (!("locks" in navigator)) {
    await fn();
    return;
  }
  await navigator.locks.request("scout-sync", { ifAvailable: true }, async (lock) => {
    if (lock) await fn();
  });
}

/**
 * Envia o outbox em segundo plano. Nunca bloqueia a interface e falha em silêncio:
 * o estado fica visível no SyncBadge. Gatilhos: intervalo, volta da rede, volta para a aba e
 * novas gravações na fila.
 */
export function SyncAgent() {
  useEffect(() => {
    if (SYNC_MODE === "off" || typeof indexedDB === "undefined") return;
    const db = getDB();
    let transport: SyncTransport | null = null;
    let running = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      // Aba com código antigo (versão nova já instalada): não envia o outbox até recarregar.
      if (running || disposed || isAppOutdated()) return;
      running = true;
      try {
        transport ??= new MockTransport({ latencyMs: 300, startSeq: await lastServerSeq(db) });
        const active = transport;
        await withSyncLock(() => runSyncCycle(db, active, { tenant_id: LOCAL_TENANT_ID }));
      } catch (e) {
        console.warn("[sync] ciclo falhou", e);
      } finally {
        running = false;
      }
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    const onOnline = () => schedule(0);
    const onVisible = () => document.visibilityState === "visible" && schedule(0);
    const interval = setInterval(run, INTERVAL_MS);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const subscription = liveQuery(() => db.outbox.where("status").equals("pending").count()).subscribe({
      next: (pending) => pending > 0 && schedule(AFTER_WRITE_DELAY_MS),
    });
    schedule(0);

    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
