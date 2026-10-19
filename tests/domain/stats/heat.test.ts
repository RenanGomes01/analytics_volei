import { describe, expect, it } from "vitest";
import { baseOf, columnScale } from "@/domain/stats/heat";
import { rate } from "@/domain/stats/rate";
import { toneOf, type StatColumn } from "@/domain/stats/stat-columns";
import { emptyTouchCounters, type TouchCounters } from "@/domain/stats/touch-lines";

/** Fase 19 — mapa de calor das tabelas. */

interface Line {
  n: number;
  r: { num: number; den: number; pct: number | null };
  eff: number | null;
  counters: TouchCounters;
}

const line = (n: number, num: number, den: number, eff: number | null, attempts: number): Line => ({
  n,
  r: rate(num, den),
  eff,
  counters: { ...emptyTouchCounters(), attack_attempts: attempts },
});

const col = (key: string, format: StatColumn<Line>["format"], value: StatColumn<Line>["value"], drill?: StatColumn<Line>["drill"]): StatColumn<Line> => ({
  key,
  short: key,
  full: key,
  hint: "",
  group: "geral",
  format,
  value,
  ...(drill ? { drill } : {}),
});

describe("mapa de calor", () => {
  const lines = [line(2, 1, 10, 0.5, 20), line(8, 9, 10, 0.1, 30), line(5, 4, 4, 0.9, 3)];

  it("tom vem de stat-columns: erros são 'bad', pontos/eficiência 'good', volume neutro", () => {
    expect(toneOf({ key: "points_given" })).toBe("bad");
    expect(toneOf({ key: "atk_eff" })).toBe("good");
    expect(toneOf({ key: "atk_total" })).toBeNull();
  });

  it("contagem: intensidade entre mínimo e máximo; topo = maior (líder ou maior ofensor)", () => {
    const s = columnScale(lines, col("points_given", "count", (l) => l.n))!;
    expect(s.tone).toBe("bad");
    expect(s.intensity).toEqual([0, 1, 0.5]);
    expect(s.top).toEqual([1]);
  });

  it("taxa com base pequena fica fora da escala (sem cor, sem selo)", () => {
    const s = columnScale(lines, col("srv_ace_pct", "pct", (l) => l.r), 5)!;
    expect(s.intensity).toEqual([0, 1, null]); // 4/4 = 100% mas base 4 < 5
    expect(s.top).toEqual([1]);
  });

  it("eficiência (número): a base é o drill da coluna sobre os contadores da linha", () => {
    const eff = col("atk_eff", "pct", (l) => l.eff, (d) => d.attack_attempts ?? 0);
    expect(baseOf(eff, lines[0])).toBe(20);
    const s = columnScale(lines, eff, 5)!;
    expect(s.intensity[2]).toBeNull(); // 90% em 3 ataques não lidera
    expect(s.top).toEqual([0]);
  });

  it("sem diferença ou sem tom: sem selo", () => {
    expect(columnScale([line(3, 0, 0, null, 0), line(3, 0, 0, null, 0)], col("points", "count", (l) => l.n))!.top).toEqual([]);
    expect(columnScale(lines, col("atk_total", "count", (l) => l.n))).toBeNull();
    expect(columnScale([lines[0]], col("points", "count", (l) => l.n))!.top).toEqual([]);
  });

  it("empate no topo: todas as linhas empatadas", () => {
    expect(columnScale([line(4, 0, 0, null, 0), line(4, 0, 0, null, 0), line(1, 0, 0, null, 0)], col("points", "count", (l) => l.n))!.top).toEqual([0, 1]);
  });
});
