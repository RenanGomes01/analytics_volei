import { rulesFor, type ModalityRules } from "../rules/modality";
import type {
  Match,
  MatchEndEvent,
  MatchEndReason,
  PointDetail,
  RallyEndEvent,
  RallyEndReason,
  RallyEvent,
  RallyEventBase,
  SetStartEvent,
  TeamSide,
  TouchEvent,
  VoidEvent,
} from "../types";
import { phaseForTouch } from "./phase";
import { activeEvents, replayMatch, type MatchState } from "./replay";
import type { DetailedPointPlan } from "./resolve-detailed-point";

/**
 * Planejamento dos comandos do scout (Fase 14), sem I/O: a partir do ledger em memória, decide quais
 * eventos novos um comando grava. A tela usa isto para atualizar o placar no mesmo toque (o ledger em
 * memória já inclui os eventos planejados) e só depois grava no IndexedDB, em segundo plano. Os
 * serviços (`rally-ledger-service.ts`) usam as mesmas funções dentro da transação.
 *
 * Tudo continua append-only: correções são VoidEvents e regravações, nunca edições.
 */

export interface MatchScope {
  tenant_id: string;
  match_id: string;
}

export type TouchInput = Pick<TouchEvent, "team" | "athlete_id" | "skill" | "quality" | "detail" | "replaces_event_id" | "via_point">;

export interface RallyEndInput {
  point_to: TeamSide;
  reason: RallyEndReason;
  detail?: PointDetail;
}

export interface FinishMatchInput {
  winner: TeamSide;
  reason: MatchEndReason;
  note?: string;
}

export interface PlanContext {
  scope: MatchScope;
  match: Pick<Match, "modality" | "first_server">;
  device_id: string;
  newId: () => string;
  now: () => number;
}

/** Ledger de trabalho de um comando: os eventos existentes mais os planejados até aqui. */
export class LedgerDraft {
  readonly rules: ModalityRules;
  /** Eventos novos, na ordem em que devem ser gravados. */
  readonly added: RallyEvent[] = [];
  private readonly work: RallyEvent[];
  private maxSeq: number;
  private cached: MatchState | null = null;

  constructor(
    events: readonly RallyEvent[],
    readonly ctx: PlanContext,
  ) {
    this.rules = rulesFor(ctx.match.modality);
    this.work = [...events];
    // reduce, não Math.max(...): ledgers longos estouram a pilha com spread.
    this.maxSeq = events.reduce((max, e) => Math.max(max, e.local_seq), 0);
  }

  get events(): readonly RallyEvent[] {
    return this.work;
  }

  state(): MatchState {
    return (this.cached ??= replayMatch(this.work, { rules: this.rules, first_server: this.ctx.match.first_server }));
  }

  nextSeq(): number {
    return this.maxSeq + 1;
  }

  push<T extends RallyEvent>(event: T): T {
    this.work.push(event);
    this.added.push(event);
    this.maxSeq = Math.max(this.maxSeq, event.local_seq);
    this.cached = null;
    return event;
  }

  /** Campos comuns do próximo evento: continua o rali aberto ou abre um novo no set atual. */
  base(local_seq = this.nextSeq()): RallyEventBase {
    const state = this.state();
    const open = state.open_rally;
    const set_number = open?.set_number ?? state.current_set;
    return {
      ...this.ctx.scope,
      id: this.ctx.newId(),
      set_id: `${this.ctx.scope.match_id}:s${set_number}`,
      set_number,
      rally_id: open?.rally_id ?? this.ctx.newId(),
      rally_number: open?.rally_number ?? state.rallies.filter((r) => r.set_number === set_number).length + 1,
      local_seq,
      device_id: this.ctx.device_id,
      timestamp: this.ctx.now(),
    };
  }
}

export function planTouch(draft: LedgerDraft, input: TouchInput): TouchEvent {
  const state = draft.state();
  if (state.winner) throw new Error("Partida encerrada: não é possível registrar novos toques.");
  const phase = phaseForTouch(state.open_rally?.touches ?? [], input.team, state.serving_team, draft.rules);
  return draft.push({ ...draft.base(), ...input, kind: "touch", phase });
}

export function planRallyEnd(draft: LedgerDraft, input: RallyEndInput): RallyEndEvent {
  if (draft.state().winner) throw new Error("Partida encerrada: não é possível registrar novos pontos.");
  return draft.push({ ...draft.base(), ...input, kind: "rally_end" });
}

export function planVoid(draft: LedgerDraft, event_id: string): VoidEvent {
  const { scope } = draft.ctx;
  const target = draft.events.find((e) => e.id === event_id);
  if (!target || target.tenant_id !== scope.tenant_id || target.match_id !== scope.match_id) {
    throw new Error(`Evento ${event_id} não encontrado nesta partida.`);
  }
  if (target.kind === "void") throw new Error("Não é possível anular uma anulação; registre o evento novamente.");
  if (draft.events.some((e) => e.kind === "void" && e.voids_event_id === event_id)) {
    throw new Error(`Evento ${event_id} já foi anulado.`);
  }
  return draft.push({
    ...scope,
    id: draft.ctx.newId(),
    set_id: target.set_id,
    set_number: target.set_number,
    rally_id: target.rally_id,
    rally_number: target.rally_number,
    local_seq: draft.nextSeq(),
    device_id: draft.ctx.device_id,
    timestamp: draft.ctx.now(),
    kind: "void",
    voids_event_id: event_id,
  });
}

