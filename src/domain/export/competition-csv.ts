import type { Tournament } from "../roster/types";
import type { CompetitionStats } from "../stats/aggregate";
import { athleteColumns, csvColumns, teamColumns } from "../stats/stat-columns";
import { NOTE_ROW, document, row, statCell } from "./csv";
import { slug } from "./match-export";

/** Estatísticas agregadas de um torneio em CSV (formato Excel pt-BR, ver csv.ts). */

export interface CompetitionCsvInput {
  stats: CompetitionStats;
  tournament: Tournament;
  athleteName: (id: string) => string;
  athleteNumber: (id: string) => number | null;
  teamName: (pairKey: string) => string;
}

const brDate = (iso: string) => iso.split("-").reverse().join("/");

export function competitionToCsv({ stats, tournament, athleteName, athleteNumber, teamName }: CompetitionCsvInput): string {
  const beach = tournament.modality === "beach";
  const period = tournament.end_date ? `${brDate(tournament.start_date)} a ${brDate(tournament.end_date)}` : brDate(tournament.start_date);
  const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR");

  const teams = Object.values(stats.teams).sort((a, b) => b.wins - a.wins || a.losses - b.losses || byName(teamName(a.pair_key), teamName(b.pair_key)));
  const athletes = Object.values(stats.athletes).sort((a, b) => b.points - a.points || byName(athleteName(a.athlete_id), athleteName(b.athlete_id)));

  const showReception = (rows: { reception: { positive: { den: number } } }[]) => rows.some((r) => r.reception.positive.den > 0);
  const teamCols = csvColumns(teamColumns({ modality: tournament.modality, showReception: showReception(teams) }));
  const athleteCols = csvColumns(athleteColumns({ modality: tournament.modality, aggregated: true, showReception: showReception(athletes) }));

  const lines = [
    row(["Torneio", tournament.name, "Local", tournament.location ?? "", "Modalidade", beach ? "Beach" : "Indoor", "Período", period]),
    row(["Jogos", stats.totals.matches, "Encerrados", stats.totals.finished, "Sets", stats.totals.sets, "Ralis", stats.totals.rallies]),
    row(NOTE_ROW),
    "",
    row([beach ? "Dupla" : "Time", ...teamCols.map((c) => c.full)]),
    ...teams.map((t) => row([teamName(t.pair_key), ...teamCols.map((c) => statCell(c, t))])),
    "",
    row(["Atleta", "Número", ...athleteCols.map((c) => c.full)]),
    ...athletes.map((a) => row([athleteName(a.athlete_id), athleteNumber(a.athlete_id), ...athleteCols.map((c) => statCell(c, a))])),
  ];
  return document(lines);
}

/** torneio_etapa-saquarema_2026-10-10.csv */
export const competitionCsvFilename = (tournament: Tournament) => `torneio_${slug(tournament.name)}_${tournament.start_date}.csv`;
