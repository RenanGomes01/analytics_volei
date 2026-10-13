"use client";

import type { NextAction } from "@/domain/rally/next-action";
import { inferSkills } from "@/domain/rally/quick-rally";
import type { MatchState } from "@/domain/rally/replay";
import type { Athlete, Match, TeamSide } from "@/domain/types";
import type { MatchScope } from "@/services/rally-ledger-service";
import { SKILL_LABEL } from "../labels";
import { MatchOver } from "../components/match-over";
import { ServeChooser } from "../components/serve-chooser";
import { useQuickRally } from "./use-quick-rally";

interface Props {
  scope: MatchScope;
  match: Match;
  state: MatchState;
  next: NextAction;
  athletes: Map<string, Athlete>;
  sides: [TeamSide, TeamSide];
  onDetailedMode: () => void;
  onOpenStats: () => void;
  onSwapSides: () => void;
}

const big = "rounded-2xl font-bold active:scale-[0.98] disabled:opacity-30";

/**
 * Modo rápido: durante o rali só se toca em quem tocou na bola; no fim, "Ponto" + como foi.
 * Os fundamentos são deduzidos pela sequência (ver domain/rally/quick-rally.ts).
 */
export function QuickBoard({ scope, match, state, next, athletes, sides, onDetailedMode, onOpenStats, onSwapSides }: Props) {
  const quick = useQuickRally(scope, state, next);
  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const touches = inferSkills(quick.taps);
  const lastId = quick.taps.at(-1)?.athlete_id;
  const over = !!state.winner;
  const waitingServe = quick.taps.length === 0;

  const column = (team: TeamSide) => {
    const ids = team === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids;
    const servingBlocked = waitingServe && team !== state.serving_team && !quick.suggestedServer;
    return (
      <section key={team} aria-label={`Time ${team}`} className="flex min-h-0 flex-col gap-2">
        <header className="flex items-center justify-between px-1 text-sm font-semibold uppercase tracking-wide">
          <span className="truncate">{teamName(team)}</span>
          {state.serving_team === team && !over && <span className="rounded-full bg-amber-400 px-2 text-xs text-zinc-950">saque</span>}
        </header>
        <div className={`grid min-h-0 flex-1 gap-2 ${ids.length > 2 ? "grid-cols-2 auto-rows-fr" : "grid-rows-2"}`}>
          {ids.map((id) => {
            const a = athletes.get(id);
            const isServer = id === quick.suggestedServer;
            const isLast = id === lastId;
            return (
              <button
                key={id}
                type="button"
                disabled={over || quick.saving || servingBlocked}
                onClick={() => quick.tapAthlete(team, id)}
                className={`${big} flex min-h-20 items-center gap-3 border-2 px-4 text-left ${
                  isLast
                    ? "border-amber-300 bg-amber-400 text-zinc-950"
                    : isServer
                      ? "border-amber-400 bg-zinc-800 text-zinc-50"
                      : "border-zinc-700 bg-zinc-900 text-zinc-100"
                }`}
              >
                <span className="text-4xl tabular-nums">{a?.jersey_number ?? "–"}</span>
                <span className="truncate text-xl font-semibold">{a?.name ?? id.slice(0, 6)}</span>
                {isServer && <span className="ml-auto text-xs font-semibold uppercase text-amber-300">saca</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={over || quick.saving}
          onClick={() => quick.openPoint(team)}
          className={`${big} min-h-20 bg-emerald-600 text-2xl text-white`}
        >
          PONTO {teamName(team)}
        </button>
      </section>
    );
  };

  return (
    <>
      <main className="grid min-h-0 grid-cols-[1fr_1.2fr_1fr] gap-2 p-2 portrait:grid-cols-1 portrait:grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {column(sides[0])}
        <section aria-label="Rali" className="flex min-h-0 flex-col gap-2">
          {over ? (
            <MatchOver match={match} state={state} />
          ) : (
            <>
              {waitingServe && <ServeChooser scope={scope} match={match} state={state} sides={sides} />}
              <p className="text-center text-lg font-semibold">
                {waitingServe
                  ? quick.suggestedServer
                    ? "Toque em quem recebeu (o saque entra junto)"
                    : `Toque em quem sacou (${teamName(state.serving_team)})`
                  : "Toque em quem tocou na bola…"}
              </p>
              <ol aria-label="Toques do rali" className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-hidden rounded-2xl bg-zinc-900 p-3">
                {touches.map((t, i) => (
                  <li key={i} className={`rounded-lg px-2 py-1 text-sm ${t.team === sides[0] ? "bg-sky-900/70" : "bg-fuchsia-900/60"}`}>
                    <span className="font-semibold">{SKILL_LABEL[t.skill]}</span> {athletes.get(t.athlete_id)?.name ?? ""}
                  </li>
                ))}
                {touches.length === 0 && <li className="text-sm text-zinc-500">Os toques aparecem aqui.</li>}
              </ol>
              <button
                type="button"
                onClick={quick.toggleBlockNext}
                aria-pressed={quick.blockNext}
                className={`min-h-14 rounded-2xl border-2 font-semibold ${quick.blockNext ? "border-amber-300 bg-amber-400 text-zinc-950" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}
              >
                {quick.blockNext ? "Próximo toque = BLOQUEIO" : "Marcar próximo toque como bloqueio"}
              </button>
            </>
          )}
        </section>
        {column(sides[1])}
      </main>

      <footer className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_auto] gap-2 border-t border-zinc-800 p-2">
        <button type="button" onClick={quick.undo} disabled={quick.saving} className={`${big} min-h-16 truncate bg-zinc-100 px-4 text-lg text-zinc-950`}>
          ↶ {quick.taps.length > 0 || quick.blockNext ? "Desfazer toque" : "Desfazer último ponto"}
        </button>
        <button type="button" onClick={onDetailedMode} className={`${big} min-h-16 bg-zinc-800 px-4 text-base`}>
          ⇄ Detalhado
        </button>
        <button type="button" onClick={onOpenStats} className={`${big} min-h-16 bg-zinc-800 px-4 text-base`}>
          Estatísticas
        </button>
        <button type="button" onClick={onSwapSides} aria-label="Inverter lados" className={`${big} min-h-16 min-w-16 bg-zinc-800`}>
          ⇄
        </button>
      </footer>

      {quick.pending && (
        <div role="dialog" aria-modal="true" aria-label="Como foi o ponto" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-3xl bg-zinc-900 p-4">
            <h2 className="text-center text-2xl font-bold">
              Ponto {teamName(quick.pending.winner)} — como foi?
            </h2>
            {quick.pending.options.map((o, i) => (
              <button
                key={o.id}
                type="button"
                disabled={quick.saving}
                onClick={() => quick.choose(o.id)}
                className={`${big} min-h-20 px-4 text-xl ${i === 0 ? "bg-emerald-600 text-white" : o.id === "fault" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-200 text-zinc-950"}`}
              >
                {o.label}
              </button>
            ))}
            <button type="button" onClick={quick.cancelPoint} className="min-h-14 rounded-2xl text-zinc-300">
              Cancelar (o rali continua)
            </button>
          </div>
        </div>
      )}

      {quick.error && (
        <div role="alert" className="absolute inset-x-0 top-2 z-[60] mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl bg-red-700 px-4 py-3 text-white shadow-lg">
          <span>{quick.error}</span>
          <button type="button" onClick={quick.dismissError} className="min-h-10 rounded-lg bg-black/20 px-3 font-semibold">
            OK
          </button>
        </div>
      )}
    </>
  );
}
