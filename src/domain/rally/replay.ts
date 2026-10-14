import { isSetOver, type ModalityRules } from "../rules/modality";
import {
  otherTeam,
  type MatchEndEvent,
  type MatchEndReason,
  type RallyEndEvent,
  type RallyEndReason,
  type PointDetail,
  type RallyEvent,
  type SetStartEvent,
  type TeamSide,
  type TouchEvent,
} from "../types";
import { impliedPoint, type ImpliedPoint } from "./implied-point";
import { countTouches, type TouchCount } from "./touch-counter";

export interface ReplayOptions {
  rules: ModalityRules;
  first_server: TeamSide;
}

export interface Score {
  A: number;
  B: number;
}

export interface RallyResult {
  rally_id: string;
  set_number: number;
  rally_number: number;
  serving_team: TeamSide;
  touches: TouchEvent[];
  touch_count: TouchCount;
  /** null enquanto o rali está aberto. */
  point_to: TeamSide | null;
  reason: RallyEndReason | null;
  /** Detalhe de como foi o ponto (modo rápido), quando registrado. */
  detail: PointDetail | null;
}

export interface SetResult {
  set_number: number;
  first_server: TeamSide;
  score: Score;
  winner: TeamSide | null;
  /** Set interrompido por um encerramento manual da partida (fica sem vencedor). */
  interrupted?: boolean;
}

export interface MatchEnd {
  reason: MatchEndReason;
  note: string | null;
}

export interface MatchState {
  rallies: RallyResult[];
  /** Inclui o set em andamento (winner null). */
  sets: SetResult[];
  current_set: number;
  serving_team: TeamSide;
  sets_won: Score;
  winner: TeamSide | null;
  /** Último rali, se ainda não tem ponto. */
  open_rally: RallyResult | null;
  /** Preenchido quando a partida foi encerrada manualmente (match_end). */
  end: MatchEnd | null;
}

type ActiveEvent = TouchEvent | RallyEndEvent | SetStartEvent | MatchEndEvent;

const byLedgerOrder = (a: RallyEvent, b: RallyEvent) =>
  a.local_seq - b.local_seq || a.timestamp - b.timestamp || a.id.localeCompare(b.id);

/** Eventos válidos do ledger, em ordem: remove os VoidEvent e os eventos que eles anulam. */
export function activeEvents(events: readonly RallyEvent[]): ActiveEvent[] {
  const sorted = [...events].sort(byLedgerOrder);
  const voided = new Set(sorted.flatMap((e) => (e.kind === "void" ? [e.voids_event_id] : [])));
  return sorted.filter((e): e is ActiveEvent => e.kind !== "void" && !voided.has(e.id));
}

function groupByRally(events: readonly ActiveEvent[]): ActiveEvent[][] {
  const groups = new Map<string, ActiveEvent[]>();
  for (const event of events) {
    const group = groups.get(event.rally_id);
    if (group) group.push(event);
    else groups.set(event.rally_id, [event]);
  }
  return [...groups.values()];
}

/**
 * Reconstrói o estado da partida a partir do ledger. Determinístico: o mesmo ledger gera sempre o mesmo estado.
 * Um rali sem `rally_end` termina por violação de toques ou pela qualidade terminal do último lance (ver impliedPoint).
 */
export function replayMatch(events: readonly RallyEvent[], { rules, first_server }: ReplayOptions): MatchState {
  const rallies: RallyResult[] = [];
  const sets_won: Score = { A: 0, B: 0 };
  let currentSet: SetResult = { set_number: 1, first_server, score: { A: 0, B: 0 }, winner: null };
  const sets: SetResult[] = [currentSet];
  let serving_team = first_server;
  let winner: TeamSide | null = null;
  let rallyNumber = 0;
  let end: MatchEnd | null = null;

  for (const group of groupByRally(activeEvents(events))) {
    if (winner) break;

    // Encerramento manual: descarta o rali aberto e interrompe o set em andamento.
    const finish = group.find((e): e is MatchEndEvent => e.kind === "match_end");
    if (finish) {
      if (rallies.length > 0 && !rallies[rallies.length - 1].point_to) rallies.pop();
      const played = currentSet.score.A + currentSet.score.B > 0;
      if (!played && sets.length > 1) sets.pop();
      else if (!currentSet.winner) currentSet.interrupted = true;
      winner = finish.winner;
      end = { reason: finish.reason, note: finish.note ?? null };
      break;
    }

    // Escolha de quem saca: só vale antes do primeiro ponto do set.
    const choice = group.findLast((e): e is SetStartEvent => e.kind === "set_start");
    if (choice) {
      if (currentSet.score.A + currentSet.score.B === 0) {
        currentSet.first_server = choice.serving_team;
        serving_team = choice.serving_team;
      }
      continue;
    }

    const touches = group.filter((e): e is TouchEvent => e.kind === "touch");
    const rallyEnd = group.findLast((e): e is RallyEndEvent => e.kind === "rally_end");
    const touch_count = countTouches(touches, rules);
    const violator = touch_count.violation?.team;
    const lastTouch = touches.at(-1);
    // Precedência: rally_end explícito > violação de toques > qualidade terminal do último lance.
    const outcome: ImpliedPoint | null = rallyEnd
      ? { point_to: rallyEnd.point_to, reason: rallyEnd.reason }
      : violator
        ? { point_to: otherTeam(violator), reason: "four_touches" }
        : lastTouch
          ? impliedPoint(lastTouch, touches.at(-2))
          : null;
    const point_to = outcome?.point_to ?? null;

    rallies.push({
      rally_id: group[0].rally_id,
      set_number: currentSet.set_number,
      rally_number: ++rallyNumber,
      serving_team,
      touches,
      touch_count,
      point_to,
      reason: outcome?.reason ?? null,
      detail: rallyEnd?.detail ?? (point_to ? (lastTouch?.detail ?? null) : null),
    });
    if (!point_to) continue;

    currentSet.score[point_to] += 1;
    serving_team = point_to; // quem vence o rali saca
    if (!isSetOver(rules, currentSet.set_number, currentSet.score.A, currentSet.score.B)) continue;

    currentSet.winner = point_to;
    sets_won[point_to] += 1;
    if (sets_won[point_to] === rules.setsToWin) {
      winner = point_to;
      break;
    }
    // O saque inicial alterna a cada set; um set_start no 0×0 do set pode trocar (sorteio).
    const nextFirstServer = otherTeam(currentSet.first_server);
    currentSet = { set_number: currentSet.set_number + 1, first_server: nextFirstServer, score: { A: 0, B: 0 }, winner: null };
    sets.push(currentSet);
    serving_team = nextFirstServer;
    rallyNumber = 0;
  }

  const last = rallies.at(-1);
  return {
    rallies,
    sets,
    current_set: sets[sets.length - 1].set_number,
    serving_team,
    sets_won,
    winner,
    open_rally: last && !last.point_to ? last : null,
    end,
  };
}
