"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { athleteHref, teamHref } from "@/features/analytics/ui";
import { primaryButton, secondaryButton } from "@/features/setup/form-styles";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { DEV_SEED_TOTAL_MATCHES, getDevSeed, removeDemoData, seedDemoData } from "@/services/dev/seed-service";

type Status = { kind: "idle" } | { kind: "seeding"; done: number } | { kind: "removing" } | { kind: "error"; message: string };

/** Ferramenta de homologação: injeta/remove o conjunto de jogos sintéticos. */
export function SeedScreen() {
  // null = consultado e vazio; undefined = carregando.
  const seed = useLiveQuery(async () => (await getDevSeed(getDB())) ?? null, []);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = status.kind === "seeding" || status.kind === "removing";
  const complete = !!seed && seed.match_ids.length === DEV_SEED_TOTAL_MATCHES && !!seed.showcase.athlete_id;

  async function inject() {
    setStatus({ kind: "seeding", done: 0 });
    try {
      await seedDemoData(getDB(), LOCAL_TENANT_ID, { onProgress: (done) => setStatus({ kind: "seeding", done }) });
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function remove() {
    setConfirmRemove(false);
    setStatus({ kind: "removing" });
    try {
      await removeDemoData(getDB(), LOCAL_TENANT_ID);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (seed === undefined) return <p className="p-8 text-center text-zinc-400">Carregando…</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-300">
        <p className="text-base font-semibold text-zinc-100">O que será criado neste aparelho</p>
        <ul className="list-disc pl-5">
          <li>12 atletas (6 masculinos, 6 femininos), com gênero preenchido.</li>
          <li>5 torneios de 2026: Circuito MT Etapas 1 e 2 (masc. e fem.) e Open Nacional.</li>
          <li>Troca de duplas: Renan joga com Pedro na Etapa 1 e com George na Etapa 2.</li>
          <li>{DEV_SEED_TOTAL_MATCHES} partidas no modo detalhado (cerca de 3.000 ralis), com fases (grupos e final), amistosos desde nov/2025 e um jogo encerrado por desistência.</li>
        </ul>
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-amber-200">
          Os dados de teste aparecem junto com os seus jogos reais até você removê-los. A remoção apaga só o que foi criado aqui.
        </p>
      </section>

      {status.kind === "seeding" && (
        <div className="flex flex-col gap-2" role="status">
          <p>
            Gerando partidas… {status.done}/{DEV_SEED_TOTAL_MATCHES}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${(status.done / DEV_SEED_TOTAL_MATCHES) * 100}%` }} />
          </div>
        </div>
      )}
      {status.kind === "removing" && <p role="status">Removendo dados de teste…</p>}
      {status.kind === "error" && (
        <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
          {status.message}
        </p>
      )}

      {!seed ? (
        <button type="button" onClick={inject} disabled={busy} className={`${primaryButton} min-h-16 text-lg`}>
          Injetar dados reais de teste
        </button>
      ) : (
        <>
          {complete && status.kind !== "seeding" && (
            <section className="flex flex-col gap-2 rounded-2xl bg-emerald-900/40 p-4">
              <p className="font-semibold">
                Dados de teste prontos: {seed.match_ids.length} partidas, {seed.athlete_ids.length} atletas.
              </p>
              <div className="flex flex-wrap gap-2">
                <HardLink href="/rankings" className={`${primaryButton} flex items-center`}>
                  Ver rankings
                </HardLink>
                <HardLink href={athleteHref(seed.showcase.athlete_id)} className={`${secondaryButton} flex items-center`}>
                  Perfil do Renan
                </HardLink>
                <HardLink href={teamHref(seed.showcase.pair_key)} className={`${secondaryButton} flex items-center`}>
                  Dupla Renan / George
                </HardLink>
              </div>
            </section>
          )}
          {!complete && status.kind !== "seeding" && (
            <p className="text-sm text-amber-200">Uma injeção anterior foi interrompida. Remova os dados de teste e injete de novo.</p>
          )}
          {!confirmRemove ? (
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} className={`${secondaryButton} min-h-14`}>
              Remover dados de teste
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-red-700 p-3">
              <p>Remover as {seed.match_ids.length} partidas, os torneios e as atletas de teste? Seus jogos reais não são afetados.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmRemove(false)} className={`${secondaryButton} flex-1`}>
                  Cancelar
                </button>
                <button type="button" onClick={remove} className="min-h-12 flex-1 rounded-xl bg-red-700 px-4 font-bold text-white">
                  Remover
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
