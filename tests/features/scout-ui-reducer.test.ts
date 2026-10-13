import { describe, expect, it } from "vitest";
import type { NextAction } from "@/domain/rally/next-action";
import {
  effectiveSelection,
  initialScoutUiState,
  scoutUiReducer,
  type ScoutUiAction,
  type ScoutUiState,
} from "@/features/scout/scout-ui-reducer";

const inPlay: NextAction = {
  stage: "in_play",
  primary_team: "B",
  allowed_teams: ["A", "B"],
  suggested_skills: ["set", "attack", "freeball"],
  suggested_athlete_id: "B1",
  phase: "side_out",
  possession: { team: "B", touches: 1, max: 3 },
};

const run = (...actions: ScoutUiAction[]) => actions.reduce<ScoutUiState>(scoutUiReducer, initialScoutUiState);

describe("scoutUiReducer", () => {
  it("idle usa a sugestão derivada como seleção armada", () => {
    expect(effectiveSelection(initialScoutUiState, inPlay)).toEqual({ team: "B", athlete_id: "B1", skill: "set" });
    expect(effectiveSelection(initialScoutUiState, { ...inPlay, suggested_athlete_id: null })).toBeNull();
  });

  it("tocar em outro atleta da mesma equipe troca o atleta e mantém o fundamento", () => {
    const s = run(
      { type: "pickSkill", skill: "attack", next: inPlay },
      { type: "pickAthlete", team: "B", athlete_id: "B2", next: inPlay },
    );
    expect(s).toMatchObject({ mode: "armed", selection: { athlete_id: "B2", skill: "attack" } });
  });

  it("tocar em atleta da outra equipe usa o fundamento padrão dela", () => {
    const s = run({ type: "pickAthlete", team: "A", athlete_id: "A1", next: inPlay });
    expect(s).toMatchObject({ mode: "armed", selection: { team: "A", skill: "dig" } });
  });

  it("tocar no atleta já selecionado cancela, inclusive a sugestão", () => {
    const s = run({ type: "pickAthlete", team: "B", athlete_id: "B1", next: inPlay });
    expect(s.mode).toBe("cleared");
    expect(effectiveSelection(s, inPlay)).toBeNull();
  });

  it("equipe não permitida é ignorada", () => {
    const onlyA = { ...inPlay, allowed_teams: ["A"] as NextAction["allowed_teams"] };
    expect(run({ type: "pickAthlete", team: "B", athlete_id: "B2", next: onlyA })).toBe(initialScoutUiState);
  });

  it("saving bloqueia novas seleções e um segundo commit (toque duplo)", () => {
    const saving = run({ type: "commitStart", next: inPlay });
    expect(saving).toMatchObject({ mode: "saving", selection: { athlete_id: "B1" } });
    expect(scoutUiReducer(saving, { type: "pickAthlete", team: "B", athlete_id: "B2", next: inPlay })).toBe(saving);
    expect(scoutUiReducer(saving, { type: "commitStart", next: inPlay })).toBe(saving);
    expect(scoutUiReducer(saving, { type: "cancel" })).toBe(saving);
  });

  it("ledgerChanged volta para idle (novo contexto) e limpa o erro do commit", () => {
    const s = run({ type: "commitStart", next: inPlay }, { type: "ledgerChanged" });
    expect(s).toEqual({ mode: "idle", error: null });
  });

  it("commitFailed devolve a seleção armada com a mensagem de erro", () => {
    const s = run({ type: "commitStart", next: inPlay }, { type: "commitFailed", message: "falhou" });
    expect(s).toMatchObject({ mode: "armed", selection: { athlete_id: "B1" }, error: "falhou" });
    expect(scoutUiReducer(s, { type: "dismissError" }).error).toBeNull();
  });

  it("pickSkill sem seleção não faz nada", () => {
    const cleared = run({ type: "cancel" });
    expect(scoutUiReducer(cleared, { type: "pickSkill", skill: "attack", next: inPlay })).toBe(cleared);
  });
});
