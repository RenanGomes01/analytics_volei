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

  it("começa com BOM UTF-8, usa ; e termina linhas com CRLF", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe("Partida;Areia A × Areia B;Modalidade;Beach;Data;13/10/2026;Filtro;Jogo inteiro");
    expect(lines[1]).toBe("");
  });

  it("seção de equipes com termos da areia e porcentagens com vírgula decimal", () => {
    expect(lines[2]).toBe(
      "Equipe;Pontos;PA;Ace;Blq;Err. adv;Virada de bola (%);Quebra de saque (%);TA;E;Efic. ataque (%);Rec;Passe na mão (%);Erros recepção;Sq;ES",
    );
    // A: ace (1) + erro de ataque de A1 dá ponto a B. A recebeu 1 vez (rali 3) e perdeu.
    expect(lines[3]).toBe("Areia A;1;0;1;0;0;0;50;1;1;-100;1;0;0;2;0");
    // B: kill de B1 + ponto pelo erro de A. B sacou 1 vez e ganhou (100); recebeu 2 e ganhou 1 (50).
    expect(lines[4]).toBe("Areia B;2;1;0;0;1;50;100;1;0;100;1;100;0;1;0");
  });

  it("seção de atletas, com proteção contra fórmula e aspas", () => {
    expect(lines[6]).toBe("Equipe;Nº;Atleta;Pts;PA;E;TA;Efic. (%);Ace;ES;Sq;Rec;Na mão (%);Blq;Def;Erros");
    expect(lines[7]).toBe("Areia A;1;Ana;1;0;1;1;-100;1;0;2;1;0;0;0;1");
    expect(lines[8]).toBe(`Areia A;2;"'=SOMA(1;2)";0;0;0;0;;0;0;0;0;;0;0;0`);
    expect(lines[9]).toBe('Areia B;3;"Carla ""Cacá""; capitã";1;1;0;1;100;0;0;0;1;100;0;0;0');
  });

  it("decimais com 1 casa e vírgula; sem base de cálculo fica vazio", () => {
    const thirds = boxScoreToCsv({
      box: { ...box, teams: { ...box.teams, A: { ...box.teams.A, side_out: { num: 1, den: 3, pct: 1 / 3 } } } },
      match,
      athletes,
      filter: { set: "all" },
      timeZone: "UTC",
    });
    expect(parse(thirds)[3].split(";")[6]).toBe("33,3");
    expect(lines[8].split(";")).toContain(""); // Bia sem ataques: eficiência vazia
  });

  it("respeita o filtro de set e usa os termos do indoor", () => {
    const indoor = { ...match, modality: "indoor" as const };
    const set1 = boxScoreToCsv({ box: scenario(indoor)(1), match: indoor, athletes, filter: { set: 1 }, timeZone: "UTC" });
    const l = parse(set1);
    expect(l[0]).toContain("Indoor;Data;13/10/2026;Filtro;Set 1");
    expect(l[2]).toContain("Recepção #+ (%)");
    expect(l[6]).toContain(";#+ (%);");
  });

  it("nome do arquivo com times, filtro e data", () => {
    const now = Date.UTC(2026, 9, 13, 15);
    expect(boxScoreCsvFilename(match, { set: "all" }, now)).toBe("boxscore_areia-a-x-areia-b_jogo_2026-10-13.csv");
    expect(boxScoreCsvFilename(match, { set: 2 }, now)).toBe("boxscore_areia-a-x-areia-b_set-2_2026-10-13.csv");
  });
});
