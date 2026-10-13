import type { Modality, Quality, Skill } from "@/domain/types";
import { QUALITIES } from "./labels";

/**
 * Convenção de quadra da escala de qualidade, por modalidade e fundamento (estilo Data Volley).
 * Fonte única de QUAIS botões de qualidade aparecem e do texto embaixo de cada um; documentada em
 * docs/business_rules.md. Qualidade ausente = botão oculto. Máximo de 20 caracteres por dica.
 * Só `#` e `=` têm efeito de regra (ver domain/rally/implied-point.ts); os demais são convenção.
 */
type HintTable = Record<Skill, Partial<Record<Quality, string>>>;

/** Comuns às duas modalidades: falta sempre encerra o rali; bola de graça mede o quanto ajudou o adversário. */
const FAULT = { "=": "Ponto adversário" };
const FREEBALL = {
  "#": "Dificultou o adv.",
  "+": "Bem colocada",
  "!": "Neutra",
  "-": "Fácil p/ o adv.",
  "/": "Na mão do adv.",
  "=": "Erro (fora/rede)",
};

/** Linguagem da areia. A recepção tem só as 4 situações reais do passe no beach. */
const BEACH: HintTable = {
  serve: {
    "#": "Ace",
    "+": "Quebrou o passe",
    "!": "Passe regular",
    "-": "Passe na mão do adv.",
    "/": "Volta de graça",
    "=": "Erro de saque",
  },
  reception: {
    "#": "Na mão",
    "!": "Quebrou, dá p/ jogar",
    "/": "De graça p/ o adv.",
    "=": "Ace sofrido",
  },
  set: {
    "#": "Bola na pinta",
    "+": "Boa p/ atacar",
    "!": "Fora, dá p/ atacar",
    "-": "Ruim, só largar",
    "/": "Passou de graça",
    "=": "Erro (dois toques)",
  },
  attack: {
    "#": "Ponto",
    "+": "Defesa difícil",
    "!": "Defendido",
    "-": "Defesa fácil",
    "/": "Contra-ataque fácil",
    "=": "Erro (fora/rede)",
  },
  block: {
    "#": "Ponto de bloqueio",
    "+": "Amorteceu",
    "!": "Tocou, segue",
    "-": "Tocou, volta fácil",
    "/": "Volta de graça",
    "=": "Erro (rede)",
  },
  dig: {
    "#": "Defesa na mão",
    "+": "Boa defesa",
    "!": "Defesa jogável",
    "-": "Só bola alta",
    "/": "Volta de graça",
    "=": "Erro de defesa",
  },
  freeball: FREEBALL,
  fault: FAULT,
};

/** Linguagem de quadra (6×6). */
const INDOOR: HintTable = {
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
  attack: BEACH.attack,
  block: BEACH.block,
  dig: {
    "#": "Defesa perfeita",
    "+": "Boa defesa",
    "!": "Defesa jogável",
    "-": "Defesa ruim",
    "/": "Volta de graça",
    "=": "Erro de defesa",
  },
  freeball: FREEBALL,
  fault: FAULT,
};

export const QUALITY_HINTS: Record<Modality, HintTable> = { beach: BEACH, indoor: INDOOR };

export interface QualityOption {
  quality: Quality;
  hint: string;
}

/** Botões de qualidade visíveis para o fundamento, na ordem da escala (# → =). */
export function qualityOptions(modality: Modality, skill: Skill): QualityOption[] {
  const table = QUALITY_HINTS[modality][skill];
  return QUALITIES.flatMap((quality) => (table[quality] ? [{ quality, hint: table[quality] }] : []));
}
