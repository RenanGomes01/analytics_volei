"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import type { MatchState } from "@/domain/rally/replay";
import type { Match, TeamSide } from "@/domain/types";
import { chooseServer, type MatchScope } from "@/services/rally-ledger-service";

interface Props {
  scope: MatchScope;
  match: Match;
  state: MatchState;
  sides: [TeamSide, TeamSide];
}

/** No 0×0 de cada set (sorteio): escolhe qual lado começa sacando. Some depois do primeiro ponto. */
export function ServeChooser({ scope, match, state, sides }: Props) {
  const [error, setError] = useState<string | null>(null);
  const current = state.sets.at(-1)!;
  if (state.winner || state.open_rally || current.score.A + current.score.B > 0) return null;

  const name = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-center text-xs uppercase tracking-wide text-zinc-400">Set {state.current_set} · quem começa sacando?</p>
      <div className="flex gap-2">
        {sides.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={state.serving_team === t}
            onClick={async () => {
              setError(null);
              try {
                await chooseServer(getDB(), scope, t);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            className={`min-h-12 flex-1 truncate rounded-xl px-3 font-semibold ${
              state.serving_team === t ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {name(t)}
          </button>
        ))}
      </div>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
