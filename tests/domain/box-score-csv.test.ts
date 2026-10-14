import { describe, expect, it } from "vitest";
import { boxScoreCsvFilename, boxScoreToCsv } from "@/domain/export/box-score-csv";
import { BEACH_RULES, INDOOR_RULES } from "@/domain/rules/modality";
import { computeBoxScore } from "@/domain/stats/box-score";
import type { Athlete, Match, Quality, Skill, TeamSide } from "@/domain/types";
import { ledger, matchFixture } from "../helpers";

const athletes = new Map<string, Athlete>(
  [
    ["A1", "Ana", 1],
    ["A2", "=SOMA(1;2)", 2], // nome malicioso: não pode virar fórmula no Excel
    ["B1", 'Carla "Cacá"; capitã', 3],
    ["B2", "Duda", 4],
  ].map(([id, name, n]) => [id as string, { id: id as string, tenant_id: "t1", name: name as string, jersey_number: n as number, created_at: 0 }]),
);

function scenario(match: Match) {
  const l = ledger();
  const rally = (...plays: [string, Skill, Quality][]) => {
    l.rally();
    for (const [id, skill, quality] of plays) l.touch(id[0] as TeamSide, skill, { athlete_id: id, quality });
  };
  rally(["A1", "serve", "#"]); // ace A1
  rally(["A1", "serve", "+"], ["B1", "reception", "#"], ["B2", "set", "+"], ["B1", "attack", "#"]); // ponto B1
  rally(["B2", "serve", "+"], ["A1", "reception", "!"], ["A2", "set", "+"], ["A1", "attack", "="]); // erro A1
  const rules = match.modality === "beach" ? BEACH_RULES : INDOOR_RULES;
  const roster = { A: match.team_a.athlete_ids, B: match.team_b.athlete_ids };
  return (set: number | "all" = "all") =>
    computeBoxScore(l.events, { rules, first_server: match.first_server, roster }, { set });
}

