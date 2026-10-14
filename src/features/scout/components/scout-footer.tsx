import type { Athlete, Match, RallyEvent, TeamSide } from "@/domain/types";
import { SKILL_LABEL } from "../labels";

interface Props {
  match: Match;
  sides: [TeamSide, TeamSide];
  lastActive: Exclude<RallyEvent, { kind: "void" }> | null;
  athletes: Map<string, Athlete>;
  saving: boolean;
  canScore: boolean;
  onUndo: () => void;
  onPoint: (team: TeamSide) => void;
  onSwapSides: () => void;
  onOpenStats: () => void;
  onQuickMode: () => void;
}

function describe(event: Props["lastActive"], athletes: Map<string, Athlete>, match: Match): string {
  if (!event) return "";
  if (event.kind === "rally_end") return `Ponto ${event.point_to === "A" ? match.team_a.name : match.team_b.name}`;
  if (event.kind === "set_start") return `Saque inicial ${event.serving_team === "A" ? match.team_a.name : match.team_b.name}`;
  if (event.kind === "match_end") return "Fim da partida (reabrir)";
  const number = athletes.get(event.athlete_id)?.jersey_number ?? "";
  return `${SKILL_LABEL[event.skill]} ${event.team}${number} ${event.quality}`;
}

export function ScoutFooter({
  match,
  sides,
  lastActive,
  athletes,
  saving,
  canScore,
  onUndo,
  onPoint,
  onSwapSides,
  onOpenStats,
  onQuickMode,
}: Props) {
  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const button = "min-h-16 rounded-2xl px-4 text-lg font-semibold active:scale-[0.98] disabled:opacity-30";

  return (
    <footer className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_auto_auto_auto] gap-2 border-t border-zinc-800 p-2">
      <button
        type="button"
        onClick={onUndo}
        disabled={!lastActive || saving}
        className={`${button} flex min-w-0 items-center gap-2 bg-zinc-100 text-zinc-950`}
      >
        <span aria-hidden className="text-2xl">↶</span>
        <span className="truncate">
          Desfazer{lastActive && <span className="font-normal">: {describe(lastActive, athletes, match)}</span>}
        </span>
      </button>
      {sides.map((team) => (
        <button
          key={team}
          type="button"
          onClick={() => onPoint(team)}
          disabled={!canScore || saving}
          className={`${button} truncate border-2 border-zinc-700 bg-zinc-900`}
          title="Falta sem lance registrado: rede, invasão, decisão da arbitragem"
        >
          Ponto {teamName(team)}
        </button>
      ))}
      <button type="button" onClick={onQuickMode} className={`${button} bg-zinc-800`}>
        ⇄ Rápido
      </button>
      <button type="button" onClick={onOpenStats} className={`${button} bg-zinc-800`}>
        Estatísticas
      </button>
      <button type="button" onClick={onSwapSides} className={`${button} min-w-16 bg-zinc-800`} aria-label="Inverter lados">
        ⇄
      </button>
    </footer>
  );
}
