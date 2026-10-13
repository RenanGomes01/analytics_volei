import type { AthleteStats, BoxScore, Rate, StatsFilter, TeamStats } from "../stats/types";
import type { Athlete, Match, TeamSide } from "../types";
import { slug } from "./match-export";

/**
 * Box Score em CSV para o Excel em português: separador `;` (o Excel pt-BR usa vírgula decimal),
 * decimais com vírgula, BOM UTF-8 (acentos) e CRLF. Sem assinatura: é um relatório, não um backup.
 */

const SEP = ";";
const EOL = "\r\n";
const BOM = "﻿";

export interface BoxScoreCsvInput {
  box: BoxScore;
  match: Match;
  athletes: ReadonlyMap<string, Athlete>;
  filter: StatsFilter;
  /** Fuso para a data da partida (os testes fixam "UTC"). */
  timeZone?: string;
}

type Cell = string | number | null;

/** Texto seguro: neutraliza fórmulas (=, +, -, @) e põe entre aspas quando precisa. */
function text(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const decimal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

function cell(value: Cell): string {
  if (value === null) return "";
  return typeof value === "number" ? decimal(value) : text(value);
}

/** Porcentagem com 1 casa (62,5); vazio quando não há base de cálculo. */
const pct = (value: Rate | number | null): number | null => {
  const n = value !== null && typeof value === "object" ? value.pct : value;
  return n === null ? null : Math.round(n * 1000) / 10;
};

const row = (cells: Cell[]) => cells.map(cell).join(SEP);

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
  ];

  const athleteRow = (t: TeamSide, s: AthleteStats) => {
    const a = athletes.get(s.athlete_id);
    return [
      teamName(t),
      a?.jersey_number ?? null,
      a?.name ?? s.athlete_id.slice(0, 8),
      s.points,
      s.attack.kills,
      s.attack.errors,
      s.attack.attempts,
      pct(s.attack.efficiency),
      s.serve.aces,
      s.serve.errors,
      s.serve.attempts,
      s.reception.attempts,
      pct(s.reception.positive),
      s.blocks,
      s.digs,
      s.errors,
    ];
  };

  const lines: string[] = [
    row(["Partida", `${match.team_a.name} × ${match.team_b.name}`, "Modalidade", beach ? "Beach" : "Indoor", "Data", date, "Filtro", filterLabel]),
    "",
    row([
      "Equipe", "Pontos", "PA", "Ace", "Blq", "Err. adv", "Virada de bola (%)", "Quebra de saque (%)",
      "TA", "E", "Efic. ataque (%)", "Rec", receptionLabel, "Erros recepção", "Sq", "ES",
    ]),
    ...(["A", "B"] as const).map((t) => row(teamRow(t, box.teams[t]))),
    "",
    row([
      "Equipe", "Nº", "Atleta", "Pts", "PA", "E", "TA", "Efic. (%)", "Ace", "ES", "Sq", "Rec",
      beach ? "Na mão (%)" : "#+ (%)", "Blq", "Def", "Erros",
    ]),
  ];

  for (const t of ["A", "B"] as const) {
    const roster = t === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids;
    const outsiders = Object.values(box.athletes).filter((s) => s.team === t && !roster.includes(s.athlete_id));
    for (const s of [...roster.flatMap((id) => (box.athletes[id] ? [box.athletes[id]] : [])), ...outsiders]) {
      lines.push(row(athleteRow(t, s)));
    }
  }

  return BOM + lines.join(EOL) + EOL;
}

/** boxscore_areia-a-x-areia-b_set-2_2026-10-13.csv */
export function boxScoreCsvFilename(match: Match, filter: StatsFilter, now: number): string {
  const part = filter.set === "all" ? "jogo" : `set-${filter.set}`;
  const date = new Date(now).toISOString().slice(0, 10);
  return `boxscore_${slug(match.team_a.name)}-x-${slug(match.team_b.name)}_${part}_${date}.csv`;
}
