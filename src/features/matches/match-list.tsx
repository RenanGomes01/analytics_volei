"use client";

import { useVisibleLiveQuery } from "@/lib/use-visible-live-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { PHASE_LABEL } from "@/domain/roster/types";
import { ExportButton } from "@/features/export/export-button";
import { useRosterData } from "@/features/roster/use-roster-data";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listDeletedMatches, listMatches, restoreMatch } from "@/services/match-service";
import type { Match } from "@/domain/types";
import { toast } from "@/features/toast/toast";
import { EditMatchSheet } from "./edit-match-sheet";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function MatchList() {
  const matches = useVisibleLiveQuery(() => listMatches(getDB(), LOCAL_TENANT_ID), []);
  const deleted = useVisibleLiveQuery(() => listDeletedMatches(getDB(), LOCAL_TENANT_ID), []);
  const roster = useRosterData();
  const [editing, setEditing] = useState<Match | null>(null);

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
      <ul className="flex flex-col gap-2">
        {matches.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-2xl bg-zinc-900 pr-2">
            <HardLink
              href={`/match?id=${encodeURIComponent(m.id)}`}
              className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl px-4 active:bg-zinc-800"
            >
              <span className="truncate text-lg font-semibold">
                {m.team_a.name} × {m.team_b.name}
              </span>
              <span className="shrink-0 text-right text-sm text-zinc-400">
                {m.modality === "beach" ? "Beach" : "Indoor"} · {dateFormat.format(m.created_at)}
                <span className="block text-xs text-zinc-500">{competitionLabel(m.id)}</span>
              </span>
            </HardLink>
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
