import { describe, expect, it } from "vitest";
import { availableSkills, nextAction } from "@/domain/rally/next-action";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES, INDOOR_RULES } from "@/domain/rules/modality";
import type { Modality } from "@/domain/types";
import { ledger, matchFixture } from "../helpers";

function next(l: ReturnType<typeof ledger>, modality: Modality = "beach") {
  const rules = modality === "beach" ? BEACH_RULES : INDOOR_RULES;
  const match = matchFixture(modality);
  return nextAction(replayMatch(l.events, { rules, first_server: match.first_server }), match, rules);
}

describe("nextAction — transições do rali", () => {
  it("sem rali aberto: aguarda saque do sacador, só ele pode tocar", () => {
    expect(next(ledger())).toMatchObject({
      stage: "awaiting_serve",
      primary_team: "A",
      allowed_teams: ["A"],
      suggested_skills: ["serve"],
    });
  });

  it("depois do saque de A: B recebe (side-out) e A não pode tocar", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    expect(next(l)).toMatchObject({
      stage: "in_play",
      primary_team: "B",
      allowed_teams: ["B"],
      suggested_skills: ["reception"],
      phase: "side_out",
      suggested_athlete_id: null,
    });
  });

  it.each([
    ["reception", "B", ["set", "attack", "freeball"]],
    ["set", "B", ["attack", "freeball"]],
    ["attack", "A", ["block", "dig"]],
  ] as const)("depois de %s de B: espera %s com %j", (skill, team, skills) => {
    const l = ledger().rally();
    l.touch("A", "serve");
    if (skill !== "reception") l.touch("B", "reception", { athlete_id: "B2" });
    l.touch("B", skill, { athlete_id: "B1" });
    expect(next(l)).toMatchObject({ primary_team: team, suggested_skills: skills, allowed_teams: ["A", "B"] });
  });

  it("depois do bloqueio, a mesma equipe é a primária mas ambas podem tocar", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception");
    l.touch("B", "set");
    l.touch("B", "attack");
    l.touch("A", "block", { athlete_id: "A2" });
    expect(next(l)).toMatchObject({ primary_team: "A", allowed_teams: ["A", "B"], suggested_athlete_id: "A1" });
  });

  it("posse com 3 toques: destaca o adversário, mas ainda permite registrar o 4º toque", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception");
    l.touch("B", "set");
    l.touch("B", "freeball");
    expect(next(l)).toMatchObject({
      primary_team: "A",
      allowed_teams: ["A", "B"],
      suggested_skills: ["block", "dig"],
      possession: { team: "B", touches: 3, max: 3 },
    });
  });

  it("BEACH: bloqueio conta na posse exibida; INDOOR: não", () => {
    const build = () => {
      const l = ledger().rally();
      l.touch("A", "serve");
      l.touch("B", "reception");
      l.touch("B", "set");
      l.touch("B", "attack");
      l.touch("A", "block");
      return l;
    };
    expect(next(build(), "beach").possession).toMatchObject({ team: "A", touches: 1 });
    expect(next(build(), "indoor").possession).toMatchObject({ team: "A", touches: 0 });
  });

  it("partida encerrada: nenhum toque permitido", () => {
    const l = ledger();
    for (let i = 0; i < 42; i++) l.point("A", "A");
    expect(next(l)).toMatchObject({ stage: "match_over", allowed_teams: [] });
  });
});

describe("nextAction — pré-seleção de atleta (beach)", () => {
  it("sugere o parceiro de quem tocou por último na mesma posse", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception", { athlete_id: "B2" });
    expect(next(l).suggested_athlete_id).toBe("B1");
    l.touch("B", "set", { athlete_id: "B1" });
    expect(next(l).suggested_athlete_id).toBe("B2");
  });

  it("sacador: repete enquanto a equipe pontua e alterna ao recuperar o saque", () => {
    const l = ledger();
    const rally = (server: string, winner: "A" | "B") => {
      l.rally();
      l.touch(server[0] as "A" | "B", "serve", { athlete_id: server });
      l.end(winner);
    };
    expect(next(l).suggested_athlete_id).toBeNull(); // primeiro saque do set: o analista escolhe
    rally("A1", "A");
    expect(next(l).suggested_athlete_id).toBe("A1"); // A pontuou: A1 continua
    rally("A1", "B");
    expect(next(l).suggested_athlete_id).toBeNull(); // B nunca sacou neste set
    rally("B2", "A");
    expect(next(l).suggested_athlete_id).toBe("A2"); // A recuperou: alterna para A2
  });

  it("INDOOR: não sugere atleta", () => {
    const l = ledger().rally();
    l.touch("A", "serve");
    l.touch("B", "reception", { athlete_id: "B2" });
    expect(next(l, "indoor").suggested_athlete_id).toBeNull();
  });
});

describe("availableSkills", () => {
  it("aguardando saque: só saque; em jogo: sugeridos primeiro e sem saque", () => {
    expect(availableSkills(next(ledger()), "A")).toEqual(["serve"]);
    const l = ledger().rally();
    l.touch("A", "serve");
    const skills = availableSkills(next(l), "B");
    expect(skills[0]).toBe("reception");
    expect(skills).not.toContain("serve");
  });
});