/**
 * Desfaz a última ação válida (toque ou fim de rali). null se não há o que desfazer.
 * Ponto resolvido por "Como foi o ponto?" volta inteiro: anula o fim e as cópias corrigidas e regrava
 * os toques originais, como estavam antes do "Ponto".
 */
export function planUndoLastAction(draft: LedgerDraft): VoidEvent | null {
  const all = [...draft.events];
  const active = activeEvents(all);
  const last = active.at(-1);
  if (!last) return null;
  if (last.kind !== "rally_end") return planVoid(draft, last.id);

  const written = active.filter((e): e is TouchEvent => e.kind === "touch" && e.rally_id === last.rally_id && !!e.via_point);
  const undone = planVoid(draft, last.id);
  for (const e of [...written].reverse()) planVoid(draft, e.id);
  const byId = new Map(all.map((e) => [e.id, e]));
  for (const copy of written) {
    const original = copy.replaces_event_id ? byId.get(copy.replaces_event_id) : undefined;
    if (original?.kind !== "touch") continue;
    const { team, athlete_id, skill, quality, detail } = original;
    planTouch(draft, { team, athlete_id, skill, quality, ...(detail ? { detail } : {}) });
  }
  return undone;
}

/** Rali inteiro (toques + fim), no rali aberto se houver; local_seq e horário sequenciais. */
export function planRally(draft: LedgerDraft, touches: readonly TouchInput[], end: RallyEndInput): { touches: TouchEvent[]; end: RallyEndEvent } {
  const state = draft.state();
  if (state.winner) throw new Error("Partida encerrada: não é possível registrar novos pontos.");
  const base = draft.base();
  const rallyTouches: TouchEvent[] = [...(state.open_rally?.touches ?? [])];
  const written: TouchEvent[] = [];
  let offset = 0;
  const next = () => {
    const i = offset++;
    return { ...base, id: draft.ctx.newId(), local_seq: base.local_seq + i, timestamp: base.timestamp + i };
  };
  for (const input of touches) {
    const phase = phaseForTouch(rallyTouches, input.team, state.serving_team, draft.rules);
    const event = draft.push({ ...next(), ...input, kind: "touch", phase } satisfies TouchEvent);
    rallyTouches.push(event);
    written.push(event);
  }
  const endEvent = draft.push({ ...next(), ...end, kind: "rally_end" } satisfies RallyEndEvent);
  return { touches: written, end: endEvent };
}

/** "Como foi o ponto?" no modo detalhado: anula o sufixo do plano, regrava (com `via_point`) e fecha o rali. */
export function planResolvePoint(draft: LedgerDraft, plan: DetailedPointPlan): RallyEndEvent {
  const open = new Set((draft.state().open_rally?.touches ?? []).map((t) => t.id));
  if (plan.void_ids.some((id) => !open.has(id))) throw new Error("O rali mudou: confira os toques e marque o ponto de novo.");
  for (const id of [...plan.void_ids].reverse()) planVoid(draft, id);
  return planRally(draft, plan.touches.map((t) => ({ ...t, via_point: true as const })), plan.end).end;
}

/** Modo rápido: anula o ÚLTIMO RALI inteiro e devolve os toques dele. */
export function planUndoLastRally(draft: LedgerDraft): TouchEvent[] {
  const active = activeEvents(draft.events);
  const last = active.at(-1);
  if (!last) return [];
  const inRally = active.filter((e) => e.rally_id === last.rally_id);
  for (const event of [...inRally].reverse()) planVoid(draft, event.id);
  return inRally.filter((e): e is TouchEvent => e.kind === "touch");
}

/** Quem começa sacando no set atual. Só no 0×0 e sem rali aberto; null se já é quem saca. */
export function planChooseServer(draft: LedgerDraft, serving_team: TeamSide): SetStartEvent | null {
  const state = draft.state();
  if (state.winner) throw new Error("Partida encerrada.");
  const current = state.sets.at(-1)!;
  if (current.score.A + current.score.B > 0 || state.open_rally) {
    throw new Error("Só dá para escolher quem saca antes do primeiro ponto do set.");
  }
  if (state.serving_team === serving_team) return null;
  return draft.push({ ...draft.base(), kind: "set_start", serving_team } satisfies SetStartEvent);
}

/** Encerramento manual: evento fora de qualquer rali (o rali aberto é descartado no replay). */
export function planFinishMatch(draft: LedgerDraft, input: FinishMatchInput): MatchEndEvent {
  if (draft.state().winner) throw new Error("A partida já está encerrada.");
  const note = input.note?.trim();
  return draft.push({
    ...draft.base(),
    rally_id: draft.ctx.newId(),
    kind: "match_end",
    winner: input.winner,
    reason: input.reason,
    ...(note ? { note } : {}),
  } satisfies MatchEndEvent);
}
