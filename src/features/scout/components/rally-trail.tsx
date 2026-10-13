import type { NextAction } from "@/domain/rally/next-action";
import type { MatchState, RallyResult } from "@/domain/rally/replay";
import type { Athlete, Match, TeamSide } from "@/domain/types";
import { QUALITY_STYLE, REASON_LABEL, SKILL_LABEL } from "../labels";

interface Props {
  match: Match;
  state: MatchState;
  next: NextAction;
  athletes: Map<string, Athlete>;
}

const MAX_CHIPS = 6;

/** Motivo do ponto em PT-BR; "kill" distingue ataque de bloqueio pelo último lance. */
function reasonLabel(rally: RallyResult): string {
  if (rally.reason === "kill" && rally.touches.at(-1)?.skill === "block") return "bloqueio";
  return rally.reason ? REASON_LABEL[rally.reason] : "";
}

export function RallyTrail({ match, state, next, athletes }: Props) {
  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const open = state.open_rally;
  const last = state.rallies.at(-1);
  const shown = open ?? last;
  const rallyNumber = open?.rally_number ?? (last && last.set_number === state.current_set ? last.rally_number + 1 : 1);
  const touches = (open?.touches ?? []).slice(-MAX_CHIPS);

  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-2xl bg-zinc-900 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold uppercase tracking-wide text-zinc-400">Rali {rallyNumber}</span>
        {next.possession && (
          <span className="rounded-lg bg-zinc-800 px-2 py-0.5 font-bold tabular-nums">
            {next.possession.team}: {next.possession.touches}/{next.possession.max}
          </span>
        )}
      </div>
      <ol className="flex min-h-9 flex-wrap items-center gap-1.5 overflow-hidden">
        {touches.map((t) => (
          <li key={t.id} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-sm">
            <span className="font-semibold">{SKILL_LABEL[t.skill]}</span>
            <span className="text-zinc-400">
              {t.team}
              {athletes.get(t.athlete_id)?.jersey_number ?? ""}
            </span>
            <span className={`rounded px-1 font-bold ${QUALITY_STYLE[t.quality].className}`}>{t.quality}</span>
          </li>
        ))}
        {!open && shown?.point_to && (
          <li className="text-sm text-zinc-400">
            Último: ponto {teamName(shown.point_to)}
            {shown.reason && ` (${reasonLabel(shown)})`}
          </li>
        )}
      </ol>
    </div>
  );
}