const parse = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("Box Score em CSV", () => {
  const match = { ...matchFixture("beach"), created_at: Date.UTC(2026, 9, 13, 15), team_a: { name: "Areia A", athlete_ids: ["A1", "A2"] }, team_b: { name: "Areia B", athlete_ids: ["B1", "B2"] } };
  const box = scenario(match)();
  const csv = boxScoreToCsv({ box, match, athletes, filter: { set: "all" }, timeZone: "UTC" });
  const lines = parse(csv);

  /** Linha de atleta como { cabeçalho completo: valor }: o teste lê como a comissão técnica lê a planilha. */
  const athleteRow = (name: string) => {
    const header = lines[7].split(";");
    const cells = lines.find((l) => l.split(";")[2] === name)!.split(";");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  };

  it("começa com BOM UTF-8, usa ; e termina linhas com CRLF; explica as convenções", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe("Partida;Areia A × Areia B;Modalidade;Beach;Data;13/10/2026;Filtro;Jogo inteiro");
    expect(lines[1]).toMatch(/^Observação;"?\(%\) = porcentagem/);
    expect(lines[2]).toBe("");
  });

  it("seção de equipes com nomes completos e porcentagens com vírgula decimal", () => {
    expect(lines[3]).toBe(
      "Equipe;Pontos (total);Pontos de ataque;Pontos de saque (aces);Pontos de bloqueio;Pontos por erro do adversário;Virada de bola (%);Quebra de saque (%);Total de ataques;Erros de ataque;Eficiência de ataque (%);Total de recepções;Passe na mão (%);Erros de recepção (aces sofridos);Total de saques;Erros de saque (total);Erros de saque na rede;Erros de saque pra fora",
    );
    // A: ace (1) + erro de ataque de A1 dá ponto a B. A recebeu 1 vez (rali 3) e perdeu.
    expect(lines[4]).toBe("Areia A;1;0;1;0;0;0;50;1;1;-100;1;0;0;2;0;0;0");
    // B: kill de B1 + ponto pelo erro de A. B sacou 1 vez e ganhou (100); recebeu 2 e ganhou 1 (50).
    expect(lines[5]).toBe("Areia B;2;1;0;0;1;50;100;1;0;100;1;100;0;1;0;0;0");
  });

  it("seção de atletas: totais por fundamento antes de acertos e erros, sem siglas", () => {
    const header = lines[7].split(";");
    expect(header.slice(0, 3)).toEqual(["Equipe", "Número", "Atleta"]);
    // Em cada fundamento o total vem primeiro.
    expect(header.indexOf("Total de ataques")).toBeLessThan(header.indexOf("Pontos de ataque"));
    expect(header.indexOf("Total de saques")).toBeLessThan(header.indexOf("Pontos de saque (aces)"));
    expect(header.indexOf("Total de recepções")).toBeLessThan(header.indexOf("Erros de recepção (aces sofridos)"));
    // Nenhum cabeçalho é sigla (PA, TA, ES-R, Sq, Rec…).
    for (const h of [...header, ...lines[3].split(";")]) expect(h, h).not.toMatch(/^([A-Z]{1,4}(-[A-Z])?|Pts|Sq|Rec|Def|Blq|Efic\.( \(%\))?|Err\. adv|2ª.*)$/);

    expect(athleteRow("Ana")).toMatchObject({
      Número: "1",
      "Pontos (ataque + ace + bloqueio)": "1",
      "Total de ataques": "1",
      "Pontos de ataque": "0",
      "Erros de ataque": "1",
      "Ataques em jogo (continuidade)": "0",
      "Eficiência de ataque (%)": "-100",
      "Total de saques": "2",
      "Pontos de saque (aces)": "1",
      "Saques em jogo (continuidade)": "1",
      "Total de recepções": "1",
      "Erros cometidos (total)": "1",
    });
    expect(lines[9]).toContain(`;"'=SOMA(1;2)";`); // fórmula neutralizada (e o ; obriga aspas)
    expect(lines[10]).toContain('"Carla ""Cacá""; capitã"');
  });

  it("decimais com 1 casa e vírgula; sem base de cálculo fica vazio", () => {
    const thirds = boxScoreToCsv({
      box: { ...box, teams: { ...box.teams, A: { ...box.teams.A, side_out: { num: 1, den: 3, pct: 1 / 3 } } } },
      match,
      athletes,
      filter: { set: "all" },
      timeZone: "UTC",
    });
    expect(parse(thirds)[4].split(";")[6]).toBe("33,3");
    const header = lines[7].split(";");
    const bia = lines[9].replace(`"'=SOMA(1;2)"`, "Bia").split(";");
    expect(bia[header.indexOf("Eficiência de ataque (%)")]).toBe(""); // Bia sem ataques: eficiência vazia
  });

  it("respeita o filtro de set e usa os termos do indoor", () => {
    const indoor = { ...match, modality: "indoor" as const };
    const set1 = boxScoreToCsv({ box: scenario(indoor)(1), match: indoor, athletes, filter: { set: 1 }, timeZone: "UTC" });
    const l = parse(set1);
    expect(l[0]).toContain("Indoor;Data;13/10/2026;Filtro;Set 1");
    expect(l[3]).toContain("Recepção #+ (%)");
    expect(l[7]).toContain(";Recepção perfeita ou positiva (%);");
  });

  it("nome do arquivo com times, filtro e data", () => {
    const now = Date.UTC(2026, 9, 13, 15);
    expect(boxScoreCsvFilename(match, { set: "all" }, now)).toBe("boxscore_areia-a-x-areia-b_jogo_2026-10-13.csv");
    expect(boxScoreCsvFilename(match, { set: 2 }, now)).toBe("boxscore_areia-a-x-areia-b_set-2_2026-10-13.csv");
  });
});
