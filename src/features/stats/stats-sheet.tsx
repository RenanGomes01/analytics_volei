"use client";

import { useEffect, useRef, useState } from "react";
import type { ModalityRules } from "@/domain/rules/modality";
import type { StatsFilter } from "@/domain/stats/types";
import type { Athlete, Match, RallyEvent, TeamSide } from "@/domain/types";
import { ExportButton } from "@/features/export/export-button";
import { SyncBadge } from "@/features/sync/sync-badge";
import { AthleteTable } from "./athlete-table";
import { SetFilter } from "./set-filter";
import { TeamSummary } from "./team-summary";
import { useBoxScore } from "./use-box-score";

interface Props {
  match: Match;
  rules: ModalityRules;
  events: readonly RallyEvent[];
  athletes: Map<string, Athlete>;
  sides: [TeamSide, TeamSide];
  onClose: () => void;
}

const ALL: StatsFilter = { set: "all" };

/** Box Score em tela cheia sobre o scout. Só aqui dentro pode haver rolagem. */
export function StatsSheet({ match, rules, events, athletes, sides, onClose }: Props) {
  const [filter, setFilter] = useState<StatsFilter>(ALL);
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = useBoxScore(events, match, rules, filter);

  // Um Desfazer pode remover o set escolhido: volta para o jogo inteiro (ajuste de estado no render).
  if (filter.set !== "all" && !box.sets_available.includes(filter.set)) setFilter(ALL);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const roster = (t: TeamSide) => (t === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-zinc-100"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <h2 id="stats-title" className="text-xl font-bold">
          Estatísticas
        </h2>
        <span className="mr-auto">
          <SyncBadge />
        </span>
        <SetFilter sets={box.sets_available} value={filter} onChange={setFilter} />
        <ExportButton matchId={match.id} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar estatísticas"
          className="min-h-12 min-w-12 rounded-xl bg-zinc-800 text-2xl"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((t) => (
            <TeamSummary key={t} name={teamName(t)} stats={box.teams[t]} />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-6 overflow-x-auto">
          {sides.map((t) => (
            <AthleteTable
              key={t}
              side={t}
              teamName={teamName(t)}
              athleteIds={roster(t)}
              athletes={athletes}
              stats={box.athletes}
              team={box.teams[t]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
