import type { AthleteStats, TeamStats } from "@/domain/stats/types";
import type { Athlete, Modality, TeamSide } from "@/domain/types";
import { pct } from "./format";

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

type Line = Pick<AthleteStats, "attack" | "serve" | "reception" | "blocks" | "digs"> & { points: number };

type Column = { label: string; title: string; value: (s: Line) => string | number };

/** "PA/TA" da bola de segunda; "–" sem nenhuma. */
const secondBall = (s: Line) => (s.attack.second_ball.attempts ? `${s.attack.second_ball.kills}/${s.attack.second_ball.attempts}` : "–");

const columns = (modality: Modality, showReception: boolean): Column[] => [
  { label: "Pts", title: "Pontos (ataques + aces + bloqueios)", value: (s) => s.points },
  { label: "PA", title: "Pontos de ataque (ataques #)", value: (s) => s.attack.kills },
  { label: "E", title: "Erros de ataque (= ou bloqueado)", value: (s) => s.attack.errors },
  { label: "TA", title: "Total de ataques", value: (s) => s.attack.attempts },
  { label: "Efic.", title: "Eficiência de ataque: (PA − E) / TA", value: (s) => pct(s.attack.efficiency) },
  { label: "2ª", title: "Bola de segunda: pontos / tentativas (ataque no 2º toque)", value: secondBall },
  { label: "Ace", title: "Aces", value: (s) => s.serve.aces },
  { label: "ES-R", title: "Erros de saque na rede", value: (s) => s.serve.errors_net },
  { label: "ES-F", title: "Erros de saque pra fora", value: (s) => s.serve.errors_out },
  { label: "ES", title: "Erros de saque (total, inclusive sem detalhe)", value: (s) => s.serve.errors },
  { label: "Sq", title: "Total de saques", value: (s) => s.serve.attempts },
  { label: "Rec", title: "Total de recepções", value: (s) => s.reception.attempts },
  ...(showReception
    ? [
        modality === "beach"
          ? { label: "Na mão", title: "Passes na mão (#)", value: (s: Line) => pct(s.reception.positive) }
          : { label: "#+", title: "Recepções perfeitas ou positivas", value: (s: Line) => pct(s.reception.positive) },
      ]
    : []),
  { label: "Blq", title: "Pontos de bloqueio", value: (s) => s.blocks },
  { label: "Def", title: "Defesas", value: (s) => s.digs },
];

export function AthleteTable({ modality, side, teamName, athleteIds, athletes, stats, team, showReception }: Props) {
  const tableColumns = columns(modality, showReception);
  // Elenco na ordem do cadastro; depois, quem tem lances mas não está no elenco.
  const outsiders = Object.values(stats).filter((s) => s.team === side && !athleteIds.includes(s.athlete_id));
  const rows = [...athleteIds.flatMap((id) => (stats[id] ? [stats[id]] : [])), ...outsiders];
  // Mesmas fontes das linhas dos atletas, para a coluna sempre fechar com a soma.
  const totals: Line = { ...team, points: team.attack.kills + team.serve.aces + team.blocks };

  return (
    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-right tabular-nums">
      <caption className="pb-2 text-left text-sm font-semibold uppercase tracking-wide text-zinc-400">{teamName}</caption>
      <thead>
        <tr className="text-xs uppercase text-zinc-400">
          <th scope="col" className="sticky left-0 bg-zinc-950 py-2 pr-3 text-left">
            Atleta
          </th>
          {tableColumns.map((c) => (
            <th key={c.label} scope="col" title={c.title} className="px-2 py-2">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const a = athletes.get(s.athlete_id);
          return (
            <tr key={s.athlete_id} className="odd:bg-zinc-900/60">
              <th scope="row" className="sticky left-0 bg-inherit py-2.5 pr-3 text-left font-medium">
                <span className="mr-2 inline-block w-6 text-right font-bold">{a?.jersey_number ?? "–"}</span>
                {a?.name ?? s.athlete_id.slice(0, 6)}
              </th>
              {tableColumns.map((c) => (
                <td key={c.label} className="px-2 py-2.5">
                  {c.value(s)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <th scope="row" className="sticky left-0 border-t border-zinc-700 bg-zinc-950 py-2.5 pr-3 text-left">
            Total
          </th>
          {tableColumns.map((c) => (
            <td key={c.label} className="border-t border-zinc-700 px-2 py-2.5">
              {c.value(totals)}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}
