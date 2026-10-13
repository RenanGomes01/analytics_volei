import type { Quality, Skill } from "@/domain/types";

/**
 * Convenção de quadra da escala de qualidade, por fundamento (estilo Data Volley).
 * Fonte única do significado de cada símbolo: aparece embaixo dos botões de qualidade e é
 * documentada em docs/business_rules.md. Máximo de 20 caracteres por dica (teste garante).
 * Só `#` e `=` têm efeito de regra (ver domain/rally/implied-point.ts); os demais são convenção.
 */
export const QUALITY_HINTS: Record<Skill, Record<Quality, string>> = {
  serve: {
    "#": "Ace",
    "+": "Quebrou recepção",
    "!": "Recepção regular",
    "-": "Recepção fácil",
    "/": "Volta de graça",
    "=": "Erro de saque",
  },
  reception: {
    "#": "Passe perfeito",
    "+": "Passe bom",
    "!": "Levant. se desloca",
    "-": "Só bola alta",
    "/": "Volta de graça",
    "=": "Ace sofrido",
  },
  set: {
    "#": "Atacante livre",
    "+": "Boa bola",
    "!": "Atacável",
    "-": "Difícil de atacar",
    "/": "Passou de graça",
    "=": "Erro de levant.",
  },
  attack: {
    "#": "Ponto",
    "+": "Defesa difícil",
    "!": "Bola continua",
    "-": "Defesa fácil",
    "/": "Contra-ataque fácil",
    "=": "Erro (fora/rede)",
  },
  block: {
    "#": "Ponto de bloqueio",
    "+": "Amorteceu",
    "!": "Tocou, segue",
    "-": "Tocou, bola fácil",
    "/": "Bola de graça",
    "=": "Erro (rede)",
  },
  dig: {
    "#": "Defesa perfeita",
    "+": "Boa defesa",
    "!": "Defesa jogável",
    "-": "Defesa ruim",
    "/": "Volta de graça",
    "=": "Erro de defesa",
  },
  freeball: {
    "#": "Bem colocada",
    "+": "Boa",
    "!": "Regular",
    "-": "Fácil p/ adv.",
    "/": "Muito fácil",
    "=": "Erro",
  },
  fault: {
    "#": "Não encerra",
    "+": "Não encerra",
    "!": "Não encerra",
    "-": "Não encerra",
    "/": "Não encerra",
    "=": "Ponto adversário",
  },
};
