import type { TouchDelta } from "./touch-lines";
import { duelLabel, typeLabel } from "./fact-labels";
import type { TouchFact } from "./facts";
import type { RallyFact } from "./rally-facts";

/**
 * Ocorrências (Fase 19): "o quê, em qual jogo e em qual placar" de qualquer barra do painel. Parte
 * dos MESMOS fatos do drill-down (`TouchFact`) e do espelho tático (`RallyFact`), então a quantidade
 * de ocorrências de uma linha é sempre o `count` dela. Puro.
 */

export interface Occurrence {
  match_id: string;
  set_number: number;
  rally_number: number;
  /** Placar do set antes do rali, do ponto de vista de quem é analisado. */
  score_own: number;
  score_opp: number;
  label: string;
  /** Duelo/ator: "Bloqueado por Ana" (quando o ledger tem o toque do outro lado). */
  duel: string | null;
  /** Quem fez o lance (atleta analisada, culpada ou autora), quando há. */
  athlete_id: string | null;
  /** Do outro lado do ponto (quem pontuou sobre ela, ou quem errou/sofreu), quando há lance. */
  opponent_id?: string | null;
  /** Peso do lance na coluna (quase sempre 1). */
  count: number;
}

export interface OccurrenceOptions {
  /** Rótulo do lance (padrão: o tipo do drill-down). */
  label?: (f: TouchFact) => string;
  /** Rótulo do tipo como "onde foi o erro". */
  errors?: boolean;
  athleteLabel?: (id: string) => string;
}

/** Lances que somam à coluna (`drill`), na ordem do jogo. */
export function touchOccurrences(facts: readonly TouchFact[], drill: (d: TouchDelta) => number, o: OccurrenceOptions = {}): Occurrence[] {
  const out: Occurrence[] = [];
  for (const f of facts) {
    const count = drill(f.delta);
    if (!count) continue;
    out.push({
      match_id: f.match_id,
      set_number: f.set_number,
      rally_number: f.rally_number,
      score_own: f.score_own,
      score_opp: f.score_opp,
      label: o.label ? o.label(f) : typeLabel(f, o.errors),
      duel: duelLabel(f, o.athleteLabel ?? ((id) => id.slice(0, 6))),
      athlete_id: f.athlete_id,
      count,
    });
  }
  return out;
}

/**
 * Ralis pela leitura de um lado: `conceded` = quem perdeu (placar dela, ator = culpada);
 * `merit` = quem ganhou (ator = autora do ponto).
 */
export function rallyOccurrences(rallies: readonly RallyFact[], side: "merit" | "conceded"): Occurrence[] {
  return rallies.map((f) => ({
    match_id: f.match_id,
    set_number: f.set_number,
    rally_number: f.rally_number,
    score_own: side === "conceded" ? f.score_loser : f.score_winner,
    score_opp: side === "conceded" ? f.score_winner : f.score_loser,
    label: f[side],
    duel: null,
    athlete_id: side === "conceded" ? f.culprit : f.scorer,
    opponent_id: side === "conceded" ? f.scorer : f.culprit,
    count: 1,
  }));
}

export interface MatchOccurrences {
  match_id: string;
  total: number;
  items: Occurrence[];
}

/**
 * Agrupa por partida. Dentro do jogo, em ordem de set e rali; os jogos seguem `rank` (ex.: data)
 * ou a ordem em que aparecem.
 */
export function groupByMatch(occ: readonly Occurrence[], rank?: (match_id: string) => number): MatchOccurrences[] {
  const groups = new Map<string, MatchOccurrences>();
  for (const o of occ) {
    const g = groups.get(o.match_id) ?? { match_id: o.match_id, total: 0, items: [] };
    g.total += o.count;
    g.items.push(o);
    groups.set(o.match_id, g);
  }
  const list = [...groups.values()];
  for (const g of list) g.items.sort((a, b) => a.set_number - b.set_number || a.rally_number - b.rally_number);
  if (rank) list.sort((a, b) => rank(a.match_id) - rank(b.match_id));
  return list;
}
