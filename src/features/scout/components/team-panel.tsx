import type { Athlete, TeamSide } from "@/domain/types";
import { AthleteButton, type Emphasis } from "./athlete-button";

interface Props {
  team: TeamSide;
  name: string;
  athleteIds: string[];
  athletes: Map<string, Athlete>;
  emphasis: Emphasis;
  serving: boolean;
  selectedAthleteId: string | null;
  onPick: (team: TeamSide, athleteId: string) => void;
}

export function TeamPanel({ team, name, athleteIds, athletes, emphasis, serving, selectedAthleteId, onPick }: Props) {
  // Beach (2): botões empilhados ocupando o painel. Indoor: grade de 2 ou 3 colunas.
  const layout =
    athleteIds.length <= 2
      ? "flex flex-col portrait:flex-row"
      : `grid auto-rows-fr ${athleteIds.length > 8 ? "grid-cols-3" : "grid-cols-2"} portrait:grid-cols-6`;

  return (
    <section
      aria-label={`Time ${team}`}
      className={`flex min-h-0 flex-col gap-2 rounded-3xl border-2 p-2 ${
        emphasis === "primary" ? "border-amber-400 bg-amber-400/5" : "border-zinc-800"
      }`}
    >
      <header className="flex items-center justify-between px-2 text-sm font-semibold uppercase tracking-wide">
        <span className="truncate">{name}</span>
        {serving && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-zinc-950">saque</span>}
      </header>
      <div className={`min-h-0 flex-1 gap-2 ${layout}`}>
        {athleteIds.map((id) => (
          <AthleteButton
            key={id}
            athleteId={id}
            athlete={athletes.get(id)}
            emphasis={emphasis}
            selected={selectedAthleteId === id}
            onPick={() => onPick(team, id)}
          />
        ))}
      </div>
    </section>
  );
}
