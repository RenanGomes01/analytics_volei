import { describe, expect, it } from "vitest";
import { sortByColumn, sortValue } from "@/domain/stats/sort";
import type { StatColumn } from "@/domain/stats/stat-columns";
import { rate } from "@/domain/stats/rate";
import { readStaffMode, writeStaffMode } from "@/features/staff/staff-mode";

type Row = { id: string; v: number | ReturnType<typeof rate> | string | null };
const col = (format: StatColumn<Row>["format"]): StatColumn<Row> => ({ key: "v", short: "V", full: "V", hint: "", group: "geral", format, value: (r) => r.v });

describe("ordenação do construtor de relatórios", () => {
  it("contagens nos dois sentidos, com '–' (sem base) sempre no fim", () => {
    const rows: Row[] = [{ id: "a", v: 3 }, { id: "b", v: null }, { id: "c", v: 7 }, { id: "d", v: 0 }];
    expect(sortByColumn(rows, col("count"), "desc").map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
    expect(sortByColumn(rows, col("count"), "asc").map((r) => r.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("porcentagem ordena pelo valor do Rate; denominador 0 vai para o fim", () => {
    const rows: Row[] = [{ id: "a", v: rate(1, 4) }, { id: "b", v: rate(0, 0) }, { id: "c", v: rate(3, 4) }];
    expect(sortByColumn(rows, col("pct"), "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortByColumn(rows, col("pct"), "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("'2ª' (pontos/tentativas) ordena pelos pontos", () => {
    expect(sortValue("3/5")! > sortValue("2/9")!).toBe(true);
    expect(sortValue("texto")).toBeNull();
  });
});

describe("modo comissão técnica", () => {
  it("lê e grava com segurança, inclusive sem armazenamento ou com armazenamento que lança", () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(readStaffMode(fake)).toBe(false);
    writeStaffMode(true, fake);
    expect(readStaffMode(fake)).toBe(true);
    writeStaffMode(false, fake);
    expect(readStaffMode(fake)).toBe(false);
    expect(readStaffMode(null)).toBe(false);
    const broken = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => {} };
    expect(readStaffMode(broken)).toBe(false);
    expect(() => writeStaffMode(true, broken)).not.toThrow();
  });
});
