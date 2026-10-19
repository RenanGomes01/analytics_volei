import { drillDown, scoredBreakdown, type DrillRow } from "./drill";
import { attackLabel } from "./fact-labels";
import type { TouchFact } from "./facts";
import { causeRows, type Fault, type RallyFact } from "./rally-facts";
import { efficiency, rate } from "./rate";
import type { TouchDelta } from "./touch-lines";

/**
 * Raio-X da atleta (Fase 19): onde ela mais sangra e qual é a maior arma. Só lê as MESMAS fontes dos
 * cards "Pontos cedidos" (`causeRows`) e "Origem dos pontos" (`scoredBreakdown`), então a manchete
 * sempre bate com as barras. Abaixo do volume mínimo nada é "coroado". Puro.
 */

/** Ocorrências mínimas para apontar a maior fraqueza/arma. */
export const INSIGHT_MIN = 3;
/** Ataques mínimos de um tipo para disputar "mais letal". */
export const LETHAL_MIN_ATTEMPTS = 5;

export interface WeaknessRow {
  /** `RallyFact.code` (filtra as ocorrências). */
  key: string;
  label: string;
  count: number;
  /** Fração dos pontos cedidos por ela. */
  share: number;
  /** Média por jogo (null sem jogos). */
  perMatch: number | null;
  fault: Fault;
}

export interface Weaknesses {
  /** Pontos cedidos em que ela foi a culpada. */
  total: number;
  /** Quantos deles foram erro próprio. */
  own: number;
  /** O maior ralo (null com pouco volume). */
  main: WeaknessRow | null;
  /** As maiores causas (sem "sem detalhe"). */
  rows: WeaknessRow[];
}

/** Maior ralo de pontos: a causa mais frequente; no empate, o erro próprio (o que dá para treinar). */
export function weaknesses(conceded: readonly RallyFact[], matches: number, top = 3): Weaknesses {
  const total = conceded.length;
  const rows = causeRows(conceded, "conceded")
    .filter((r) => r.fault !== "none")
    .map((r) => ({ key: r.code, label: r.label, count: r.count, share: r.share, perMatch: matches > 0 ? r.count / matches : null, fault: r.fault }))
    .sort((a, b) => b.count - a.count || (a.fault === "own" ? 0 : 1) - (b.fault === "own" ? 0 : 1) || a.label.localeCompare(b.label, "pt-BR"));
  const first = rows[0];
  return {
    total,
    own: conceded.filter((f) => f.fault === "own").length,
    main: first && first.count >= INSIGHT_MIN ? first : null,
    rows: rows.slice(0, top),
  };
}

/** O que soma aos pontos da atleta (a mesma conta da coluna "Pts"). */
export const pointsDrill = (d: TouchDelta) => (d.kills ?? 0) + (d.aces ?? 0) + (d.blocks ?? 0);
/** Ataques (base do aproveitamento por tipo). */
export const attackDrill = (d: TouchDelta) => d.attack_attempts ?? 0;
/** Tipo de ataque sem separar o erro ("Largada de segunda", "Ataque (3º toque)"). */
export const lethalLabel = (f: TouchFact) => attackLabel(f);

export interface LethalAttack {
  label: string;
  kills: number;
  errors: number;
  attempts: number;
  killRate: number;
  efficiency: number | null;
}

export interface Weapon {
  /** Pontos dela no recorte. */
  total: number;
  /** A jogada que mais pontuou (null com pouco volume). */
  main: DrillRow | null;
  /** As jogadas que mais pontuaram (chave = rótulo de `scoredLabel`). */
  rows: DrillRow[];
  /** Tipo de ataque com o melhor aproveitamento (com volume mínimo). */
  lethal: LethalAttack | null;
}

export function weapon(facts: readonly TouchFact[], top = 3): Weapon {
  const scored = scoredBreakdown(facts);
  const first = scored.rows[0];
  let lethal: LethalAttack | null = null;
  for (const r of drillDown(facts, attackDrill, "type", { limit: 0, withCounters: true, label: lethalLabel }).rows) {
    const c = r.counters!;
    if (c.attack_attempts < LETHAL_MIN_ATTEMPTS || c.kills === 0) continue;
    const killRate = rate(c.kills, c.attack_attempts).pct!;
    if (!lethal || killRate > lethal.killRate || (killRate === lethal.killRate && c.attack_attempts > lethal.attempts)) {
      lethal = { label: r.label, kills: c.kills, errors: c.attack_errors, attempts: c.attack_attempts, killRate, efficiency: efficiency(c.kills, c.attack_errors, c.attack_attempts) };
    }
  }
  return { total: scored.total, main: first && first.count >= INSIGHT_MIN ? first : null, rows: scored.rows.slice(0, top), lethal };
}
