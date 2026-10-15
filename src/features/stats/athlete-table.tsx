import { factsIn } from "@/domain/stats/drill";
import type { TouchFact } from "@/domain/stats/facts";
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
  /** Lances da partida no recorte (drill-down das células). */
  facts?: readonly TouchFact[];
  /** Inclui as micro-métricas. */
  detailed?: boolean;
}

/** Box Score por atleta da partida: colunas do dicionário (stat-columns.ts), total da equipe no fim. */
export function AthleteTable({ modality, side, teamName, athleteIds, athletes, stats, team, showReception, facts, detailed = false }: Props) {
  // Elenco na ordem do cadastro; depois, quem tem lances mas não está no elenco.
  const outsiders = Object.values(stats).filter((s) => s.team === side && !athleteIds.includes(s.athlete_id));
  const lines = [...athleteIds.flatMap((id) => (stats[id] ? [stats[id]] : [])), ...outsiders];
  const rows: StatRow<PlayerLine>[] = lines.map((s) => {
    const a = athletes.get(s.athlete_id);
    return {
      key: s.athlete_id,
      name: a?.name ?? s.athlete_id.slice(0, 6),
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
  const total: StatRow<PlayerLine> = { key: "total", name: teamName, label: "Total", line: { ...team, points: team.attack.kills + team.serve.aces + team.blocks } };
  const athleteName = (id: string) => athletes.get(id)?.name ?? id.slice(0, 6);

  return (
    <StatTable
      caption={teamName}
      firstHeader="Atleta"
      columns={tableColumns(athleteColumns({ modality, showReception }), { detailed })}
      rows={rows}
      total={total}
      minWidth={detailed ? 2200 : 900}
      drill={
        facts
          ? (row) => ({
              facts: row.key === "total" ? facts.filter((f) => f.team === side) : factsIn(facts, { athlete_id: row.key }),
              athleteLabel: athleteName,
              dimensions: row.key === "total" ? ["type", "outcome", "set", "moment", "phase", "touch", "athlete"] : undefined,
            })
          : undefined
      }
    />
  );
}
