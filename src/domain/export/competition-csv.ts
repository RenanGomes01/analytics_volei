import type { Tournament } from "../roster/types";
import type { CompetitionStats } from "../stats/aggregate";
import { document, pct, row } from "./csv";
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

  const lines = [
    row(["Torneio", tournament.name, "Local", tournament.location ?? "", "Modalidade", beach ? "Beach" : "Indoor", "Período", period]),
    row(["Jogos", stats.totals.matches, "Encerrados", stats.totals.finished, "Sets", stats.totals.sets, "Ralis", stats.totals.rallies]),
    "",
    row([
      beach ? "Dupla" : "Time", "J", "V", "D", "Sets +", "Sets -", "Pontos pró", "Pontos contra",
      "Virada de bola (%)", "Quebra de saque (%)", "TA", "Efic. ataque (%)", beach ? "Passe na mão (%)" : "Recepção #+ (%)",
      "Aces", "Blq", "Err. adv",
    ]),
    ...teams.map((t) =>
      row([
        teamName(t.pair_key), t.matches, t.wins, t.losses, t.sets_won, t.sets_lost, t.points_for, t.points_against,
        pct(t.side_out), pct(t.break_point), t.attack.attempts, pct(t.attack.efficiency), pct(t.reception.positive),
        t.points.aces, t.points.blocks, t.points.opponent_errors,
      ]),
    ),
    "",
    row([
      "Atleta", "Nº", "Jogos", "Pts", "PA", "E", "TA", "Efic. (%)", "Ace", "ES", "Sq", "Rec",
      beach ? "Na mão (%)" : "#+ (%)", "Blq", "Def", "Erros",
    ]),
    ...athletes.map((a) =>
      row([
        athleteName(a.athlete_id), athleteNumber(a.athlete_id), a.matches, a.points, a.attack.kills, a.attack.errors,
        a.attack.attempts, pct(a.attack.efficiency), a.serve.aces, a.serve.errors, a.serve.attempts,
        a.reception.attempts, pct(a.reception.positive), a.blocks, a.digs, a.errors,
      ]),
    ),
  ];
  return document(lines);
}

/** torneio_etapa-saquarema_2026-10-10.csv */
export const competitionCsvFilename = (tournament: Tournament) => `torneio_${slug(tournament.name)}_${tournament.start_date}.csv`;
