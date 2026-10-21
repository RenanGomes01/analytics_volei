import type { Rate } from "@/domain/stats/types";

/**
 * Tradução dos números para o técnico (Fase 16): "K1 88% 14/16" vira "14 viradas em 16 recepções".
 * Plural certo e denominador 0 com texto próprio. Puro (testado).
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function explainSideOut(r: Rate): string {
  if (r.den === 0) return "nenhum saque recebido ainda";
  return `${plural(r.num, "virada", "viradas")} de bola em ${plural(r.den, "saque recebido", "saques recebidos")}`;
}

export function explainBreakPoint(r: Rate): string {
  if (r.den === 0) return "nenhum saque ainda";
  return `${plural(r.num, "ponto", "pontos")} sacando em ${plural(r.den, "saque", "saques")}`;
}

export function explainEfficiency({ kills, errors, attempts }: { kills: number; errors: number; attempts: number }): string {
  if (attempts === 0) return "nenhum ataque ainda";
  return `(${plural(kills, "ponto", "pontos")} − ${plural(errors, "erro", "erros")}) ÷ ${plural(attempts, "ataque", "ataques")}`;
}

export function explainPass(r: Rate, beach: boolean): string {
  if (r.den === 0) return "nenhuma recepção avaliada ainda";
  return `${plural(r.num, beach ? "passe na mão" : "passe bom", beach ? "passes na mão" : "passes bons")} em ${plural(r.den, "recepção avaliada", "recepções avaliadas")}`;
}


const share = (x: number) => `${Math.round(x * 100)}%`;
const decimal = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Raio-X (Fase 19): "6 de 15 pontos cedidos (40%) · 1,5 por jogo". */
export function explainWeakness({ count, share: s, perMatch }: { count: number; share: number; perMatch: number | null }, total: number): string {
  if (total === 0) return "nenhum ponto cedido ainda";
  return `${count} de ${plural(total, "ponto cedido", "pontos cedidos")} (${share(s)})${perMatch !== null ? ` · ${decimal(perMatch)} por jogo` : ""}`;
}

/** Maior arma (Fase 19; dupla na Fase 21): "8 pontos · 30% dos pontos dela". */
export function explainWeapon({ count, share: s }: { count: number; share: number }, subject: "athlete" | "team" = "athlete"): string {
  return `${plural(count, "ponto", "pontos")} · ${share(s)} ${subject === "team" ? "dos pontos de ataque, saque e bloqueio da dupla" : "dos pontos dela"}`;
}

/** Mais letal (Fase 19): "6 pontos em 10 ataques (60% de aproveitamento)". */
export function explainLethal({ kills, attempts, killRate }: { kills: number; attempts: number; killRate: number }): string {
  return `${plural(kills, "ponto", "pontos")} em ${plural(attempts, "ataque", "ataques")} (${share(killRate)} de aproveitamento)`;
}
