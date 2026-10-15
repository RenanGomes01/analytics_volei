import { POINT_DETAIL_LABEL } from "../rally/quick-rally";
import type { RallyResult } from "../rally/replay";
import type { TeamSide, TouchEvent } from "../types";
import { attackLabel, errorLabel } from "./fact-labels";
import type { Moment } from "./facts";
import type { PointsBreakdown } from "./types";

/**
 * Espelho tático (Fase 16): cada rali fechado é classificado UMA vez, com as duas leituras — o
 * mérito de quem ganhou e o espelho em quem perdeu ("Explorou o bloqueio" ↔ "Bloqueio explorado").
 * Como as duas telas leem o mesmo fato, o espelho bate por construção: A fez 4 → B cedeu 4.
 * O `group` é o mesmo de `pointCategory` (rally-lines.ts), então a soma ainda é o placar. Puro.
 */

export type PointGroup = Exclude<keyof PointsBreakdown, "total">;

/** own = o ponto veio de erro de quem perdeu; opponent = mérito de quem ganhou; none = sem detalhe. */
export type Fault = "own" | "opponent" | "none";

export interface RallyCause {
  /** Código estável (mesmo código = mesma linha nos dois lados). */
  code: string;
  group: PointGroup;
  /** Como quem GANHOU lê o ponto. */
  merit: string;
  /** Como quem PERDEU lê o ponto (o espelho). */
  conceded: string;
  fault: Fault;
  /** Quem fez o ponto (atacante, sacadora, bloqueadora), quando há lance. */
  scorer: string | null;
  /** Quem errou ou sofreu (quem errou, o atacante bloqueado, a receptora do ace), quando há lance. */
  culprit: string | null;
}

export interface RallyFact extends RallyCause {
  match_id: string;
  tournament_id: string | null;
  set_number: number;
  rally_number: number;
  winner: TeamSide;
  loser: TeamSide;
  winner_key: string;
  loser_key: string;
  serving_team: TeamSide;
  /** Placar antes do rali, do ponto de vista de quem ganhou. */
  score_winner: number;
  score_loser: number;
  moment: Moment;
  clutch: boolean;
}

