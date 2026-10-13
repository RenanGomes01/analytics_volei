import { describe, expect, it } from "vitest";
import { competitionCsvFilename, competitionToCsv } from "@/domain/export/competition-csv";
import { pairKey } from "@/domain/roster/identity";
import type { Tournament } from "@/domain/roster/types";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import type { Match } from "@/domain/types";
import { ledger } from "../helpers";

const m = (id: string): Match => ({
  id,
  tenant_id: "t1",
  modality: "beach",
  rules_version: "beach-2026",
  team_a: { name: "R/P", athlete_ids: ["R", "P"] },
  team_b: { name: "X/Y", athlete_ids: ["X", "Y"] },
  first_server: "A",
  created_at: 0,
});

describe("CSV do torneio", () => {
  const l1 = ledger("m1");
  for (let i = 0; i < 42; i++) l1.point("A", "A"); // R/P vence 2×0 com aces de "A1" (fora do elenco)
  const stats = aggregateCompetition([{ match: m("m1"), events: l1.events }]);
  const tournament: Tournament = { id: "t", tenant_id: "t1", name: "Etapa Saquarema", location: "Saquarema; RJ", start_date: "2026-10-10", end_date: "2026-10-13", modality: "beach", created_at: 0 };
  const names: Record<string, string> = { R: "Renan", P: "Pedro", X: "Xande", Y: "Yuri", A1: "Ace" };
  const csv = competitionToCsv({
    stats,
    tournament,
    athleteName: (id) => names[id] ?? id,
    athleteNumber: () => null,
    teamName: (key) => (key === pairKey(["R", "P"]) ? "Renan / Pedro" : "Xande / Yuri"),
  });
  const lines = csv.replace(/^﻿/, "").split("\r\n");

  it("cabeçalho do torneio, BOM e local com ; entre aspas", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('Torneio;Etapa Saquarema;Local;"Saquarema; RJ";Modalidade;Beach;Período;10/10/2026 a 13/10/2026');
    expect(lines[1]).toBe("Jogos;1;Encerrados;1;Sets;2;Ralis;42");
  });

  it("duplas ordenadas por vitórias, com V/D e sets", () => {
    expect(lines[3].startsWith("Dupla;J;V;D;Sets +;Sets -;Pontos pró;Pontos contra")).toBe(true);
    expect(lines[4].startsWith("Renan / Pedro;1;1;0;2;0;42;0")).toBe(true);
    expect(lines[5].startsWith("Xande / Yuri;1;0;1;0;2;0;42")).toBe(true);
  });

  it("nome do arquivo", () => {
    expect(competitionCsvFilename(tournament)).toBe("torneio_etapa-saquarema_2026-10-10.csv");
  });
});
