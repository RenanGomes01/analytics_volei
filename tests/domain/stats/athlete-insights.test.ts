import { describe, expect, it } from "vitest";
import { INSIGHT_MIN, LETHAL_MIN_ATTEMPTS, weaknesses, weapon } from "@/domain/stats/athlete-insights";
import { factsIn, scoredBreakdown } from "@/domain/stats/drill";
import { buildAnalytics } from "@/domain/stats/facts";
import { causeRows, pointsConceded, type RallyFact } from "@/domain/stats/rally-facts";
import { explainLethal, explainWeakness, explainWeapon } from "@/features/stats/explain";
import { ledger, matchFixture } from "../../helpers";
import { randomMatch } from "./random-ledger";

/** Fase 19 — Raio-X de deficiências e maior arma. */

const fact = (code: string, conceded: string, fault: RallyFact["fault"]) => ({ code, conceded, fault }) as RallyFact;

describe("raio-x de deficiências", () => {
  it("o maior ralo é a maior linha de 'Pontos cedidos'; no empate, o erro próprio", () => {
    const facts = [
      ...Array.from({ length: 4 }, () => fact("ace", "Ace sofrido", "opponent")),
      ...Array.from({ length: 4 }, () => fact("err:Saque na rede", "Saque na rede", "own")),
      fact("err:Ataque fora", "Ataque fora", "own"),
      fact("unseen", "Ponto cedido sem detalhe", "none"),
    ];
    const w = weaknesses(facts, 2);
    expect(w.total).toBe(10);
    expect(w.own).toBe(5);
    expect(w.main).toMatchObject({ key: "err:Saque na rede", count: 4, share: 0.4, perMatch: 2, fault: "own" });
    expect(w.rows.map((r) => r.key)).toEqual(["err:Saque na rede", "ace", "err:Ataque fora"]);
    expect(explainWeakness(w.main!, w.total)).toBe("4 de 10 pontos cedidos (40%) · 2 por jogo");
  });

  it("abaixo do volume mínimo nada é coroado (mas as linhas aparecem)", () => {
    const facts = Array.from({ length: INSIGHT_MIN - 1 }, () => fact("err:Saque fora", "Saque fora", "own"));
    const w = weaknesses(facts, 1);
    expect(w.main).toBeNull();
    expect(w.rows).toHaveLength(1);
    expect(weaknesses([], 0)).toMatchObject({ total: 0, main: null, rows: [] });
  });

  it("bate com causeRows em ledgers aleatórios", () => {
    const { rallies } = buildAnalytics([randomMatch(11, 200)]);
    for (const id of ["A1", "A2", "B1", "B2"]) {
      const mine = rallies.filter((f) => f.culprit === id);
      const top = causeRows(mine, "conceded").filter((r) => r.fault !== "none")[0];
      const w = weaknesses(mine, 1);
      expect(w.rows[0]?.count ?? 0).toBe(top?.count ?? 0);
      if (w.main) expect(w.main.count).toBeGreaterThanOrEqual(INSIGHT_MIN);
    }
  });
});

describe("maior arma", () => {
  function game() {
    const l = ledger("m1");
    // A1: 4 largadas de segunda (3 pontos, 1 em jogo) e 6 ataques de 3º toque (2 pontos, 2 erros).
    for (let i = 0; i < 4; i++) {
      l.rally();
      l.touch("B", "serve", { athlete_id: "B1" });
      l.touch("A", "reception", { athlete_id: "A2" });
      l.touch("A", "attack", { athlete_id: "A1", quality: i < 3 ? "#" : "+" }).detail = "shot";
      if (i < 3) l.end("A", "kill");
      else {
        l.touch("B", "dig", { athlete_id: "B2" });
        l.touch("B", "set", { athlete_id: "B1" });
        l.touch("B", "attack", { athlete_id: "B2", quality: "#" });
        l.end("B", "kill");
      }
    }
    for (let i = 0; i < 6; i++) {
      l.rally();
      l.touch("B", "serve", { athlete_id: "B1" });
      l.touch("A", "reception", { athlete_id: "A1" });
      l.touch("A", "set", { athlete_id: "A2" });
      const q = i < 2 ? "#" : i < 4 ? "=" : "+";
      l.touch("A", "attack", { athlete_id: "A1", quality: q });
      if (q === "#") l.end("A", "kill");
      else if (q === "=") l.end("B", "error");
      else {
        l.touch("B", "dig", { athlete_id: "B2" });
        l.touch("B", "set", { athlete_id: "B1" });
        l.touch("B", "attack", { athlete_id: "B2", quality: "=" });
        l.end("A", "error");
      }
    }
    return [{ match: matchFixture("beach"), events: l.events }];
  }

  it("arma principal = a jogada que mais pontuou; mais letal exige volume mínimo", () => {
    const facts = factsIn(buildAnalytics(game()).touches, { athlete_id: "A1" });
    const w = weapon(facts);
    expect(w.total).toBe(5);
    expect(w.main).toMatchObject({ label: "Largada de segunda", count: 3 });
    expect(w.rows).toEqual(scoredBreakdown(facts).rows.slice(0, 3));
    // Largada de segunda tem 75% mas só 4 tentativas (< mínimo): o mais letal é o 3º toque.
    expect(LETHAL_MIN_ATTEMPTS).toBe(5);
    expect(w.lethal).toMatchObject({ label: "Ataque (3º toque)", kills: 2, errors: 2, attempts: 6 });
    expect(explainWeapon(w.main!)).toBe("3 pontos · 60% dos pontos dela");
    expect(explainLethal(w.lethal!)).toBe("2 pontos em 6 ataques (33% de aproveitamento)");
  });

  it("sem pontos: nada coroado", () => {
    expect(weapon([])).toEqual({ total: 0, main: null, rows: [], lethal: null });
  });
});

describe("raio-x da dupla (Fase 21)", () => {
  it("consolida as duas atletas: as mesmas contas sobre os lances e os ralis da dupla", () => {
    const { rallies, touches } = buildAnalytics([randomMatch(7, 300)]);
    for (const side of ["A", "B"] as const) {
      const key = touches.find((f) => f.team === side)!.pair_key;
      const facts = touches.filter((f) => f.pair_key === key);
      const ids = [...new Set(facts.map((f) => f.athlete_id))];
      // A arma da dupla soma os pontos das duas (ataque + ace + bloqueio).
      expect(weapon(facts).total).toBe(ids.reduce((n, id) => n + weapon(facts.filter((f) => f.athlete_id === id)).total, 0));
      // O Raio-X lê os MESMOS ralis do card "Pontos cedidos" da dupla.
      const conceded = pointsConceded(rallies, { pair_key: key });
      const w = weaknesses(conceded, 1);
      expect(w.total).toBe(conceded.length);
      expect(w.own).toBe(conceded.filter((f) => f.fault === "own").length);
      expect(w.rows[0]?.count ?? 0).toBe(causeRows(conceded, "conceded").filter((r) => r.fault !== "none")[0]?.count ?? 0);
    }
  });
});
