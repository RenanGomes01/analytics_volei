"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import { matchesSearch } from "@/domain/roster/identity";
import type { Athlete, Gender } from "@/domain/types";
import { athleteHref, teamHref } from "@/features/analytics/ui";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "@/features/setup/form-styles";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { EmptyState } from "@/components/empty-state";
import { HardLink } from "@/components/hard-link";
import { toast } from "@/features/toast/toast";
import { NewAthleteSheet } from "./new-athlete-sheet";
import { NewTeamSheet } from "./new-team-sheet";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { deleteAthlete, deleteTeam, mergeAthletes, renameTeam, unmergeAthlete, updateAthlete } from "@/services/roster-service";
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
  const [gender, setGender] = useState<Gender | null>(athlete.gender ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const aliases = roster.aliasesOf.get(athlete.id) ?? [];
  const games = roster.matchCount.get(athlete.id) ?? 0;

  async function run(action: () => Promise<unknown>, done: string) {
    onError(null);
    try {
      await action();
      toast.success(done);
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
          <HardLink href={athleteHref(athlete.id)} className="flex-1 truncate text-lg underline-offset-4 hover:underline">
            {athlete.name}
          </HardLink>
          {athlete.gender ? (
            <span className="text-sm text-zinc-400">{athlete.gender}</span>
          ) : (
            <span className="text-xs text-amber-300" title="Gênero não informado">sem gênero</span>
          )}
          <span className="text-sm text-zinc-400">{plural(roster.matchCount.get(athlete.id) ?? 0, "jogo", "jogos")}</span>
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            Editar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input className={`${inputClass} w-20 text-center`} inputMode="numeric" value={number} aria-label="Número" onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <input className={`${inputClass} min-w-0 flex-1`} value={name} aria-label="Nome" onChange={(e) => setName(e.target.value)} />
          {(["F", "M"] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gender === g}
              aria-label={g === "F" ? "Feminino" : "Masculino"}
              onClick={() => setGender(gender === g ? null : g)}
              className={`${segmentedClass(gender === g)} w-14 flex-none`}
            >
              {g}
            </button>
          ))}
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${secondaryButton} text-red-300`}>
            Excluir
          </button>
          <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
            Cancelar
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() =>
              run(() => updateAthlete(getDB(), LOCAL_TENANT_ID, athlete.id, { name, jersey_number: number ? Number(number) : null, gender }), "Atleta salva.")
            }
          >
            Salvar
          </button>
        </div>
      )}
      {confirmDelete && (
        <ConfirmSheet
          title={`Excluir ${athlete.name}?`}
          confirmLabel="Excluir atleta"
          danger
          canConfirm={games === 0}
          onConfirm={async () => {
            await deleteAthlete(getDB(), LOCAL_TENANT_ID, athlete.id);
            toast.success(`${athlete.name} excluída do cadastro.`);
          }}
          onClose={() => setConfirmDelete(false)}
        >
          {games > 0 ? (
            <p>
              {athlete.name} joga em {plural(games, "partida", "partidas")}: os lances guardam o cadastro dela, então não dá para excluir. Se é um
              cadastro duplicado, marque os dois e use “Unir”.
            </p>
          ) : (
            <p>Para cadastros feitos por engano. As duplas do cadastro com ela também saem. A exclusão vai para a nuvem na próxima sincronização.</p>
          )}
        </ConfirmSheet>
      )}
      {aliases.length > 0 && (
        <ul className="flex flex-wrap gap-2 pl-14 text-sm text-zinc-400">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1">
              unida: {a.name}
              <button type="button" onClick={() => run(() => unmergeAthlete(getDB(), LOCAL_TENANT_ID, a.id), `${a.name} voltou a ser um cadastro separado.`)} className="min-h-8 px-1 text-zinc-300" aria-label={`Desfazer união de ${a.name}`}>
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = team.athlete_ids.map((id) => roster.athleteById.get(id)?.name ?? "?").join(" / ");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-900 p-3">
      {editing ? (
        <>
              <input className={`${inputClass} min-w-0 flex-1`} value={name} aria-label="Nome da dupla" onChange={(e) => setName(e.target.value)} />
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${secondaryButton} text-red-300`}>
                Excluir
              </button>
              <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
                Cancelar
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={async () => {
                  try {
                    await renameTeam(getDB(), LOCAL_TENANT_ID, team.id, name);
                    toast.success("Dupla salva.");
                    setEditing(false);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Salvar
              </button>
        </>
      ) : (
        <>
              <span className="flex-1">
                <HardLink href={teamHref(team.pair_key)} className="block text-lg font-semibold underline-offset-4 hover:underline">
                  {team.name}
                </HardLink>
                {team.name !== members && <span className="text-sm text-zinc-400">{members}</span>}
              </span>
              <span className="text-xs uppercase text-zinc-500">{team.modality === "beach" ? "Beach" : "Indoor"}</span>
              <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
                Editar
              </button>
        </>
      )}
      {confirmDelete && (
        <ConfirmSheet
          title={`Excluir a dupla ${team.name}?`}
          confirmLabel="Excluir dupla"
          danger
          onConfirm={async () => {
            await deleteTeam(getDB(), LOCAL_TENANT_ID, team.id);
            toast.success(`Dupla ${team.name} excluída.`);
          }}
          onClose={() => setConfirmDelete(false)}
        >
          <p>Some só do cadastro (atalho para novas partidas). As partidas já jogadas continuam com o nome e as atletas gravados.</p>
        </ConfirmSheet>
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
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [creating, setCreating] = useState<"athlete" | "team" | null>(null);

  if (!roster) return <p className="p-4 text-center text-zinc-400">Carregando cadastro…</p>;

  const missingGender = roster.canonical.filter((a) => !a.gender).length;
  const athletes = roster.canonical.filter(
    (a) => (!onlyMissing || !a.gender) && matchesSearch(query, a.name, String(a.jersey_number ?? "")),
  );
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const target = principal && selected.includes(principal) ? principal : selected[0];

  async function merge() {
    setError(null);
    try {
      await mergeAthletes(getDB(), LOCAL_TENANT_ID, { canonical_id: target, alias_ids: selected.filter((id) => id !== target) });
      toast.success(`${selected.length} cadastros unidos em ${roster!.athleteById.get(target)?.name ?? "uma atleta"}.`);
      setSelected([]);
      setPrincipal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      {roster.canonical.length === 0 && roster.teams.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Você ainda não tem atletas ou duplas cadastradas."
          primary={{ label: "+ Cadastrar atleta", onClick: () => setCreating("athlete") }}
          secondary={{ label: "+ Cadastrar dupla", onClick: () => setCreating("team") }}
        >
          Cadastre antes do jogo para começar a partida mais rápido na beira da quadra. Também dá para cadastrar na hora, em “+ Nova partida”.
        </EmptyState>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Atletas</h2>
              <button type="button" onClick={() => setCreating("athlete")} className={primaryButton}>
                + Cadastrar atleta
              </button>
            </div>
            {roster.canonical.length > 1 && (
              <p className="text-sm text-zinc-400">
                Mesma pessoa cadastrada duas vezes? Marque os cadastros e toque em “Unir” para juntar o histórico. Os lances registrados não são alterados.
              </p>
            )}
            <input className={inputClass} placeholder="Buscar atleta" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar atleta" />
            {(missingGender > 0 || onlyMissing) && (
              <button
                type="button"
                aria-pressed={onlyMissing}
                onClick={() => setOnlyMissing(!onlyMissing)}
                className={`min-h-12 rounded-xl px-4 text-left text-sm ${onlyMissing ? "bg-amber-400 font-semibold text-zinc-950" : "bg-amber-400/10 text-amber-200"}`}
              >
                {onlyMissing
                  ? "Mostrando só quem está sem gênero · toque para ver todas"
                  : `${plural(missingGender, "atleta sem gênero", "atletas sem gênero")} (necessário para os rankings M/F) · toque para filtrar`}
              </button>
            )}

            {selected.length >= 2 && (
              <div className="sticky top-20 z-10 flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-zinc-950 p-3">
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
              {athletes.length === 0 && roster.canonical.length > 0 && (
                <li className="flex flex-wrap items-center gap-2 text-zinc-400">
                  Nenhuma atleta com essa busca.
                  <button type="button" onClick={() => setCreating("athlete")} className={secondaryButton}>
                    + Cadastrar “{query.trim() || "nova atleta"}”
                  </button>
                </li>
              )}
              {roster.canonical.length === 0 && (
                <li>
                  <EmptyState icon="🧍" title="Nenhuma atleta cadastrada." primary={{ label: "+ Cadastrar atleta", onClick: () => setCreating("athlete") }} />
                </li>
              )}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Duplas e times</h2>
              <button type="button" onClick={() => setCreating("team")} className={primaryButton}>
                + Cadastrar dupla
              </button>
            </div>
            {roster.teams.length === 0 ? (
              <EmptyState icon="🤝" title="Nenhuma dupla ainda." primary={{ label: "+ Cadastrar dupla", onClick: () => setCreating("team") }}>
                Monte a dupla com atletas do cadastro (ou cadastre as atletas na hora).
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {roster.teams.map((t) => (
                  <TeamRow key={t.id} team={t} roster={roster} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {creating === "athlete" && <NewAthleteSheet athletes={roster.canonical} onClose={() => setCreating(null)} />}
      {creating === "team" && <NewTeamSheet roster={roster} onClose={() => setCreating(null)} />}
    </div>
  );
}
