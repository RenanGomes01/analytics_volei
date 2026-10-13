"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { ExportButton } from "@/features/export/export-button";
import { useRosterData } from "@/features/roster/use-roster-data";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { listMatches } from "@/services/match-service";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function MatchList() {
  const matches = useLiveQuery(() => listMatches(getDB(), LOCAL_TENANT_ID), []);
  const roster = useRosterData();

  if (!matches) return null;
  if (matches.length === 0) {
    return <p className="text-center text-zinc-400">Nenhuma partida neste aparelho ainda.</p>;
  }

  return (
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
              <span className="block text-xs text-zinc-500">{roster?.tournamentOfMatch.get(m.id)?.name ?? "Sem torneio"}</span>
            </span>
          </HardLink>
          <ExportButton matchId={m.id} compact />
        </li>
      ))}
    </ul>
  );
}
