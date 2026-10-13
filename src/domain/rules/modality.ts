import type { Modality } from "../types";

export interface ModalityRules {
  modality: Modality;
  version: string;
  maxTouchesPerSide: number;
  /** Beach: o bloqueio conta como 1º toque da equipe. Indoor: não conta. */
  blockCountsAsTouch: boolean;
  setsToWin: number;
  pointsPerSet: number;
  decidingSetPoints: number;
  winBy: number;
}

export const BEACH_RULES: ModalityRules = {
  modality: "beach",
  version: "beach-2026",
  maxTouchesPerSide: 3,
  blockCountsAsTouch: true,
  setsToWin: 2, // melhor de 3: 21 / 21 / 15
  pointsPerSet: 21,
  decidingSetPoints: 15,
  winBy: 2,
};

export const INDOOR_RULES: ModalityRules = {
  modality: "indoor",
  version: "indoor-2026",
  maxTouchesPerSide: 3,
  blockCountsAsTouch: false,
  setsToWin: 3, // melhor de 5: 25 ×4 / 15
  pointsPerSet: 25,
  decidingSetPoints: 15,
  winBy: 2,
};

export function rulesFor(modality: Modality): ModalityRules {
  return modality === "beach" ? BEACH_RULES : INDOOR_RULES;
}

export const decidingSetNumber = (rules: ModalityRules) => rules.setsToWin * 2 - 1;

export function setTarget(rules: ModalityRules, setNumber: number): number {
  return setNumber === decidingSetNumber(rules) ? rules.decidingSetPoints : rules.pointsPerSet;
}

export function isSetOver(rules: ModalityRules, setNumber: number, a: number, b: number): boolean {
  return Math.max(a, b) >= setTarget(rules, setNumber) && Math.abs(a - b) >= rules.winBy;
}
