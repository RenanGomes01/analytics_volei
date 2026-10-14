// Tipos do domínio de scout. Este módulo é PURO: não importa React, Dexie nem I/O.

export type Modality = "beach" | "indoor";
export type TeamSide = "A" | "B";

/** side_out = complexo K1 (recepção → levantamento → ataque da equipe que recebe).
 *  counter_attack = complexo K2 (saque, bloqueio, defesa e contra-ataques). */
export type RallyPhase = "side_out" | "counter_attack";

/** Fundamento. `fault` registra uma falta sem contato com a bola (rede, invasão, condução…). */
export type Skill = "serve" | "reception" | "set" | "attack" | "block" | "dig" | "freeball" | "fault";

/**
 * Escala de qualidade de scout: # perfeito, + positivo, ! regular, - negativo, / ruim (bola de graça
 * ao adversário), = erro. `?` = não avaliado (modo rápido): nunca encerra rali e fica fora das taxas.
 */
export type Quality = "#" | "+" | "!" | "-" | "/" | "=" | "?";

/** Isolamento de tenant local: toda linha persistida pertence a um tenant. */
export interface TenantScoped {
  tenant_id: string;
}

export interface Match extends TenantScoped {
  id: string;
  modality: Modality;
  /** Versão das regras com que a partida foi criada (ex.: "beach-2026"). */
  rules_version: string;
  team_a: { name: string; athlete_ids: string[] };
  team_b: { name: string; athlete_ids: string[] };
  first_server: TeamSide;
  created_at: number;
}

export type Gender = "M" | "F";

export interface Athlete extends TenantScoped {
  id: string;
  name: string;
  jersey_number?: number;
  /** Fonte da verdade para rankings por gênero (cadastros antigos podem não ter). */
  gender?: Gender;
  created_at: number;
}

// ---- Ledger (IMUTÁVEL: só insert, nunca update/delete) ----

export interface RallyEventBase extends TenantScoped {
  id: string;
  match_id: string;
  /** `${match_id}:s${set_number}` */
  set_id: string;
  set_number: number;
  rally_id: string;
  rally_number: number;
  /** Ordem total por partida, monotônica neste dispositivo. */
  local_seq: number;
  device_id: string;
  timestamp: number;
}

/** Como o ponto aconteceu, com detalhe de vôlei de praia (modo rápido). Opcional nos eventos. */
export type PointDetail =
  | "out"
  | "net"
  | "blocked"
  | "shot"
  | "block_out"
  | "foot_fault"
  | "net_touch"
  | "invasion"
  | "double"
  | "lift"
  | "four_hits"
  | "serve_delay"
  | "service_order"
  | "open_hand_tip"
  | "serve_attack"
  | "penalty"
  | "other";

export interface TouchEvent extends RallyEventBase {
  kind: "touch";
  phase: RallyPhase;
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
  quality: Quality;
  detail?: PointDetail;
}

export type RallyEndReason = "kill" | "ace" | "error" | "four_touches" | "manual";

export interface RallyEndEvent extends RallyEventBase {
  kind: "rally_end";
  point_to: TeamSide;
  reason: RallyEndReason;
  detail?: PointDetail;
}

/** Correção = evento compensatório que anula outro evento do ledger. */
export interface VoidEvent extends RallyEventBase {
  kind: "void";
  voids_event_id: string;
}

/**
 * Quem começa sacando no set (sorteio). Só vale no 0×0 do set; depois de um ponto é ignorado.
 * Fica no ledger (append-only) em vez de alterar a partida: dá para desfazer e não invalida exportações.
 */
export interface SetStartEvent extends RallyEventBase {
  kind: "set_start";
  serving_team: TeamSide;
}

/** Por que a partida foi encerrada manualmente (sem chegar ao placar das regras). */
export type MatchEndReason = "score" | "retirement" | "walkover" | "weather" | "other";

/**
 * Encerramento manual da partida (lesão, chuva, W.O., set único…). Tem rally_id próprio; o rali aberto
 * é descartado no replay. Anular este evento (Desfazer) reabre a partida.
 */
export interface MatchEndEvent extends RallyEventBase {
  kind: "match_end";
  winner: TeamSide;
  reason: MatchEndReason;
  note?: string;
}

export type RallyEvent = TouchEvent | RallyEndEvent | VoidEvent | SetStartEvent | MatchEndEvent;

// ---- Outbox ----

export type OutboxEntity =
  | "match"
  | "athlete"
  | "rally_event"
  | "team"
  | "tournament"
  | "tournament_entry"
  | "athlete_alias";
/** insert: ledger e entidades novas. upsert/delete: cadastro editável (atletas, duplas, torneios, aliases). */
export type OutboxOp = "insert" | "upsert" | "delete";
export type OutboxStatus = "pending" | "sent" | "acked" | "conflict";

export interface OutboxEntry extends TenantScoped {
  /** Chave de idempotência no servidor. */
  mutation_id: string;
  entity: OutboxEntity;
  entity_id: string;
  op: OutboxOp;
  payload: unknown;
  status: OutboxStatus;
  created_at: number;
  /** Quantas vezes a mutação foi enviada (reivindicada pelo motor de sync). */
  attempts: number;
  last_attempt_at: number | null;
  /** Não reenviar antes disso (backoff). Igual a created_at enquanto nunca falhou. */
  next_attempt_at: number;
  last_error: string | null;
  /** Atribuído pelo servidor no ack. Fica aqui, e não no evento, para o ledger continuar imutável. */
  server_seq: number | null;
}

export const otherTeam = (team: TeamSide): TeamSide => (team === "A" ? "B" : "A");
