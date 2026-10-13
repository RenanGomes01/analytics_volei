import { describe, expect, it } from "vitest";
import { countTouches } from "@/domain/rally/touch-counter";
import { BEACH_RULES, INDOOR_RULES } from "@/domain/rules/modality";
import { touches } from "../helpers";

describe("bloqueio como toque", () => {
  it("BEACH: bloqueio + 2 toques = 3 → válido", () => {
    const r = countTouches(touches(["A", "attack"], ["B", "block"], ["B", "set"], ["B", "attack"]), BEACH_RULES);
    expect(r.violation).toBeUndefined();
    expect(r.possessions.at(-1)).toMatchObject({ team: "B", touches: 3 });
  });

  it("BEACH: bloqueio + 3 toques = 4 → falta de quatro toques da equipe B", () => {
    const seq = touches(["A", "attack"], ["B", "block"], ["B", "dig"], ["B", "set"], ["B", "attack"]);
    const r = countTouches(seq, BEACH_RULES);
    expect(r.violation).toEqual({ reason: "four_touches", team: "B", at_event_id: seq.at(-1)!.id });
  });

  it("INDOOR: a mesma sequência é válida (bloqueio não conta)", () => {
    const r = countTouches(touches(["A", "attack"], ["B", "block"], ["B", "dig"], ["B", "set"], ["B", "attack"]), INDOOR_RULES);
    expect(r.violation).toBeUndefined();
    expect(r.possessions.at(-1)).toMatchObject({ team: "B", touches: 3 });
  });

  it("INDOOR: bloqueio + 4 toques → falta", () => {
    const r = countTouches(
      touches(["A", "attack"], ["B", "block"], ["B", "dig"], ["B", "set"], ["B", "freeball"], ["B", "attack"]),
      INDOOR_RULES,
    );
    expect(r.violation).toMatchObject({ team: "B" });
  });

  it("bloqueio que devolve a bola dá 3 toques novos ao atacante", () => {
    const r = countTouches(
      touches(["A", "attack"], ["B", "block"], ["A", "dig"], ["A", "set"], ["A", "attack"]),
      BEACH_RULES,
    );
    expect(r.violation).toBeUndefined();
    expect(r.possessions.map((p) => [p.team, p.touches])).toEqual([["A", 1], ["B", 1], ["A", 3]]);
  });
});

describe.each([BEACH_RULES, INDOOR_RULES])("contagem básica ($modality)", (rules) => {
  it("saque não conta como toque", () => {
    const r = countTouches(touches(["A", "serve"], ["B", "reception"], ["B", "set"], ["B", "attack"]), rules);
    expect(r.violation).toBeUndefined();
    expect(r.possessions.map((p) => [p.team, p.touches])).toEqual([["A", 0], ["B", 3]]);
  });

  it("quatro toques sem bloqueio → falta", () => {
    const r = countTouches(
      touches(["A", "serve"], ["B", "reception"], ["B", "set"], ["B", "freeball"], ["B", "attack"]),
      rules,
    );
    expect(r.violation).toMatchObject({ team: "B" });
  });

  it("falta sem contato (fault) não conta como toque", () => {
    const r = countTouches(touches(["A", "serve"], ["B", "reception"], ["B", "fault"], ["B", "set"]), rules);
    expect(r.violation).toBeUndefined();
    expect(r.possessions.at(-1)).toMatchObject({ team: "B", touches: 2 });
  });
});
