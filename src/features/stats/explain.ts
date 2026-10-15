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

