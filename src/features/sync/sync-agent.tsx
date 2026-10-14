"use client";

import { liveQuery } from "dexie";
import { useEffect } from "react";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import type { ScoutDB } from "@/db/schema";
import { getLinkedAccount, retryPendingNow, setSyncNotice } from "@/services/sync/account-service";
import { MockTransport } from "@/services/sync/mock-transport";
import { runPull } from "@/services/sync/pull-service";
import { getSupabase } from "@/services/sync/supabase-client";
import { SupabaseTransport } from "@/services/sync/supabase-transport";
import { lastServerSeq, runSyncCycle } from "@/services/sync/sync-engine";
import { BLOCKED_KEY, PULL_ERROR_KEY } from "@/services/sync/sync-keys";
import { isAppOutdated } from "@/features/update/app-update";
import { SUPABASE_CONFIG, SYNC_MODE, SYNC_NOW_EVENT } from "./sync-config";

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

/** Na tela de scout só envia: o pull (gravações vindas de fora) espera a pessoa sair da quadra. */
const onScoutScreen = () => window.location.pathname.startsWith("/match");

/** Um ciclo do modo de teste: só envio para o servidor em memória. */
function mockCycle(db: ScoutDB) {
  let transport: MockTransport | null = null;
  return async () => {
    transport ??= new MockTransport({ latencyMs: 300, startSeq: await lastServerSeq(db) });
    const active = transport;
    await withSyncLock(() => runSyncCycle(db, active, { tenant_id: LOCAL_TENANT_ID }));
  };
}

/**
 * Um ciclo com a nuvem: só com conta conectada E vínculo confirmado (tela Conta). Primeiro envia
 * (edições locais ganham server_seq maior que o eco antigo), depois baixa.
 */
function supabaseCycle(db: ScoutDB) {
  return async (manual: boolean) => {
    const client = await getSupabase(SUPABASE_CONFIG!);
    const transport = new SupabaseTransport(client);
    await withSyncLock(async () => {
      const { data, error } = await client.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        await setSyncNotice(db, BLOCKED_KEY, error ? "Sem conexão com o servidor." : "Entre na conta para sincronizar.");
        return;
      }
      if ((await getLinkedAccount(db)) !== user.id) {
        await setSyncNotice(db, BLOCKED_KEY, "Confirme o envio dos dados deste aparelho na tela Conta.");
        return;
      }
      await setSyncNotice(db, BLOCKED_KEY, null);
      if (manual) await retryPendingNow(db, LOCAL_TENANT_ID);
      const report = await runSyncCycle(db, transport, { tenant_id: LOCAL_TENANT_ID });
      if (report.error || onScoutScreen()) return;
      try {
        await runPull(db, transport, { tenant_id: LOCAL_TENANT_ID });
        await setSyncNotice(db, PULL_ERROR_KEY, null);
      } catch (e) {
        await setSyncNotice(db, PULL_ERROR_KEY, e instanceof Error ? e.message : String(e));
      }
    });
  };
}

/**
 * Envia o outbox (e, no modo supabase, baixa da nuvem) em segundo plano. Nunca bloqueia a
 * interface e falha em silêncio: o estado fica visível no SyncBadge e na tela Conta.
 * Gatilhos: intervalo, volta da rede, volta para a aba, novas gravações na fila e "Sincronizar agora".
 */
export function SyncAgent() {
  useEffect(() => {
    if (SYNC_MODE === "off" || typeof indexedDB === "undefined") return;
    const db = getDB();
    const cycle = SYNC_MODE === "supabase" ? supabaseCycle(db) : mockCycle(db);
    let running = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async (manual = false) => {
      // Aba com código antigo (versão nova já instalada): não envia o outbox até recarregar.
      if (running || disposed || isAppOutdated()) return;
      running = true;
      try {
        await cycle(manual);
      } catch (e) {
        console.warn("[sync] ciclo falhou", e);
      } finally {
        running = false;
      }
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => run(), ms);
    };

    const onOnline = () => schedule(0);
    const onVisible = () => document.visibilityState === "visible" && schedule(0);
    const onSyncNow = () => run(true);
    const interval = setInterval(() => run(), INTERVAL_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener(SYNC_NOW_EVENT, onSyncNow);
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
      window.removeEventListener(SYNC_NOW_EVENT, onSyncNow);
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
