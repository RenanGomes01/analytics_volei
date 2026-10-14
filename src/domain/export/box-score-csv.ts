import type { AthleteStats, BoxScore, StatsFilter, TeamStats } from "../stats/types";
import type { Athlete, Match, TeamSide } from "../types";
import { athleteColumns, csvColumns } from "../stats/stat-columns";
import { NOTE_ROW, document, pct, row, statCell } from "./csv";
import { slug } from "./match-export";

/** Box Score de uma partida em CSV (formato Excel pt-BR, ver csv.ts). Sem assinatura: é relatório, não backup. */

export interface BoxScoreCsvInput {
  box: BoxScore;
  match: Match;
  athletes: ReadonlyMap<string, Athlete>;
  filter: StatsFilter;
  /** Fuso para a data da partida (os testes fixam "UTC"). */
  timeZone?: string;
}

export function boxScoreToCsv({ box, match, athletes, filter, timeZone }: BoxScoreCsvInput): string {
  const beach = match.modality === "beach";
  const receptionLabel = beach ? "Passe na mão (%)" : "Recepção #+ (%)";
  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone }).format(match.created_at);
  const filterLabel = filter.set === "all" ? "Jogo inteiro" : `Set ${filter.set}`;

  const teamRow = (t: TeamSide, s: TeamStats) => [
    teamName(t),
    s.points.total,
    s.points.kills,
    s.points.aces,
    s.points.blocks,
    s.points.opponent_errors,
    pct(s.side_out),
    pct(s.break_point),
    s.attack.attempts,
    s.attack.errors,
    pct(s.attack.efficiency),
    s.reception.attempts,
    pct(s.reception.positive),
    s.reception.errors,
    s.serve.attempts,
    s.serve.errors,
    s.serve.errors_net,
    s.serve.errors_out,
  ];

  const columns = csvColumns(athleteColumns({ modality: match.modality }));
  const athleteRow = (t: TeamSide, s: AthleteStats) => {
    const a = athletes.get(s.athlete_id);
    return [teamName(t), a?.jersey_number ?? null, a?.name ?? s.athlete_id.slice(0, 8), ...columns.map((c) => statCell(c, s))];
  };

  const lines: string[] = [
    row(["Partida", `${match.team_a.name} × ${match.team_b.name}`, "Modalidade", beach ? "Beach" : "Indoor", "Data", date, "Filtro", filterLabel]),
    row(NOTE_ROW),
    "",
    row([
      "Equipe", "Pontos (total)", "Pontos de ataque", "Pontos de saque (aces)", "Pontos de bloqueio", "Pontos por erro do adversário",
      "Virada de bola (%)", "Quebra de saque (%)", "Total de ataques", "Erros de ataque", "Eficiência de ataque (%)",
      "Total de recepções", receptionLabel, "Erros de recepção (aces sofridos)", "Total de saques", "Erros de saque (total)",
      "Erros de saque na rede", "Erros de saque pra fora",
    ]),
    ...(["A", "B"] as const).map((t) => row(teamRow(t, box.teams[t]))),
    "",
    row(["Equipe", "Número", "Atleta", ...columns.map((c) => c.full)]),
  ];

  for (const t of ["A", "B"] as const) {
    const roster = t === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids;
    const outsiders = Object.values(box.athletes).filter((s) => s.team === t && !roster.includes(s.athlete_id));
    for (const s of [...roster.flatMap((id) => (box.athletes[id] ? [box.athletes[id]] : [])), ...outsiders]) {
      lines.push(row(athleteRow(t, s)));
    }
  }

  return document(lines);
}

/** boxscore_areia-a-x-areia-b_set-2_2026-10-13.csv */
export function boxScoreCsvFilename(match: Match, filter: StatsFilter, now: number): string {
  const part = filter.set === "all" ? "jogo" : `set-${filter.set}`;
  const date = new Date(now).toISOString().slice(0, 10);
  return `boxscore_${slug(match.team_a.name)}-x-${slug(match.team_b.name)}_${part}_${date}.csv`;
}
