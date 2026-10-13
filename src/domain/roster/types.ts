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
export interface TournamentEntry extends TenantScoped {
  /** `${tournament_id}:${match_id}` */
  id: string;
  tournament_id: string;
  match_id: string;
  created_at: number;
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
