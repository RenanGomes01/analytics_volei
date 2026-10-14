import type { MatchState } from "@/domain/rally/replay";
import type { Match } from "@/domain/types";
import { END_REASON_LABEL } from "./finish-match-sheet";

export function MatchOver({ match, state }: { match: Match; state: MatchState }) {
  if (!state.winner) return null;
  const winner = state.winner === "A" ? match.team_a.name : match.team_b.name;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-400/10 p-4 text-center">
      <p className="text-sm uppercase tracking-wide text-amber-300">
        {state.end ? `Encerrada · ${END_REASON_LABEL[state.end.reason]}` : "Fim de jogo"}
      </p>
      <p className="text-3xl font-black">{winner}</p>
      <p className="text-xl tabular-nums">
        {state.sets_won.A} × {state.sets_won.B}
      </p>
      <p className="text-sm tabular-nums text-zinc-400">
        {state.sets.map((s) => `${s.score.A}-${s.score.B}${s.interrupted ? "*" : ""}`).join("  ·  ")}
      </p>
      {state.sets.some((s) => s.interrupted) && <p className="text-xs text-zinc-400">* set interrompido</p>}
      {state.end?.note && <p className="text-sm text-zinc-300">“{state.end.note}”</p>}
      <p className="text-xs text-zinc-500">{state.end ? "Use Desfazer para reabrir a partida." : "Use Desfazer para corrigir o último lance."}</p>
    </div>
  );
}
