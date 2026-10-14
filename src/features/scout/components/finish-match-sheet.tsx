"use client";

import { useState } from "react";
import type { MatchState } from "@/domain/rally/replay";
import type { Match, MatchEndReason, TeamSide } from "@/domain/types";
import type { FinishMatchInput } from "@/services/rally-ledger-service";

interface Props {
  match: Match;
  state: MatchState;
  saving: boolean;
  onConfirm: (input: FinishMatchInput) => void;
  onCancel: () => void;
}

export const END_REASON_LABEL: Record<MatchEndReason, string> = {
  score: "Pelo placar atual",
  retirement: "Desistência / lesão",
  walkover: "W.O.",
  weather: "Chuva / condições",
  other: "Outro motivo",
};

/** Quem lidera: mais sets; empatado em sets, mais pontos no set atual. null = empate total. */
export function leaderOf(state: MatchState): TeamSide | null {
  if (state.sets_won.A !== state.sets_won.B) return state.sets_won.A > state.sets_won.B ? "A" : "B";
  const { A, B } = state.sets[state.sets.length - 1].score;
  return A === B ? null : A > B ? "A" : "B";
}

const big = "min-h-16 rounded-2xl px-4 text-lg font-bold active:scale-[0.98] disabled:opacity-40";

/** Encerramento manual: lesão, chuva, W.O., set único (ex.: set de 25)… O Desfazer reabre a partida. */
export function FinishMatchSheet({ match, state, saving, onConfirm, onCancel }: Props) {
  const leader = leaderOf(state);
  const [reason, setReason] = useState<MatchEndReason>("score");
  const [winner, setWinner] = useState<TeamSide | null>(leader);
  const [note, setNote] = useState("");
  const name = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const score = state.sets.map((s) => `${s.score.A}×${s.score.B}`).join(" · ");
  const pick = (r: MatchEndReason) => {
    setReason(r);
    if (r === "score") setWinner(leader);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Finalizar partida" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-4">
        <h2 className="text-center text-2xl font-bold">Finalizar partida</h2>
        <p className="text-center text-sm tabular-nums text-zinc-400">
          Placar: {score} (sets {state.sets_won.A} × {state.sets_won.B})
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Motivo">
          {(Object.keys(END_REASON_LABEL) as MatchEndReason[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => pick(r)}
              className={`min-h-14 rounded-2xl px-3 font-semibold ${reason === r ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-200"}`}
            >
              {END_REASON_LABEL[r]}
            </button>
          ))}
        </div>

        <p className="text-sm text-zinc-300">
          {reason === "score"
            ? leader
              ? `Vence quem está na frente: ${name(leader)}. Toque na outra dupla para mudar.`
              : "Placar empatado: escolha quem venceu."
            : reason === "walkover"
              ? "Quem venceu por W.O.?"
              : reason === "retirement"
                ? "Quem venceu (a dupla que NÃO desistiu)?"
                : "Quem ficou com a vitória?"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={winner === t}
              onClick={() => setWinner(t)}
              className={`${big} ${winner === t ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-950"}`}
            >
              {name(t)}
            </button>
          ))}
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 120))}
          placeholder="Observação (opcional): ex.: lesão no tornozelo, set único de 25"
          aria-label="Observação"
          className="min-h-12 rounded-xl border-2 border-zinc-700 bg-zinc-950 px-3 text-base text-zinc-100 outline-none focus:border-amber-400"
        />

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-14 flex-1 rounded-2xl bg-zinc-800 font-semibold">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!winner || saving}
            onClick={() => winner && onConfirm({ winner, reason, note })}
            className={`${big} flex-1 bg-red-700 text-white`}
          >
            Finalizar{winner ? `: vitória ${name(winner)}` : ""}
          </button>
        </div>
        <p className="text-center text-xs text-zinc-500">O rali em andamento não conta. Dá para reabrir com Desfazer.</p>
      </div>
    </div>
  );
}
