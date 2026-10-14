import { athleteColumns, tableColumns, type PlayerLine } from "@/domain/stats/stat-columns";
import type { AthleteStats, TeamStats } from "@/domain/stats/types";
import type { Athlete, Modality, TeamSide } from "@/domain/types";
import { StatTable, type StatRow } from "./stat-table";

interface Props {
  modality: Modality;
  side: TeamSide;
  teamName: string;
  athleteIds: string[];
  athletes: Map<string, Athlete>;
  stats: Record<string, AthleteStats>;
  team: TeamStats;
  /** Mostra a % de passe só quando há recepções avaliadas (o modo rápido não avalia o passe). */
  showReception: boolean;
}

/** Box Score por atleta da partida: colunas do dicionário (stat-columns.ts), total da equipe no fim. */
export function AthleteTable({ modality, side, teamName, athleteIds, athletes, stats, team, showReception }: Props) {
  // Elenco na ordem do cadastro; depois, quem tem lances mas não está no elenco.
  const outsiders = Object.values(stats).filter((s) => s.team === side && !athleteIds.includes(s.athlete_id));
  const lines = [...athleteIds.flatMap((id) => (stats[id] ? [stats[id]] : [])), ...outsiders];
  const rows: StatRow<PlayerLine>[] = lines.map((s) => {
    const a = athletes.get(s.athlete_id);
    return {
      key: s.athlete_id,
      line: s,
      label: (
        <>
          <span className="mr-2 inline-block w-6 text-right font-bold">{a?.jersey_number ?? "–"}</span>
          {a?.name ?? s.athlete_id.slice(0, 6)}
        </>
      ),
    };
  });
  // Mesmas fontes das linhas dos atletas, para a coluna sempre fechar com a soma.
  const total: StatRow<PlayerLine> = { key: "total", label: "Total", line: { ...team, points: team.attack.kills + team.serve.aces + team.blocks } };

  return (
    <StatTable
      caption={teamName}
      firstHeader="Atleta"
      columns={tableColumns(athleteColumns({ modality, showReception }))}
      rows={rows}
      total={total}
      minWidth={900}
    />
  );
}