/** Posição de cada toque na posse da sua equipe (1, 2, 3…). */
function positions(touches: readonly TouchEvent[]): number[] {
  const out: number[] = [];
  touches.forEach((t, i) => out.push(i > 0 && touches[i - 1].team === t.team ? out[i - 1] + 1 : 1));
  return out;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Saque fora" → "Erro do adversário: saque fora"; "Erro de levantamento (x)" → "…: levantamento (x)"; "Falta: x" → "…: falta (x)". */
function meritOfError(where: string): string {
  const fault = /^Falta: (.+)$/.exec(where);
  if (fault) return `Erro do adversário: falta (${fault[1]})`;
  return `Erro do adversário: ${lower(where.replace(/^Erro (de|na|no) /, ""))}`;
}

/** "Largada de segunda" → "Largada de segunda sofrida"; "Ataque (3º toque)" → "Ataque (3º toque) não defendido". */
function sufferedAttack(label: string): string {
  if (label.startsWith("Largada")) return `${label} sofrida`;
  return `${label} não defendido`;
}

export function classifyRally(r: RallyResult): RallyCause | null {
  if (!r.point_to) return null;
  const winner = r.point_to;
  const loser: TeamSide = winner === "A" ? "B" : "A";
  const touches = r.touches;
  const pos = positions(touches);
  const i = touches.length - 1;
  const last = touches[i];
  const by = (t: TouchEvent | undefined, side: TeamSide) => (t && t.team === side ? t.athlete_id : null);

  switch (r.reason) {
    case "ace": {
      const serve = touches[0]?.skill === "serve" ? touches[0] : undefined;
      const reception = touches.find((t) => t.team === loser && t.skill === "reception");
      return { code: "ace", group: "aces", merit: "Ace", conceded: "Ace sofrido", fault: "opponent", scorer: by(serve, winner), culprit: reception?.athlete_id ?? null };
    }
    case "kill": {
      // O grupo segue pointCategory (rally-lines.ts): bloqueio só se o ÚLTIMO toque é bloqueio. Assim a
      // soma continua sendo o placar.
      const group: PointGroup = last?.skill === "block" ? "blocks" : "kills";
      // A causa vem do toque DECISIVO de quem ganhou (o último dele), não do último toque do rali: no
      // "ataque # → defesa = do adversário → ponto", o último toque é a defesa que falhou.
      let d = touches.length - 1;
      while (d >= 0 && touches[d].team !== winner) d -= 1;
      const decisive = d >= 0 ? touches[d] : undefined;
      // Quem perdeu e tocou depois do lance decisivo (a defesa que não segurou) é quem sofreu o ponto.
      const after = touches.slice(d + 1).find((t) => t.team === loser);
      if (decisive?.skill === "block") {
        // Bloqueio # para ponto: o espelho é o ataque bloqueado de quem atacou antes.
        const attacker = touches.slice(0, d).reverse().find((t) => t.team === loser);
        return { code: "block_point", group, merit: "Ponto de bloqueio", conceded: "Ataque bloqueado", fault: "own", scorer: decisive.athlete_id, culprit: attacker?.athlete_id ?? null };
      }
      if (decisive?.skill === "attack") {
        if (decisive.detail === "block_out") {
          // A bloqueadora explorada só é conhecida se o toque de bloqueio foi registrado.
          const blocker = [...touches.slice(0, d)].reverse().find((t) => t.team === loser && t.skill === "block") ?? (after?.skill === "block" ? after : undefined);
          return { code: "block_out", group, merit: "Explorou o bloqueio", conceded: "Bloqueio explorado", fault: "opponent", scorer: decisive.athlete_id, culprit: blocker?.athlete_id ?? null };
        }
        const label = attackLabel({ skill: "attack", detail: decisive.detail, touch_in_possession: pos[d], delta: {}, quality: decisive.quality });
        return { code: `attack:${label}`, group, merit: label, conceded: sufferedAttack(label), fault: "opponent", scorer: decisive.athlete_id, culprit: after?.athlete_id ?? null };
      }
      return { code: "kill_other", group, merit: "Ponto direto", conceded: "Ponto direto do adversário", fault: "opponent", scorer: decisive?.athlete_id ?? null, culprit: after?.athlete_id ?? null };
    }
    case "four_touches":
      return { code: "four_touches", group: "opponent_errors", merit: "Erro do adversário: 4 toques", conceded: "4 toques", fault: "own", scorer: null, culprit: by(last, loser) };
    case "error": {
      if (!last) return { code: "error", group: "opponent_errors", merit: "Erro do adversário", conceded: "Erro", fault: "own", scorer: null, culprit: null };
      const where = errorLabel({ skill: last.skill, detail: last.detail, touch_in_possession: pos[i], delta: {}, quality: last.quality });
      return { code: `err:${where}`, group: "opponent_errors", merit: meritOfError(where), conceded: where, fault: "own", scorer: null, culprit: by(last, loser) };
    }
    default: {
      // Ponto marcado (modo rápido "Falta" com detalhe, ou "Não vi como foi").
      if (r.detail) {
        const label = POINT_DETAIL_LABEL[r.detail];
        return { code: `fault:${r.detail}`, group: "opponent_errors", merit: `Erro do adversário: falta (${label})`, conceded: `Falta: ${label}`, fault: "own", scorer: null, culprit: null };
      }
      return { code: "unseen", group: "opponent_errors", merit: "Ponto sem detalhe", conceded: "Ponto cedido sem detalhe", fault: "none", scorer: null, culprit: null };
    }
  }
}

/** Recortes dos ralis: uma dupla (ganhou ou perdeu), um lado de uma partida ou tudo. */
export type RallyScope = { pair_key: string } | { match_id: string; team: TeamSide } | "all";

const wonBy = (f: RallyFact, s: RallyScope) =>
  s === "all" || ("pair_key" in s ? f.winner_key === s.pair_key : f.match_id === s.match_id && f.winner === s.team);
const lostBy = (f: RallyFact, s: RallyScope) =>
  s === "all" || ("pair_key" in s ? f.loser_key === s.pair_key : f.match_id === s.match_id && f.loser === s.team);

export const pointsWon = (facts: readonly RallyFact[], s: RallyScope) => facts.filter((f) => wonBy(f, s));
export const pointsConceded = (facts: readonly RallyFact[], s: RallyScope) => facts.filter((f) => lostBy(f, s));

export interface CauseRow {
  code: string;
  label: string;
  count: number;
  share: number;
  fault: Fault;
  /** Quem mais aparece como ator nesta causa (culpada nos cedidos, autora nos pontos). */
  leader: { athlete_id: string; count: number } | null;
}

/** Agrupa ralis pela leitura de um lado (merit = quem ganhou, conceded = quem perdeu). */
export function causeRows(facts: readonly RallyFact[], side: "merit" | "conceded"): CauseRow[] {
  const groups = new Map<string, { row: CauseRow; actors: Map<string, number> }>();
  for (const f of facts) {
    const g = groups.get(f.code) ?? { row: { code: f.code, label: f[side], count: 0, share: 0, fault: f.fault, leader: null }, actors: new Map() };
    g.row.count += 1;
    const actor = side === "merit" ? f.scorer : f.culprit;
    if (actor) g.actors.set(actor, (g.actors.get(actor) ?? 0) + 1);
    groups.set(f.code, g);
  }
  const total = facts.length;
  return [...groups.values()]
    .map(({ row, actors }) => {
      let leader: CauseRow["leader"] = null;
      for (const [athlete_id, count] of actors) if (!leader || count > leader.count) leader = { athlete_id, count };
      return { ...row, share: total ? row.count / total : 0, leader };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

export interface MirrorRow {
  code: string;
  merit: string;
  conceded: string;
  count: number;
  fault: Fault;
}

/** Espelho de uma direção: o que `scope` ganhou e, na mesma linha, como o adversário cedeu. */
export function mirrorRows(facts: readonly RallyFact[], scope: RallyScope): MirrorRow[] {
  const rows = new Map<string, MirrorRow>();
  for (const f of pointsWon(facts, scope)) {
    const r = rows.get(f.code) ?? { code: f.code, merit: f.merit, conceded: f.conceded, count: 0, fault: f.fault };
    r.count += 1;
    rows.set(f.code, r);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.merit.localeCompare(b.merit, "pt-BR"));
}

/** Pontos cedidos por atleta (ela é a culpada) e os da dupla sem atleta identificável. */
export function concededByAthlete(facts: readonly RallyFact[]): { byAthlete: Map<string, number>; unattributed: number } {
  const byAthlete = new Map<string, number>();
  let unattributed = 0;
  for (const f of facts) {
    if (f.culprit) byAthlete.set(f.culprit, (byAthlete.get(f.culprit) ?? 0) + 1);
    else unattributed += 1;
  }
  return { byAthlete, unattributed };
}
