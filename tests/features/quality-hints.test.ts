import { describe, expect, it } from "vitest";
import { impliedPoint } from "@/domain/rally/implied-point";
import type { Quality, Skill } from "@/domain/types";
import { QUALITIES } from "@/features/scout/labels";
import { QUALITY_HINTS } from "@/features/scout/quality-hints";

const SKILLS = Object.keys(QUALITY_HINTS) as Skill[];
const ALL_SKILLS: Skill[] = ["serve", "reception", "set", "attack", "block", "dig", "freeball", "fault"];

describe("QUALITY_HINTS", () => {
  it("cobre todo fundamento × qualidade com dicas de até 20 caracteres", () => {
    expect(SKILLS.sort()).toEqual([...ALL_SKILLS].sort());
    for (const skill of ALL_SKILLS) {
      for (const quality of QUALITIES) {
        const hint = QUALITY_HINTS[skill][quality];
        expect(hint, `${skill} ${quality}`).toBeTruthy();
        expect(hint.length, `${skill} ${quality}: "${hint}"`).toBeLessThanOrEqual(20);
      }
    }
  });

  it("só fala em ponto, ace ou erro quando a qualidade realmente encerra o rali", () => {
    const pointWords = /\b(ponto|ace|erro)\b/i;
    for (const skill of ALL_SKILLS) {
      for (const quality of QUALITIES as readonly Quality[]) {
        const hint = QUALITY_HINTS[skill][quality];
        // Recepção = só vira ace logo após o saque: testamos no caso mais comum.
        const ends = impliedPoint({ team: "A", skill, quality }, { team: "B", skill: "serve", quality: "+" }) !== null;
        if (pointWords.test(hint)) expect(ends, `${skill} ${quality}: "${hint}" sugere fim de rali`).toBe(true);
      }
    }
  });
});
