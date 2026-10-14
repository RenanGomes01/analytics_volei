"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "@/features/toast/toast";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, type FormEvent } from "react";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { countSyncable, getLinkedAccount, linkAccount } from "@/services/sync/account-service";
import { getSupabase } from "@/services/sync/supabase-client";
import { requestSyncNow, SUPABASE_CONFIG, SYNC_MODE } from "@/features/sync/sync-config";
import { SyncCenter } from "./sync-center";

const card = "flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4";
const primary = "min-h-12 rounded-xl bg-amber-400 px-5 font-bold text-zinc-950 disabled:opacity-50";
const secondary = "min-h-12 rounded-xl bg-zinc-800 px-5 font-semibold disabled:opacity-50";

function loginError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "E-mail ainda não confirmado no Supabase.";
  if (/fetch|network|failed/i.test(message)) return "Sem conexão com o servidor. Tente quando houver internet.";
  return message;
}

/** Conta da nuvem (Fase 8): entrar, confirmar o vínculo do aparelho e acompanhar o sync. */
export function AccountScreen() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pt-0">
      {SYNC_MODE === "supabase" && SUPABASE_CONFIG ? (
        <>
          <CloudAccount />
          <SyncCenter />
        </>
      ) : (
        <section className={card}>
          <h2 className="text-lg font-bold">Sincronização com a nuvem desligada</h2>
          <p className="text-zinc-300">
            Os dados ficam só neste aparelho (e nos JSONs exportados). Para ligar, configure no <code>.env.local</code>:{" "}
            <code>NEXT_PUBLIC_SYNC_MODE=supabase</code>, <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, e gere o app de novo.
          </p>
        </section>
      )}
    </main>
  );
}

function CloudAccount() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    getSupabase(SUPABASE_CONFIG!)
      .then(async (c) => {
        if (cancelled) return;
        setClient(c);
        const { data } = await c.auth.getSession();
        if (!cancelled) setSession(data.session);
        unsubscribe = c.auth.onAuthStateChange((_event, s) => setSession(s)).data.subscription.unsubscribe;
      })
      .catch(() => setLoadError("Não foi possível carregar o módulo da nuvem. Abra esta tela com internet uma vez."));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (loadError) return <p className="rounded-xl bg-red-900/60 px-4 py-3 text-red-100">{loadError}</p>;
  if (!client || session === undefined) return <p className="text-zinc-400">Carregando…</p>;
  if (!session) return <LoginForm client={client} />;
  return <SignedIn client={client} session={session} />;
}

function LoginForm({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(loginError(error.message));
    } catch (err) {
      setError(loginError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={card}>
      <h2 className="text-lg font-bold">Entrar na conta</h2>
      <p className="text-sm text-zinc-400">
        Use a conta criada no painel do Supabase. A mesma conta no tablet e no computador mantém os campeonatos iguais nos dois.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">E-mail</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 rounded-xl bg-zinc-800 px-4 text-lg"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Senha</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-12 rounded-xl bg-zinc-800 px-4 text-lg"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function SignedIn({ client, session }: { client: SupabaseClient; session: Session }) {
  const db = getDB();
  const user = session.user;
  const linked = useLiveQuery(() => getLinkedAccount(db), [], undefined as string | null | undefined);
  const syncable = useLiveQuery(() => countSyncable(db, LOCAL_TENANT_ID), []);
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    try {
      await linkAccount(db, LOCAL_TENANT_ID, user.id);
      toast.success("Aparelho vinculado. Enviando os dados para a nuvem…");
      requestSyncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className={card}>
        <p>
          Conectado como <strong>{user.email ?? user.id}</strong>
        </p>
        <button type="button" onClick={() => client.auth.signOut({ scope: "local" })} className={`${secondary} self-start`}>
          Sair
        </button>
        <p className="text-xs text-zinc-500">Sair não apaga nada deste aparelho.</p>
      </section>

      {linked === undefined ? null : linked !== user.id ? (
        <section className={`${card} border-2 border-amber-400`}>
          <h2 className="text-lg font-bold">Enviar os dados deste aparelho para esta conta?</h2>
          <p className="text-zinc-300">
            {syncable ?? "…"} registros (partidas, lances e cadastros) vão para a nuvem. Depois disso, tudo o que for scouteado aqui sobe
            sozinho, e o que vier de outros aparelhos desta conta aparece aqui.
          </p>
          {linked && (
            <p className="text-amber-200">
              Este aparelho estava vinculado a outra conta. Os dados locais continuam aqui e serão enviados também para esta.
            </p>
          )}
          <p className="text-xs text-zinc-500">Os dados de teste do /dev/seed nunca são enviados.</p>
          <button type="button" disabled={busy} onClick={link} className={`${primary} self-start`}>
            Enviar e sincronizar
          </button>
        </section>
      ) : (
        <p className="px-1 text-sm text-zinc-400">Aparelho vinculado a esta conta: o que for scouteado aqui sobe sozinho.</p>
      )}
    </>
  );
}
