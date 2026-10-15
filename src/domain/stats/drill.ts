import { MOMENT_LABEL, type TouchFact } from "./facts";
import { duelLabel, outcomeLabel, touchLabel, typeLabel } from "./fact-labels";
import { addCounters, emptyTouchCounters, type TouchCounters, type TouchDelta } from "./touch-lines";

/**
 * Drill-down (Fase 15): abre qualquer número das tabelas em "de onde ele veio". `drill` é a
 * contribuição de cada lance à coluna (stat-columns.ts); aqui só se filtra e agrupa. Puro.
 */

export type DrillDimension = "type" | "outcome" | "opponent" | "set" | "moment" | "phase" | "touch" | "match" | "athlete";

export const DIMENSION_LABEL: Record<DrillDimension, string> = {
  type: "Tipo",
  outcome: "Resultado",
  opponent: "Adversário",
  set: "Set",
  moment: "Momento",
  phase: "K1/K2",
  touch: "Toque na posse",
  match: "Partida",
  athlete: "Atleta",
};

export interface DrillRow {
  key: string;
  label: string;
  count: number;
  /** Fração do total (0–1); total 0 = 0. */
  share: number;
  /**
   * Contadores brutos do grupo (só com `withCounters`): permitem calcular a MESMA coluna dentro do
   * grupo — ex.: a eficiência de ataque de cada partida, para achar o pico.
   */
  counters?: TouchCounters;
}

export interface DrillOccurrence {
  match_id: string;
  set_number: number;
  rally_number: number;
  score_own: number;
  score_opp: number;
  athlete_id: string;
  label: string;
  /** Duelo: "Bloqueou Vinícius" (quando o ledger tem o toque da adversária). */
  duel: string | null;
  count: number;
}

export interface DrillResult {
  total: number;
  rows: DrillRow[];
  /** Os lances, na ordem do jogo (no máximo `limit`). */
  occurrences: DrillOccurrence[];
}

export interface DrillOptions {
  /** Rótulo do tipo como "onde foi o erro" (colunas de erro). */
  errors?: boolean;
  matchLabel?: (match_id: string) => string;
  athleteLabel?: (athlete_id: string) => string;
  limit?: number;
  /** Soma os contadores de cada grupo (para a taxa por grupo). */
  withCounters?: boolean;
}

function keyOf(f: TouchFact, dimension: DrillDimension, o: DrillOptions): [string, string] {
  switch (dimension) {
    case "type": {
      const l = typeLabel(f, o.errors);
      return [l, l];
    }
    case "outcome": {
      const l = outcomeLabel(f);
      return [l, l];
    }
    case "opponent":
      return f.opponent_id ? [f.opponent_id, o.athleteLabel?.(f.opponent_id) ?? f.opponent_id.slice(0, 6)] : ["", "Sem adversária registrada"];
    case "set":
      return [String(f.set_number), `Set ${f.set_number}`];
    case "moment":
      return [f.clutch ? "clutch" : f.moment, f.clutch ? "Fim apertado (clutch)" : MOMENT_LABEL[f.moment]];
    case "phase":
      return [f.phase, f.phase === "side_out" ? "K1 — virada de bola" : "K2 — contra-ataque/saque"];
    case "touch":
      return [String(Math.min(f.touch_in_possession, 3)), touchLabel(f.touch_in_possession)];
    case "match":
      return [f.match_id, o.matchLabel?.(f.match_id) ?? f.match_id.slice(0, 6)];
    case "athlete":
      return [f.athlete_id, o.athleteLabel?.(f.athlete_id) ?? f.athlete_id.slice(0, 6)];
  }
}

const ORDERED: Partial<Record<DrillDimension, (a: string, b: string) => number>> = {
  set: (a, b) => Number(a) - Number(b),
  moment: (a, b) => ["start", "middle", "final", "clutch"].indexOf(a) - ["start", "middle", "final", "clutch"].indexOf(b),
  touch: (a, b) => Number(a) - Number(b),
};

export function drillDown(
  facts: readonly TouchFact[],
  drill: (d: TouchDelta) => number,
  dimension: DrillDimension,
  options: DrillOptions = {},
): DrillResult {
  const groups = new Map<string, DrillRow>();
  const occurrences: DrillOccurrence[] = [];
  const limit = options.limit ?? 60;
  let total = 0;
  for (const f of facts) {
    const count = drill(f.delta);
    if (!count) continue;
    total += count;
    const [key, label] = keyOf(f, dimension, options);
    const row = groups.get(key) ?? { key, label, count: 0, share: 0, ...(options.withCounters ? { counters: emptyTouchCounters() } : {}) };
    row.count += count;
    if (row.counters) addCounters(row.counters, f.delta);
    groups.set(key, row);
    if (occurrences.length < limit) {
      occurrences.push({
        match_id: f.match_id,
        set_number: f.set_number,
        rally_number: f.rally_number,
        score_own: f.score_own,
        score_opp: f.score_opp,
        athlete_id: f.athlete_id,
        label: typeLabel(f, options.errors),
        duel: duelLabel(f, options.athleteLabel ?? ((id) => id.slice(0, 6))),
        count,
      });
    }
  }
  const order = ORDERED[dimension];
  const rows = [...groups.values()]
    .map((r) => ({ ...r, share: total ? r.count / total : 0 }))
    .sort(order ? (a, b) => order(a.key, b.key) : (a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  return { total, rows, occurrences };
}

/** Recortes dos fatos: uma atleta, uma dupla (pair_key) ou um lado de uma partida. */
export type FactScope = { athlete_id: string } | { pair_key: string } | { match_id: string; team: "A" | "B" } | "all";

export function factsIn(facts: readonly TouchFact[], scope: FactScope): readonly TouchFact[] {
  if (scope === "all") return facts;
  if ("athlete_id" in scope) return facts.filter((f) => f.athlete_id === scope.athlete_id);
  if ("pair_key" in scope) return facts.filter((f) => f.pair_key === scope.pair_key);
  return facts.filter((f) => f.match_id === scope.match_id && f.team === scope.team);
}

/** Colunas cujo "tipo" é "onde foi o erro". */
export const ERROR_COLUMNS = new Set([
  "atk_errors",
  "atk_blocked",
  "atk_err_pct",
  "srv_errors",
  "srv_errors_net",
  "srv_errors_out",
  "srv_err_pct",
  "rec_errors",
  "rec_err_pct",
  "blk_errors",
  "dig_errors",
  "set_errors",
  "errors",
  "points_given",
  "faults",
]);
