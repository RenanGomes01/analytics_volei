import { newId } from "@/lib/id";
import {
  LedgerDraft,
  planChooseServer,
  planFinishMatch,
  planRally,
  planRallyEnd,
  planResolvePoint,
  planTouch,
  planUndoLastAction,
  planUndoLastRally,
  planVoid,
  type FinishMatchInput,
  type MatchScope,
  type RallyEndInput,
  type TouchInput,
} from "@/domain/rally/plan-events";
import type { DetailedPointPlan } from "@/domain/rally/resolve-detailed-point";
import type { MatchState } from "@/domain/rally/replay";
import type { MatchEndEvent, RallyEndEvent, RallyEvent, SetStartEvent, TeamSide, TouchEvent, VoidEvent } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { getDeviceId } from "./device-service";
import { getMatch } from "./match-service";
import { enqueue } from "./outbox-service";

/**
 * Ledger de eventos de rali. Só existem operações de append:
 * correções são feitas com voidEvent(), que grava um evento compensatório.
 *
 * Quem decide QUAIS eventos gravar são os planejadores puros (`domain/rally/plan-events.ts`). Aqui
 * eles rodam sobre o ledger lido dentro da transação; a tela de scout roda os mesmos planejadores
 * sobre o ledger em memória e grava só com `persistEvents` (Fase 14).
 */

export type { FinishMatchInput, MatchScope, RallyEndInput, TouchInput };

export async function listMatchEvents(db: ScoutDB, { tenant_id, match_id }: MatchScope): Promise<RallyEvent[]> {
  const events = await db.rally_events
    .where("[match_id+local_seq]")
    .between([match_id, -Infinity], [match_id, Infinity])
    .toArray();
  return events.filter((e) => e.tenant_id === tenant_id);
}

/**
 * Grava eventos já planejados, na ordem, com o outbox, numa transação que toca SÓ `rally_events` e
 * `outbox` (nada de releitura do ledger nem replay aqui dentro: transação curta, pouca disputa).
 * Idempotente: se todos os eventos já estão gravados (retentativa depois de um commit cujo retorno
 * se perdeu), não faz nada. Um lote nunca fica pela metade.
 */
export function persistEvents(db: ScoutDB, events: readonly RallyEvent[]): Promise<void> {
  if (events.length === 0) return Promise.resolve();
  return db.transaction("rw", db.rally_events, db.outbox, async () => {
    const existing = await db.rally_events.bulkGet(events.map((e) => e.id));
    if (existing.every(Boolean)) return;
    if (existing.some(Boolean)) throw new Error("Lote de lances gravado pela metade: recarregue a partida.");
    await db.rally_events.bulkAdd([...events]);
    for (const event of events) await enqueue(db, "rally_event", event);
  });
}

function ledgerTransaction<T>(db: ScoutDB, fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", [db.matches, db.rally_events, db.outbox, db.meta], fn);
}

async function loadDraft(db: ScoutDB, scope: MatchScope): Promise<LedgerDraft> {
  const match = await getMatch(db, scope.tenant_id, scope.match_id);
  if (!match) throw new Error(`Partida ${scope.match_id} não encontrada.`);
  const events = await listMatchEvents(db, scope);
  return new LedgerDraft(events, { scope, match, device_id: await getDeviceId(db), newId, now: Date.now });
}

/** Carrega o ledger, planeja o comando e grava o que ele produziu, tudo na mesma transação. */
function command<T>(db: ScoutDB, scope: MatchScope, plan: (draft: LedgerDraft) => T): Promise<T> {
  return ledgerTransaction(db, async () => {
    const draft = await loadDraft(db, scope);
    const result = plan(draft);
    await persistEvents(db, draft.added);
    return result;
  });
}

export async function getMatchState(db: ScoutDB, scope: MatchScope): Promise<MatchState> {
  const match = await getMatch(db, scope.tenant_id, scope.match_id);
  if (!match) throw new Error(`Partida ${scope.match_id} não encontrada.`);
  const events = await listMatchEvents(db, scope);
  return new LedgerDraft(events, { scope, match, device_id: "", newId, now: Date.now }).state();
}

