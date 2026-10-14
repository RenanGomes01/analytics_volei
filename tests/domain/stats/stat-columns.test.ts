import { describe, expect, it } from "vitest";
import { athleteColumns, csvColumns, groupSpans, serveInPlay, tableColumns, teamColumns } from "@/domain/stats/stat-columns";

describe("dicionário de estatísticas", () => {
  const lists = [
    athleteColumns({ modality: "beach" }),
    athleteColumns({ modality: "indoor", aggregated: true }),
    teamColumns({ modality: "beach" }),
  ];

  it("toda coluna tem sigla, nome completo diferente da sigla e explicação; chaves e nomes únicos", () => {
    for (const cols of lists) {
      for (const c of cols) {
        expect(c.full, c.key).not.toBe(c.short);
        expect(c.full.length, c.key).toBeGreaterThan(c.short.length);
        expect(c.hint.length, c.key).toBeGreaterThan(10);
      }
      expect(new Set(cols.map((c) => c.key)).size).toBe(cols.length);
      expect(new Set(cols.map((c) => c.full)).size).toBe(cols.length);
    }
  });

  it("em cada fundamento o total vem antes de acertos e erros", () => {
    for (const cols of lists) {
      for (const g of ["ataque", "saque", "recepcao"] as const) {
        const inGroup = cols.filter((c) => c.group === g);
        if (inGroup.length) expect(inGroup[0].total, `${g}`).toBe(true);
      }
    }
  });

  it("saques em jogo = total − aces − erros (nunca negativo)", () => {
    expect(serveInPlay({ attempts: 10, aces: 2, errors: 3, errors_net: 1, errors_out: 2 })).toBe(5);
    expect(serveInPlay({ attempts: 1, aces: 1, errors: 1, errors_net: 0, errors_out: 0 })).toBe(0);
  });

  it("tela × CSV: a tela mostra '2ª' em fração; o CSV, as duas partes em números", () => {
    const cols = athleteColumns({ modality: "beach" });
    expect(tableColumns(cols).map((c) => c.key)).toContain("second_ball");
    expect(tableColumns(cols).map((c) => c.key)).not.toContain("second_ball_attempts");
    expect(csvColumns(cols).map((c) => c.key)).toEqual(expect.arrayContaining(["second_ball_attempts", "second_ball_kills", "errors"]));
    expect(csvColumns(cols).map((c) => c.key)).not.toContain("second_ball");
  });

  it("passe na mão some sem recepções avaliadas; o total de recepções fica", () => {
    const keys = athleteColumns({ modality: "beach", showReception: false }).map((c) => c.key);
    expect(keys).not.toContain("rec_positive");
    expect(keys).toContain("rec_total");
  });

  it("faixas do cabeçalho agrupam colunas consecutivas do mesmo fundamento", () => {
    const spans = groupSpans(tableColumns(athleteColumns({ modality: "beach" })));
    expect(spans.map((s) => s.group)).toEqual(["geral", "ataque", "saque", "recepcao", "bloqueio", "defesa"]);
    expect(spans.reduce((n, s) => n + s.span, 0)).toBe(tableColumns(athleteColumns({ modality: "beach" })).length);
  });
});
