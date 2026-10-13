"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import { matchesSearch } from "@/domain/roster/identity";
import type { Athlete } from "@/domain/types";
import { inputClass, primaryButton, secondaryButton } from "@/features/setup/form-styles";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { mergeAthletes, renameTeam, unmergeAthlete, updateAthlete } from "@/services/roster-service";
import { useRosterData, type RosterData } from "./use-roster-data";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function AthleteRow({
  athlete,
  roster,
  selected,
  onToggle,
  onError,
}: {
  athlete: Athlete;
  roster: RosterData;
  selected: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(athlete.name);
  const [number, setNumber] = useState(athlete.jersey_number?.toString() ?? "");
  const aliases = roster.aliasesOf.get(athlete.id) ?? [];

  async function run(action: () => Promise<unknown>) {
    onError(null);
    try {
      await action();
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <li className={`flex flex-col gap-2 rounded-2xl p-3 ${selected ? "bg-amber-400/10 ring-2 ring-amber-400" : "bg-zinc-900"}`}>
      {!editing ? (
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Selecionar ${athlete.name} para unir`} className="size-6" />
          <span className="w-8 text-right text-xl font-bold tabular-nums">{athlete.jersey_number ?? "–"}</span>
          <span className="flex-1 truncate text-lg">{athlete.name}</span>
          <span className="text-sm text-zinc-400">{plural(roster.matchCount.get(athlete.id) ?? 0, "jogo", "jogos")}</span>
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            Editar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input className={`${inputClass} w-20 text-center`} inputMode="numeric" value={number} aria-label="Número" onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <input className={`${inputClass} min-w-0 flex-1`} value={name} aria-label="Nome" onChange={(e) => setName(e.target.value)} />
          <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
            Cancelar
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => run(() => updateAthlete(getDB(), LOCAL_TENANT_ID, athlete.id, { name, jersey_number: number ? Number(number) : null }))}
          >
            Salvar
          </button>
        </div>
      )}
      {aliases.length > 0 && (
        <ul className="flex flex-wrap gap-2 pl-14 text-sm text-zinc-400">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1">
              unida: {a.name}
              <button type="button" onClick={() => run(() => unmergeAthlete(getDB(), LOCAL_TENANT_ID, a.id))} className="min-h-8 px-1 text-zinc-300" aria-label={`Desfazer união de ${a.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function TeamRow({ team, roster }: { team: RosterData["teams"][number]; roster: RosterData }) {
  const [name, setName] = useState(team.name);
  const [editing, setEditing] = useState(false);
  const members = team.athlete_ids.map((id) => roster.athleteById.get(id)?.name ?? "?").join(" / ");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-900 p-3">
      {editing ? (
        <>
          <input className={`${inputClass} min-w-0 flex-1`} value={name} aria-label="Nome da dupla" onChange={(e) => setName(e.target.value)} />
          <button
            type="button"
            className={primaryButton}
            onClick={async () => {
              await renameTeam(getDB(), LOCAL_TENANT_ID, team.id, name);
              setEditing(false);
            }}
          >
            Salvar
          </button>
        </>
      ) : (
        <>
          <span className="flex-1">
            <span className="block text-lg font-semibold">{team.name}</span>
            {team.name !== members && <span className="text-sm text-zinc-400">{members}</span>}
          </span>
          <span className="text-xs uppercase text-zinc-500">{team.modality === "beach" ? "Beach" : "Indoor"}</span>
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            Renomear
          </button>
        </>
      )}
    </li>
  );
}

/** Cadastro central: editar atletas, unir cadastros duplicados (jogos do MVP) e nomear duplas. */
export function RosterScreen() {
  const roster = useRosterData();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!roster) return <p className="p-4 text-center text-zinc-400">Carregando cadastro…</p>;

  const athletes = roster.canonical.filter((a) => matchesSearch(query, a.name, String(a.jersey_number ?? "")));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const target = principal && selected.includes(principal) ? principal : selected[0];

  async function merge() {
    setError(null);
    try {
      await mergeAthletes(getDB(), LOCAL_TENANT_ID, { canonical_id: target, alias_ids: selected.filter((id) => id !== target) });
      setSelected([]);
      setPrincipal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Atletas</h2>
        <p className="text-sm text-zinc-400">
          Jogos antigos criavam um cadastro por partida. Marque os cadastros da mesma pessoa e toque em “Unir” para juntar o
          histórico. Os lances registrados não são alterados.
        </p>
        <input className={inputClass} placeholder="Buscar atleta" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar atleta" />

        {selected.length >= 2 && (
          <div className="sticky top-2 z-10 flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-zinc-950 p-3">
            <span className="text-sm">Cadastro principal (o nome que fica):</span>
            <div className="flex flex-wrap gap-2">
              {selected.map((id) => (
                <button key={id} type="button" onClick={() => setPrincipal(id)} className={id === target ? primaryButton : secondaryButton}>
                  {roster.athleteById.get(id)?.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={merge} className={primaryButton}>
              Unir {selected.length} cadastros
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
            {error}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {athletes.map((a) => (
            <AthleteRow key={a.id} athlete={a} roster={roster} selected={selected.includes(a.id)} onToggle={() => toggle(a.id)} onError={setError} />
          ))}
          {athletes.length === 0 && <li className="text-zinc-500">Nenhuma atleta.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Duplas e times</h2>
        <ul className="flex flex-col gap-2">
          {roster.teams.map((t) => (
            <TeamRow key={t.id} team={t} roster={roster} />
          ))}
          {roster.teams.length === 0 && <li className="text-zinc-500">As duplas aparecem aqui ao criar partidas.</li>}
        </ul>
      </section>
    </div>
  );
}