export function appendTouch(db: ScoutDB, scope: MatchScope, input: TouchInput): Promise<TouchEvent> {
  return command(db, scope, (d) => planTouch(d, input));
}

export function appendRallyEnd(db: ScoutDB, scope: MatchScope, input: RallyEndInput): Promise<RallyEndEvent> {
  return command(db, scope, (d) => planRallyEnd(d, input));
}

export function voidEvent(db: ScoutDB, scope: MatchScope, event_id: string): Promise<VoidEvent> {
  return command(db, scope, (d) => planVoid(d, event_id));
}

/**
 * Desfaz a última ação válida da partida (toque ou fim de rali). Retorna null se não há o que desfazer.
 * Ponto resolvido por "Como foi o ponto?" no modo detalhado (resolvePoint) volta inteiro: anula o fim
 * e as cópias corrigidas e regrava os toques originais, como estavam antes do "Ponto".
 */
export function undoLastAction(db: ScoutDB, scope: MatchScope): Promise<VoidEvent | null> {
  return command(db, scope, planUndoLastAction);
}

/**
 * Modo rápido: grava o rali inteiro (todos os toques + fim do rali) numa única transação, na ordem.
 * Se houver um rali aberto (ex.: começado no modo detalhado), os toques entram nele.
 */
export function appendRally(
  db: ScoutDB,
  scope: MatchScope,
  touches: TouchInput[],
  end: RallyEndInput,
): Promise<{ touches: TouchEvent[]; end: RallyEndEvent }> {
  return command(db, scope, (d) => planRally(d, touches, end));
}

/**
 * Modo detalhado, "Como foi o ponto?": aplica o plano de resolveDetailedPoint numa transação —
 * anula o trecho final do rali aberto, regrava as cópias corrigidas e os toques novos (marcados com
 * `via_point`) e fecha o rali. Nada é alterado nem apagado.
 */
export function resolvePoint(db: ScoutDB, scope: MatchScope, plan: DetailedPointPlan): Promise<RallyEndEvent> {
  return command(db, scope, (d) => planResolvePoint(d, plan));
}

/**
 * Modo rápido: desfaz o ÚLTIMO RALI inteiro (anula todos os seus eventos ativos) e devolve os toques,
 * para o analista corrigir "como foi o ponto". Nada é apagado: só eventos de anulação são gravados.
 */
export function undoLastRally(db: ScoutDB, scope: MatchScope): Promise<TouchEvent[]> {
  return command(db, scope, planUndoLastRally);
}

/**
 * Quem começa sacando no set atual (sorteio no início do jogo ou do set decisivo). Só antes do
 * primeiro ponto do set e sem rali em andamento. Grava um evento no ledger: dá para desfazer.
 */
export function chooseServer(db: ScoutDB, scope: MatchScope, serving_team: TeamSide): Promise<SetStartEvent | null> {
  return command(db, scope, (d) => planChooseServer(d, serving_team));
}

export interface RallyInput {
  touches: TouchInput[];
  end: RallyEndInput;
}

/**
 * Grava vários ralis completos numa ÚNICA transação (geração/carga em lote). O estado é reconstruído em memória
 * entre um rali e outro, com as mesmas regras de `appendRally`. `next(state)` devolve o próximo rali ou `null`
 * para parar; para sozinho quando a partida termina. Devolve o estado final.
 */
export function appendRallies(db: ScoutDB, scope: MatchScope, next: (state: MatchState) => RallyInput | null): Promise<MatchState> {
  return command(db, scope, (d) => {
    for (;;) {
      const state = d.state();
      const rally = state.winner ? null : next(state);
      if (!rally) return state;
      planRally(d, rally.touches, rally.end);
    }
  });
}

/**
 * Encerra a partida manualmente (lesão, chuva, W.O., set único…). O rali aberto é descartado no replay e o set
 * em andamento fica interrompido. Desfazer (anular este evento) reabre a partida.
 */
export function finishMatch(db: ScoutDB, scope: MatchScope, input: FinishMatchInput): Promise<MatchEndEvent> {
  return command(db, scope, (d) => planFinishMatch(d, input));
}
