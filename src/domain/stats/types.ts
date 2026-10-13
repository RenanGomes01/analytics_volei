import type { TeamSide } from "../types";

/** Razão com numerador e denominador visíveis. `pct` é null quando o denominador é 0. */
export interface Rate {
  num: number;
  den: number;
  pct: number | null;
}

export interface StatsFilter {
  set: number | "all";
}

export interface AttackLine {
  attempts: number;
  kills: number;
  /** Ataque `=` ou ataque bloqueado para ponto pelo adversário. */
  errors: number;
  in_play: number;
  /** (kills − errors) / attempts; null sem ataques. */
  efficiency: number | null;
}

export interface ServeLine {
  attempts: number;
  aces: number;
  errors: number;
}

export interface ReceptionLine {
  attempts: number;
  /** `#` + `+` sobre as recepções AVALIADAS (as `?` do modo rápido ficam fora). */
  positive: Rate;
  /** Recepção `=` (ace sofrido). */
  errors: number;
}

export interface AthleteStats {
  athlete_id: string;
  team: TeamSide;
  /** kills + aces + bloqueios. */
  points: number;
  attack: AttackLine;
  serve: ServeLine;
  reception: ReceptionLine;
  blocks: number;
  digs: number;
  /** Erros cometidos: lances `=` e ataques bloqueados. */
  errors: number;
}

export interface PointsBreakdown {
  total: number;
  kills: number;
  aces: number;
  blocks: number;
  /** Pontos ganhos por erro `=`, 4 toques ou ponto manual do adversário. */
  opponent_errors: number;
}

export interface TeamStats {
  /** Derivado do resultado dos ralis: `points.total` é sempre igual ao placar. */
  points: PointsBreakdown;
  attack: AttackLine;
  serve: ServeLine;
  reception: ReceptionLine;
  blocks: number;
  digs: number;
  errors: number;
  /** K1: ralis ganhos recebendo / saques recebidos. */
  side_out: Rate;
  /** K2: ralis ganhos sacando / saques realizados. */
  break_point: Rate;
}

export interface BoxScore {
  filter: StatsFilter;
  /** Sets com ao menos um rali, para montar o filtro. */
  sets_available: number[];
  teams: Record<TeamSide, TeamStats>;
  athletes: Record<string, AthleteStats>;
}
