import { describe, expect, it } from "vitest";
import { concededTone, scoredTone, sourceTone } from "@/domain/stats/point-tone";
import { buildAnalytics } from "@/domain/stats/facts";
import { causeRows } from "@/domain/stats/rally-facts";
import { randomMatch } from "./random-ledger";

/** Fase 21 — cores semânticas: de quem foi o ponto. */

describe("tom semântico dos pontos", () => {
  it("lado de quem ganhou: mérito × erro do adversário, pelo grupo do placar", () => {
    expect(scoredTone("kills", "opponent")).toBe("merit");
    expect(scoredTone("aces", "opponent")).toBe("merit");
    // Ponto de bloqueio: fault "own" (erro de quem atacou), mas é mérito de quem bloqueou.
    expect(scoredTone("blocks", "own")).toBe("merit");
    expect(scoredTone("opponent_errors", "own")).toBe("gift");
    expect(scoredTone("opponent_errors", "none")).toBe("unknown");
  });

  it("lado de quem perdeu: erro próprio × mérito do adversário", () => {
    expect(concededTone("own")).toBe("own_error");
    expect(concededTone("opponent")).toBe("opponent_merit");
    expect(concededTone("none")).toBe("unknown");
  });

  it("origem dos pontos: só o erro do adversário destoa", () => {
    expect(sourceTone("kills")).toBe("merit");
    expect(sourceTone("aces")).toBe("merit");
    expect(sourceTone("blocks")).toBe("merit");
    expect(sourceTone("opponent_errors")).toBe("gift");
  });

  it("em ledgers aleatórios, os pontos 'de graça' são exatamente os de erro do adversário", () => {
    const { rallies } = buildAnalytics([randomMatch(21, 300)]);
    const rows = causeRows(rallies, "merit");
    const gift = rows.filter((r) => scoredTone(r.group, r.fault) === "gift").reduce((n, r) => n + r.count, 0);
    expect(gift).toBe(rallies.filter((f) => f.group === "opponent_errors" && f.fault !== "none").length);
    expect(rows.filter((r) => r.label.startsWith("Erro do adversário")).every((r) => scoredTone(r.group, r.fault) === "gift")).toBe(true);
  });
});
