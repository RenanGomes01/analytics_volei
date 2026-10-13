import { describe, expect, it } from "vitest";
import { impliedPoint } from "@/domain/rally/implied-point";
import type { Modality, Skill } from "@/domain/types";
import { qualityOptions } from "@/features/scout/quality-hints";

const MODALITIES: Modality[] = ["beach", "indoor"];
const SKILLS: Skill[] = ["serve", "reception", "set", "attack", "block", "dig", "freeball", "fault"];
const symbols = (modality: Modality, skill: Skill) => qualityOptions(modality, skill).map((o) => o.quality);

describe.each(MODALITIES)("qualityOptions (%s)", (modality) => {
  it("todo fundamento tem botões, com dicas de até 20 caracteres, na ordem da escala", () => {
    for (const skill of SKILLS) {
      const options = qualityOptions(modality, skill);
      expect(options.length, skill).toBeGreaterThan(0);
      for (const { quality, hint } of options) {
        expect(hint, `${skill} ${quality}`).toBeTruthy();
        expect(hint.length, `${skill} ${quality}: "${hint}"`).toBeLessThanOrEqual(20);
      }
      const order = "#+!-/=";
      const positions = options.map((o) => order.indexOf(o.quality));
      expect(positions, skill).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("falta tem um único botão: ponto do adversário", () => {
    expect(qualityOptions(modality, "fault")).toEqual([{ quality: "=", hint: "Ponto adversário" }]);
  });

  it("só fala em ponto, ace ou erro quando a qualidade realmente encerra o rali", () => {
    const pointWords = /\b(ponto|ace|erro)\b/i;
    for (const skill of SKILLS) {
      for (const { quality, hint } of qualityOptions(modality, skill)) {
        // Recepção = só vira ace logo após o saque: testamos no caso mais comum.
        const ends = impliedPoint({ team: "A", skill, quality }, { team: "B", skill: "serve", quality: "+" }) !== null;
        if (pointWords.test(hint)) expect(ends, `${skill} ${quality}: "${hint}" sugere fim de rali`).toBe(true);
      }
    }
  });
});

describe("linguagem da areia", () => {
  it("recepção no beach tem as 4 situações do passe; no indoor, a escala completa", () => {
    expect(qualityOptions("beach", "reception")).toEqual([
      { quality: "#", hint: "Na mão" },
      { quality: "!", hint: "Quebrou, dá p/ jogar" },
      { quality: "/", hint: "De graça p/ o adv." },
      { quality: "=", hint: "Ace sofrido" },
    ]);
    expect(symbols("indoor", "reception")).toEqual(["#", "+", "!", "-", "/", "="]);
  });

  it("levantamento # no beach é 'Bola na pinta', não 'Atacante livre'", () => {
    expect(qualityOptions("beach", "set")[0]).toEqual({ quality: "#", hint: "Bola na pinta" });
    expect(qualityOptions("indoor", "set")[0].hint).toBe("Atacante livre");
  });

  it("bola de graça diz se dificultou ou facilitou para o adversário", () => {
    const hints = qualityOptions("beach", "freeball").map((o) => o.hint);
    expect(hints).toContain("Dificultou o adv.");
    expect(hints).toContain("Fácil p/ o adv.");
  });
});
