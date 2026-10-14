import type { Modality, TenantScoped } from "../types";

/** Categoria da etapa. */
export type TournamentCategory = "M" | "F" | "Mixed" | "Open";

/** Dupla (beach) ou elenco persistente (indoor). `pair_key` identifica o conjunto de atletas. */
export interface Team extends TenantScoped {
  id: string;
  name: string;
  /** Ids CANÔNICOS (já resolvidos pelos aliases), em ordem de cadastro. */
  athlete_ids: string[];
  pair_key: string;
  modality: Modality;
  created_at: number;
}

/** Etapa ou competição. Datas em "AAAA-MM-DD". */
export interface Tournament extends TenantScoped {
  id: string;
  name: string;
  location?: string;
  start_date: string;
  end_date?: string;
  modality: Modality;
  category?: TournamentCategory;
  created_at: number;
}

/** Vínculo partida → torneio. Única forma de ligar uma partida (nova ou do MVP) a uma etapa. */
/** Fase da partida no torneio. Partida sem torneio = amistoso (deduzido, não gravado). */
export type TournamentPhase = "group" | "round_of_16" | "quarterfinal" | "semifinal" | "final" | "third_place";

export const TOURNAMENT_PHASES: TournamentPhase[] = ["group", "round_of_16", "quarterfinal", "semifinal", "final", "third_place"];

export const PHASE_LABEL: Record<TournamentPhase, string> = {
  group: "Fase de grupos",
  round_of_16: "Oitavas de final",
  quarterfinal: "Quartas de final",
  semifinal: "Semifinal",
  final: "Final",
  third_place: "Disputa de 3º",
};

/** Filtro de fase: todas, só mata-mata (oitavas → final, inclusive 3º) ou uma fase específica. */
export type PhaseFilter = "all" | "knockout" | TournamentPhase;

/** A partida entra no filtro? Sem fase registrada só entra em "todas". */
export function matchesPhase(phase: TournamentPhase | undefined, filter: PhaseFilter): boolean {
  if (filter === "all") return true;
  if (!phase) return false;
  return filter === "knockout" ? phase !== "group" : phase === filter;
}

export interface TournamentEntry extends TenantScoped {
  /** `${tournament_id}:${match_id}` */
  id: string;
  tournament_id: string;
  match_id: string;
  created_at: number;
  /** Opcional e sem índice: partidas antigas ficam sem fase até alguém classificar. */
  phase?: TournamentPhase;
}

/**
 * "Este atleta é o mesmo que aquele": une cadastros duplicados SEM reescrever o ledger, que
 * continua com os ids originais. Sempre aponta para o canônico final (sem cadeias).
 */
export interface AthleteAlias extends TenantScoped {
  alias_id: string;
  canonical_id: string;
  created_at: number;
}
