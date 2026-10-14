import type { Match, OutboxEntity, OutboxEntry, OutboxOp } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";

/**
 * Central de sincronização (Fase 10): o que está retido neste aparelho, o que a nuvem recusou e onde
 * o envio está parado — com nomes legíveis ("Ana/Bia × Júlia/Larissa"), nunca ids.
 */

export type SummaryGroup = "match" | "athlete" | "team" | "tournament" | "link";

export interface PendingMatch {
  match_id: string;
  label: string;
  /** Lances (eventos do ledger) desta partida ainda na fila. */
  events: number;
  /** A própria partida (criação/edição/exclusão) também está na fila. */
  match: boolean;
}

export interface SyncIssue {
  mutation_id: string;
  entity: OutboxEntity;
  entity_id: string;
  op: OutboxOp;
  label: string;
  /** Motivo em PT-BR, com o que fazer. */
  reason: string;
  attempts: number;
  /** "Usar a versão da nuvem" só existe para o que é editável (lance nunca é sobrescrito). */
  canUseRemote: boolean;
}

export interface StalledHead extends SyncIssue {
  next_attempt_at: number;
  /** Falha de rede/login: só aguarda (pular desordenaria a fila à toa). */
  transient: boolean;
  /** Pode ir para a revisão para destravar a fila (5+ falhas que não são de rede). */
  canSkip: boolean;
}

export interface SyncSummary {
  /** Registros distintos esperando envio, por tipo (várias edições do mesmo atleta contam 1). */
  pending: Record<SummaryGroup, number>;
  pendingEvents: number;
  pendingTotal: number;
  /** Partidas com algo na fila (as com mais lances primeiro). */
  pendingMatches: PendingMatch[];
  issues: SyncIssue[];
  stalled: StalledHead | null;
  dismissed: number;
}

export const SKIP_AFTER_ATTEMPTS = 5;

const GROUP: Record<OutboxEntity, SummaryGroup | null> = {
  match: "match",
  rally_event: null,
  athlete: "athlete",
  athlete_alias: "athlete",
  team: "team",
  tournament: "tournament",
  tournament_entry: "link",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export function matchLabel(match: Pick<Match, "team_a" | "team_b" | "created_at">): string {
  return `${match.team_a.name} × ${match.team_b.name} · ${dateFormat.format(match.created_at)}`;
}

/** Erros de rede ou de sessão: passam sozinhos (ou entrando na conta), nunca justificam pular. */
export function isTransientError(message: string | null): boolean {
  return !message || /conexão|fetch|network|Sessão|Entre na conta|Não autenticado|timeout|servidor não respondeu/i.test(message);
}

/** Motivo de recusa do servidor → explicação em PT-BR com o próximo passo. */
export function explainReason(reason: string | null, entity: OutboxEntity): string {
  const text = reason ?? "";
  if (/só aceita insert/i.test(text)) {
    return entity === "rally_event"
      ? "Lances não podem ser alterados na nuvem (o ledger é imutável)."
      : "A nuvem ainda não aceita editar ou excluir partidas: rode supabase/migrations/0002_editable_matches.sql no Supabase e toque em \"Enviar a versão deste aparelho\".";
  }
  if (/já existe com outro conteúdo/i.test(text)) {
    return entity === "rally_event"
      ? "A nuvem já tem este lance com outro conteúdo (a partida foi scouteada em dois aparelhos?). A versão deste aparelho foi mantida."
      : "A nuvem já tem outra versão deste registro (editado em outro aparelho?). Escolha qual versão vale.";
  }
  if (/Entidade desconhecida|Operação desconhecida/i.test(text)) return "O banco na nuvem está desatualizado em relação ao app: rode os SQLs de supabase/migrations.";
  if (/Mutação incompleta/i.test(text)) return "Registro incompleto: não dá para enviar como está.";
  return text || "Recusado pela nuvem sem motivo informado.";
}

async function labeler(db: ScoutDB, entries: readonly OutboxEntry[]) {
  const matchIds = new Set<string>();
  for (const e of entries) {
    if (e.entity === "match") matchIds.add(e.entity_id);
    const payload = e.payload as { match_id?: string };
    if ((e.entity === "rally_event" || e.entity === "tournament_entry") && payload?.match_id) matchIds.add(payload.match_id);
  }
  const matches = new Map((await db.matches.bulkGet([...matchIds])).flatMap((m) => (m ? [[m.id, m] as const] : [])));
  const ofMatch = (id: string | undefined, fallback?: unknown) => {
    const m = (id && matches.get(id)) || (fallback as Match | undefined);
    return m?.team_a ? matchLabel(m) : "partida não encontrada neste aparelho";
  };

  return (e: OutboxEntry): string => {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.entity) {
      case "match":
        return `Partida ${ofMatch(e.entity_id, p)}`;
      case "rally_event":
        return `Lance da partida ${ofMatch(p.match_id as string)}`;
      case "athlete":
        return `Atleta ${String(p.name ?? e.entity_id.slice(0, 8))}`;
      case "team":
        return `Dupla ${String(p.name ?? e.entity_id.slice(0, 8))}`;
      case "tournament":
        return `Torneio ${String(p.name ?? e.entity_id.slice(0, 8))}`;
      case "tournament_entry":
        return `Vínculo da partida ${ofMatch(p.match_id as string)} com o torneio`;
      case "athlete_alias":
        return "União de atletas";
    }
  };
}

