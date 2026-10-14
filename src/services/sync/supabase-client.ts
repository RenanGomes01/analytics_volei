import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let client: Promise<SupabaseClient> | null = null;

/**
 * Cliente único do Supabase, carregado sob demanda (`import()`): o SDK fica fora do carregamento
 * inicial de todas as páginas — inclusive da tela de scout. Só o SyncAgent e a tela de conta chamam.
 * A sessão fica no localStorage do aparelho e sobrevive offline (a renovação espera a rede).
 */
export function getSupabase(config: SupabaseConfig): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "scout-volei-auth" },
    }),
  );
  return client;
}
