import { newId } from "@/lib/id";
import { phaseForTouch } from "@/domain/rally/phase";
import { activeEvents, replayMatch, type MatchState } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import type {
  RallyEndEvent,
  RallyEndReason,
  RallyEvent,
  PointDetail,
  RallyEventBase,
  SetStartEvent,
  TeamSide,
  TouchEvent,
  VoidEvent,
} from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { getDeviceId } from "./device-service";
import { getMatch } from "./match-service";
import { enqueue } from "./outbox-service";

/**
 * Ledger de eventos de rali. Só existem operações de append:
 * correções são feitas com voidEvent(), que grava um evento compensatório.
 */

export interface MatchScope {
  tenant_id: string;
  match_id: string;
}

export type TouchInput = Pick<TouchEvent, "team" | "athlete_id" | "skill" | "quality" | "detail">;

export interface RallyEndInput {
  point_to: TeamSide;
  reason: RallyEndReason;
  detail?: PointDetail;
}

export async function listMatchEvents(db: ScoutDB, { tenant_id, match_id }: MatchScope): Promise<RallyEvent[]> {
  const events = await db.rally_events
    .where("[match_id+local_seq]")
    .between([match_id, -Infinity], [match_id, Infinity])
    .toArray();
  return events.filter((e) => e.tenant_id === tenant_id);
}

async function loadMatchContext(db: ScoutDB, scope: MatchScope) {
  const match = await getMatch(db, scope.tenant_id, scope.match_id);
  if (!match) throw new Error(`Partida ${scope.match_id} não encontrada.`);
  const rules = rulesFor(match.modality);
  const events = await listMatchEvents(db, scope);
  const state = replayMatch(events, { rules, first_server: match.first_server });
  const local_seq = Math.max(0, ...events.map((e) => e.local_seq)) + 1;
  return { rules, state, local_seq };
}

export async function getMatchState(db: ScoutDB, scope: MatchScope): Promise<MatchState> {
  return (await loadMatchContext(db, scope)).state;
}

/** Campos comuns do próximo evento: continua o rali aberto ou abre um novo no set atual. */
async function nextEventBase(
  db: ScoutDB,
  scope: MatchScope,
  state: MatchState,
  local_seq: number,
): Promise<RallyEventBase> {
  const open = state.open_rally;
  const set_number = open?.set_number ?? state.current_set;
  return {
    ...scope,
    id: newId(),
    set_id: `${scope.match_id}:s${set_number}`,
    set_number,
    rally_id: open?.rally_id ?? newId(),
    rally_number: open?.rally_number ?? state.rallies.filter((r) => r.set_number === set_number).length + 1,
    local_seq,
    device_id: await getDeviceId(db),
    timestamp: Date.now(),
  };
}

function ledgerTransaction<T>(db: ScoutDB, fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", [db.matches, db.rally_events, db.outbox, db.meta], fn);
}

async function append<T extends RallyEvent>(db: ScoutDB, event: T): Promise<T> {
  await db.rally_events.add(event);
  await enqueue(db, "rally_event", event);
  return event;
}

export function appendTouch(db: ScoutDB, scope: MatchScope, input: TouchInput): Promise<TouchEvent> {
  return ledgerTransaction(db, async () => {
    const { rules, state, local_seq } = await loadMatchContext(db, scope);
    if (state.winner) throw new Error("Partida encerrada: não é possível registrar novos toques.");
    const phase = phaseForTouch(state.open_rally?.touches ?? [], input.team, state.serving_team, rules);
    const base = await nextEventBase(db, scope, state, local_seq);
    return append(db, { ...base, ...input, kind: "touch", phase });
  });
}

export function appendRallyEnd(db: ScoutDB, scope: MatchScope, input: RallyEndInput): Promise<RallyEndEvent> {
  return ledgerTransaction(db, async () => {
    const { state, local_seq } = await loadMatchContext(db, scope);
    if (state.winner) throw new Error("Partida encerrada: não é possível registrar novos pontos.");
    const base = await nextEventBase(db, scope, state, local_seq);
    return append(db, { ...base, ...input, kind: "rally_end" });
  });
}

