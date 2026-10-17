"use client";

import { useVisibleLiveQuery } from "@/lib/use-visible-live-query";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { athleteNameResolver, matchSearchText } from "@/domain/roster/match-search";
import { PHASE_LABEL } from "@/domain/roster/types";
import { ExportButton } from "@/features/export/export-button";
import { useRosterData } from "@/features/roster/use-roster-data";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listDeletedMatches, listMatches, restoreMatch } from "@/services/match-service";
import type { Match } from "@/domain/types";
import { toast } from "@/features/toast/toast";
import { EditMatchSheet } from "./edit-match-sheet";
import { MatchSearchInput, NoMatchFound } from "./match-search-input";
import { TeamNames } from "./team-names";
import { useMatchSearch } from "./use-match-search";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function MatchList() {
  const matches = useVisibleLiveQuery(() => listMatches(getDB(), LOCAL_TENANT_ID), []);
  const deleted = useVisibleLiveQuery(() => listDeletedMatches(getDB(), LOCAL_TENANT_ID), []);
  const roster = useRosterData();
  const [editing, setEditing] = useState<Match | null>(null);
  const nameOf = roster ? athleteNameResolver(roster.athleteById, roster.aliases) : () => undefined;
  const textOf = useCallback(
    (m: Match) => matchSearchText(m, roster ? athleteNameResolver(roster.athleteById, roster.aliases) : () => undefined),
    [roster],
  );
  const search = useMatchSearch(matches, textOf);

  if (!matches) return null;
  if (matches.length === 0) {
    return (
      <>
        <EmptyState
          title="Nenhuma partida ainda."
          primary={{ label: "+ Nova partida", href: "/new" }}
          secondary={{ label: "Cadastrar atletas", href: "/roster" }}
        >
          Comece um jogo agora (dá para cadastrar as atletas na hora) ou prepare o cadastro antes.
        </EmptyState>
        <Trash matches={deleted ?? []} />
      </>
    );
  }

  // "Torneio · Semifinal"; sem torneio é amistoso.
  const phaseOf = new Map((roster?.entries ?? []).map((e) => [e.match_id, e.phase]));
  const competitionLabel = (id: string) => {
    const tournament = roster?.tournamentOfMatch.get(id);
    if (!tournament) return roster ? "Amistoso" : "";
    const phase = phaseOf.get(id);
    return phase ? `${tournament.name} · ${PHASE_LABEL[phase]}` : tournament.name;
  };

  return (
    <>
      <MatchSearchInput query={search.query} onChange={search.setQuery} shown={search.results.length} total={search.total} />
      {search.searching && search.results.length === 0 && <NoMatchFound query={search.query} onClear={() => search.setQuery("")} />}
      <ul className="flex flex-col gap-2">
        {search.results.map((m) => (
          // Stretched link: o link do scout cobre o cartão (after:inset-0) e os nomes ficam por cima (z-10).
          <li key={m.id} className="relative flex items-center gap-2 rounded-2xl bg-zinc-900 pr-2 has-[a.card-link:active]:bg-zinc-800">
            <div className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-4 px-4">
              {/* Uma dupla por linha: nomes longos ("Vinícius - RO") não somem no "…". */}
              <span className="flex min-w-0 flex-col py-1 text-lg font-semibold leading-snug">
                {roster ? (
                  <>
                    <TeamNames side={m.team_a} nameOf={nameOf} aliases={roster.aliases} />
                    <span className="flex min-w-0 gap-1.5">
                      <span className="shrink-0 text-zinc-500">×</span>
                      <TeamNames side={m.team_b} nameOf={nameOf} aliases={roster.aliases} />
                    </span>
                  </>
                ) : (
                  <span className="truncate">
                    {m.team_a.name} × {m.team_b.name}
                  </span>
                )}
              </span>
              <HardLink
                href={`/match?id=${encodeURIComponent(m.id)}`}
                aria-label={`Abrir ${m.team_a.name} × ${m.team_b.name}`}
                className="card-link shrink-0 text-right text-sm text-zinc-400 after:absolute after:inset-0 after:rounded-2xl"
              >
                {m.modality === "beach" ? "Beach" : "Indoor"} · {dateFormat.format(m.created_at)}
                <span className="block text-xs text-zinc-500">{competitionLabel(m.id)}</span>
              </HardLink>
            </div>
            <span className="relative z-10 flex items-center gap-2">
              <ExportButton matchId={m.id} compact />
              {roster && (
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  aria-label={`Editar ou excluir ${m.team_a.name} × ${m.team_b.name}`}
                  title="Editar torneio, fase ou excluir"
                  className="min-h-12 min-w-12 rounded-xl bg-zinc-800 px-3 text-xl font-bold"
                >
                  ⋯
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Trash matches={deleted ?? []} />
      {editing && roster && <EditMatchSheet match={editing} roster={roster} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Lixeira: partidas excluídas (com os lances guardados), com "Restaurar". */
function Trash({ matches }: { matches: Match[] }) {
  if (matches.length === 0) return null;
  return (
    <details className="mt-2 rounded-2xl bg-zinc-900/60 p-3">
      <summary className="min-h-12 cursor-pointer content-center text-zinc-400">
        🗑 Lixeira ({matches.length} {matches.length === 1 ? "partida" : "partidas"})
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">
              {m.team_a.name} × {m.team_b.name}
              <span className="block text-xs text-zinc-500">
                {dateFormat.format(m.created_at)} · excluída em {dateFormat.format(m.deleted_at!)}
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                restoreMatch(getDB(), LOCAL_TENANT_ID, m.id).then(
                  () => toast.success("Partida restaurada."),
                  (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
                )
              }
              className="min-h-12 rounded-xl bg-zinc-800 px-4 font-semibold"
            >
              Restaurar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