const toIssue = (e: OutboxEntry, label: string): SyncIssue => ({
  mutation_id: e.mutation_id,
  entity: e.entity,
  entity_id: e.entity_id,
  op: e.op,
  label,
  reason: explainReason(e.last_error, e.entity),
  attempts: e.attempts,
  canUseRemote: e.entity !== "rally_event",
});

export async function getSyncSummary(db: ScoutDB, tenant_id: string, { maxIssues = 50, maxMatches = 20 } = {}): Promise<SyncSummary> {
  // Só a fila de verdade (pendentes, enviando, recusados) — nunca o histórico confirmado, que tem
  // milhares de linhas com payload e deixaria o tablet lento a cada gravação.
  const [queue, dismissed] = await Promise.all([
    db.outbox.where("status").anyOf("pending", "sent", "conflict").filter((e) => e.tenant_id === tenant_id).toArray(),
    db.outbox.where("status").equals("dismissed").count(),
  ]);
  const waiting = queue.filter((e) => e.status === "pending" || e.status === "sent").sort((a, b) => a.created_at - b.created_at);
  const conflicts = queue.filter((e) => e.status === "conflict").sort((a, b) => a.created_at - b.created_at);
  const label = await labeler(db, [...waiting.slice(0, 1), ...conflicts.slice(0, maxIssues), ...waiting.filter((e) => e.entity === "match" || e.entity === "rally_event")]);

  const pending: Record<SummaryGroup, number> = { match: 0, athlete: 0, team: 0, tournament: 0, link: 0 };
  const seen = new Set<string>();
  const perMatch = new Map<string, PendingMatch>();
  let pendingEvents = 0;
  for (const e of waiting) {
    if (e.entity === "rally_event") {
      pendingEvents += 1;
      const match_id = (e.payload as { match_id: string }).match_id;
      const row = perMatch.get(match_id) ?? { match_id, label: "", events: 0, match: false };
      row.events += 1;
      if (!row.label) row.label = label(e).replace(/^Lance da partida /, "");
      perMatch.set(match_id, row);
      continue;
    }
    const group = GROUP[e.entity];
    const key = `${e.entity}:${e.entity_id}`;
    if (group && !seen.has(key)) {
      seen.add(key);
      pending[group] += 1;
    }
    if (e.entity === "match") {
      const row = perMatch.get(e.entity_id) ?? { match_id: e.entity_id, label: "", events: 0, match: false };
      row.match = true;
      row.label = label(e).replace(/^Partida /, "");
      perMatch.set(e.entity_id, row);
    }
  }

  // Cabeça da fila: se já falhou, o envio está parado nela (FIFO) — mostrar, nunca em silêncio.
  const head = waiting[0];
  let stalled: StalledHead | null = null;
  if (head && head.attempts > 0 && head.last_error) {
    const transient = isTransientError(head.last_error);
    stalled = {
      ...toIssue(head, label(head)),
      reason: transient ? head.last_error : explainReason(head.last_error, head.entity),
      next_attempt_at: head.next_attempt_at,
      transient,
      canSkip: !transient && head.attempts >= SKIP_AFTER_ATTEMPTS,
    };
  }

  return {
    pending,
    pendingEvents,
    pendingTotal: waiting.length,
    pendingMatches: [...perMatch.values()].sort((a, b) => b.events - a.events).slice(0, maxMatches),
    issues: conflicts.slice(0, maxIssues).map((e) => toIssue(e, label(e))),
    stalled,
    dismissed,
  };
}
