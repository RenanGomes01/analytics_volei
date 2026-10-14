import type { MouseEvent } from "react";
import { HardLink } from "@/components/hard-link";
import type { NextAction } from "@/domain/rally/next-action";
import type { MatchState } from "@/domain/rally/replay";
import { decidingSetNumber, type ModalityRules } from "@/domain/rules/modality";
import type { Match, TeamSide } from "@/domain/types";
import { PHASE_LABEL } from "../labels";

interface Props {
  match: Match;
  state: MatchState;
  next: NextAction;
  rules: ModalityRules;
  sides: [TeamSide, TeamSide];
  /** Abre o encerramento manual (só com a partida em andamento). */
  onFinish?: () => void;
  /** "← Sair": pode impedir a saída (ex.: lances ainda na fila de gravação). */
  onExit?: (e: MouseEvent) => void;
}

/** Beach: troca de lado a cada 7 pontos somados (5 no set decisivo). */
function sideSwitchDue(state: MatchState, rules: ModalityRules): boolean {
  if (rules.modality !== "beach") return false;
  const { A, B } = state.sets.at(-1)!.score;
  const every = state.current_set === decidingSetNumber(rules) ? 5 : 7;
  return A + B > 0 && (A + B) % every === 0 && !state.open_rally;
}

interface TeamHeaderProps {
  match: Match;
  state: MatchState;
  team: TeamSide;
  align: "left" | "right";
}

function TeamHeader({ match, state, team, align }: TeamHeaderProps) {
  const serving = state.serving_team === team && !state.winner;
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        aria-label={serving ? "saque" : undefined}
        className={`size-3 shrink-0 rounded-full ${serving ? "bg-amber-400" : "bg-transparent"}`}
      />
      <span className="truncate text-lg font-semibold">{team === "A" ? match.team_a.name : match.team_b.name}</span>
      <span className="rounded-lg bg-zinc-800 px-2 text-lg font-bold tabular-nums" title="sets vencidos">
        {state.sets_won[team]}
      </span>
    </div>
  );
}

export function Scoreboard({ match, state, next, rules, sides, onFinish, onExit }: Props) {
  const score = state.sets.at(-1)!.score;

  return (
    <header className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-4 border-b border-zinc-800 px-4 py-2">
      {/* Saída do scout: tudo já está salvo no aparelho (inclusive o rali em andamento). */}
      <HardLink
        href="/"
        onClick={onExit}
        aria-label="Sair do scout e voltar às partidas (tudo fica salvo)"
        className="min-h-12 content-center rounded-xl bg-zinc-800 px-3 font-semibold text-zinc-300"
      >
        ← Sair
      </HardLink>
      <TeamHeader match={match} state={state} team={sides[0]} align="left" />
      <div className="flex flex-col items-center">
        <div className="text-5xl font-black tabular-nums leading-none">
          {score[sides[0]]}
          <span className="px-2 text-zinc-600">:</span>
          {score[sides[1]]}
        </div>
        <div className="mt-1 flex gap-2 text-xs uppercase tracking-wide text-zinc-400">
          <span>Set {state.current_set}</span>
          {next.phase && <span>· {PHASE_LABEL[next.phase]}</span>}
          {sideSwitchDue(state, rules) && <span className="font-bold text-amber-400">· trocar de lado</span>}
        </div>
        {onFinish && !state.winner && (
          <button type="button" onClick={onFinish} className="mt-1 min-h-10 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400 underline-offset-4 hover:underline">
            Finalizar partida
          </button>
        )}
      </div>
      <TeamHeader match={match} state={state} team={sides[1]} align="right" />
    </header>
  );
}
