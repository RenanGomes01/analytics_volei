import type { SupabaseConfig } from "@/services/sync/supabase-client";

/**
 * `NEXT_PUBLIC_SYNC_MODE`:
 *  - "off" (padrão): nada é enviado; a fila só cresce.
 *  - "mock": MockTransport em memória (desenvolvimento e demo).
 *  - "supabase": nuvem real; exige NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *    Sem elas, cai para "off" — nunca quebra o app.
 */
export type SyncMode = "off" | "mock" | "supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const SUPABASE_CONFIG: SupabaseConfig | null = url && anonKey ? { url, anonKey } : null;

function resolveMode(): SyncMode {
  const raw = process.env.NEXT_PUBLIC_SYNC_MODE;
  if (raw === "mock") return "mock";
  if (raw !== "supabase") return "off";
  if (SUPABASE_CONFIG) return "supabase";
  if (typeof window !== "undefined") {
    console.warn("[sync] NEXT_PUBLIC_SYNC_MODE=supabase sem NEXT_PUBLIC_SUPABASE_URL/ANON_KEY: sincronização desligada.");
  }
  return "off";
}

export const SYNC_MODE: SyncMode = resolveMode();

/** Evento para pedir um ciclo imediato ao SyncAgent (ex.: botão "Sincronizar agora"). */
export const SYNC_NOW_EVENT = "scout:sync-now";

export const requestSyncNow = () => window.dispatchEvent(new Event(SYNC_NOW_EVENT));