export function voidEvent(db: ScoutDB, scope: MatchScope, event_id: string): Promise<VoidEvent> {
  return ledgerTransaction(db, async () => {
    const { local_seq } = await loadMatchContext(db, scope);
    const target = await db.rally_events.get(event_id);
    if (!target || target.tenant_id !== scope.tenant_id || target.match_id !== scope.match_id) {
      throw new Error(`Evento ${event_id} não encontrado nesta partida.`);
    }
    if (target.kind === "void") throw new Error("Não é possível anular uma anulação; registre o evento novamente.");
    const alreadyVoided = await db.rally_events
      .where("rally_id")
      .equals(target.rally_id)
      .filter((e) => e.kind === "void" && e.voids_event_id === event_id)
      .count();
    if (alreadyVoided) throw new Error(`Evento ${event_id} já foi anulado.`);

    return append(db, {
      ...scope,
      id: newId(),
      set_id: target.set_id,
      set_number: target.set_number,
      rally_id: target.rally_id,
      rally_number: target.rally_number,
      local_seq,
      device_id: await getDeviceId(db),
      timestamp: Date.now(),
      kind: "void",
      voids_event_id: event_id,
    });
  });
}

/** Desfaz a última ação válida da partida (toque ou fim de rali). Retorna null se não há o que desfazer. */
export function undoLastAction(db: ScoutDB, scope: MatchScope): Promise<VoidEvent | null> {
  return ledgerTransaction(db, async () => {
    const last = activeEvents(await listMatchEvents(db, scope)).at(-1);
    return last ? voidEvent(db, scope, last.id) : null;
  });
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
  return ledgerTransaction(db, async () => {
    const { rules, state, local_seq } = await loadMatchContext(db, scope);
    if (state.winner) throw new Error("Partida encerrada: não é possível registrar novos pontos.");
    const base = await nextEventBase(db, scope, state, local_seq);
    const rallyTouches: TouchEvent[] = [...(state.open_rally?.touches ?? [])];
    const written: TouchEvent[] = [];
    let offset = 0;
    // Cada evento ganha id próprio e local_seq/horário sequenciais dentro do mesmo rali.
    const next = () => {
      const i = offset++;
      return { ...base, id: newId(), local_seq: local_seq + i, timestamp: base.timestamp + i };
    };

    for (const input of touches) {
      const phase = phaseForTouch(rallyTouches, input.team, state.serving_team, rules);
      const event = await append(db, { ...next(), ...input, kind: "touch", phase } satisfies TouchEvent);
      rallyTouches.push(event);
      written.push(event);
    }
    const endEvent = await append(db, { ...next(), ...end, kind: "rally_end" } satisfies RallyEndEvent);
    return { touches: written, end: endEvent };
  });
}

/**
 * Modo rápido: desfaz o ÚLTIMO RALI inteiro (anula todos os seus eventos ativos) e devolve os toques,
 * para o analista corrigir "como foi o ponto". Nada é apagado: só eventos de anulação são gravados.
 */
export function undoLastRally(db: ScoutDB, scope: MatchScope): Promise<TouchEvent[]> {
  return ledgerTransaction(db, async () => {
    const active = activeEvents(await listMatchEvents(db, scope));
    const last = active.at(-1);
    if (!last) return [];
    const inRally = active.filter((e) => e.rally_id === last.rally_id);
    for (const event of [...inRally].reverse()) await voidEvent(db, scope, event.id);
    return inRally.filter((e): e is TouchEvent => e.kind === "touch");
  });
}

/**
 * Quem começa sacando no set atual (sorteio no início do jogo ou do set decisivo). Só antes do
 * primeiro ponto do set e sem rali em andamento. Grava um evento no ledger: dá para desfazer.
 */
export function chooseServer(db: ScoutDB, scope: MatchScope, serving_team: TeamSide): Promise<SetStartEvent | null> {
  return ledgerTransaction(db, async () => {
    const { state, local_seq } = await loadMatchContext(db, scope);
    if (state.winner) throw new Error("Partida encerrada.");
    const current = state.sets.at(-1)!;
    if (current.score.A + current.score.B > 0 || state.open_rally) {
      throw new Error("Só dá para escolher quem saca antes do primeiro ponto do set.");
    }
    if (state.serving_team === serving_team) return null;
    const base = await nextEventBase(db, scope, state, local_seq);
    return append(db, { ...base, kind: "set_start", serving_team } satisfies SetStartEvent);
  });
}
