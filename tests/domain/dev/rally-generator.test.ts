import { describe, expect, it } from "vitest";
import { createRng, generateRally, type PlayerProfile, type RallyContext } from "@/domain/dev/rally-generator";
import { impliedPoint } from "@/domain/rally/implied-point";
import { countTouches } from "@/domain/rally/touch-counter";
import { rulesFor } from "@/domain/rules/modality";
import type { TouchEvent } from "@/domain/types";

const avg: PlayerProfile = { serve: 0.5, pass: 0.5, attack: 0.5, block: 0.5, dig: 0.5 };
const ctx = (serving: "A" | "B"): RallyContext => ({
  serving_team: serving,
  server_id: serving === "A" ? "a1" : "b1",
  athletes: { A: ["a1", "a2"], B: ["b1", "b2"] },
  profiles: { a1: avg, a2: { ...avg, block: 0.95 }, b1: { ...avg, serve: 0.9 }, b2: { ...avg, pass: 0.9 } },
});

function sample(seed: number, n = 2000) {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => generateRally(ctx(i % 2 ? "A" : "B"), rng));
}

describe("generateRally", () => {
  it("é determinístico pela semente", () => {
    expect(sample(42, 50)).toEqual(sample(42, 50));
    expect(sample(42, 50)).not.toEqual(sample(43, 50));
  });

  it("todo rali termina num lance terminal cujo ponto implícito é o fim registrado", () => {
    for (const { touches, end } of sample(1)) {
      const last = touches.at(-1)!;
      expect(impliedPoint(last, touches.at(-2))).toEqual(end);
      // nenhum lance anterior é terminal
      touches.slice(0, -1).forEach((t, i) => expect(impliedPoint(t, touches[i - 1])).toBeNull());
    }
  });

  it("começa pelo saque de quem saca e nunca passa de 3 toques por lado (bloqueio conta no beach)", () => {
    const rules = rulesFor("beach");
    sample(2).forEach(({ touches }, i) => {
      const serving = i % 2 ? "A" : "B";
      if (touches[0].skill !== "fault") expect(touches[0]).toMatchObject({ skill: "serve", team: serving });
      const events = touches.map((t, j) => ({ ...t, id: String(j) }) as unknown as TouchEvent);
      expect(countTouches(events, rules).violation).toBeUndefined();
    });
  });

  it("tem variedade: aces, erros de saque, bloqueios, bolas de graça, passes avaliados e defesas", () => {
    const touches = sample(3).flatMap((r) => r.touches);
    const count = (skill: string, quality?: string) => touches.filter((t) => t.skill === skill && (!quality || t.quality === quality)).length;
    expect(count("serve", "#")).toBeGreaterThan(50);
    expect(count("serve", "=")).toBeGreaterThan(80);
    expect(count("block", "#")).toBeGreaterThan(50);
    expect(count("freeball")).toBeGreaterThan(20);
    expect(count("reception", "#")).toBeGreaterThan(500);
    expect(count("dig")).toBeGreaterThan(500);
    expect(touches.every((t) => t.quality !== "?")).toBe(true);
  });
});
