import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateExportData } from "@/domain/export/validate-export-data";
import { ScoutDB } from "@/db/schema";
import { exportMatch } from "@/services/export/export-service";
import { createMatch } from "@/services/match-service";
import {
  appendRallyEnd,
  chooseServer,
  getMatchState,
  undoLastAction,
  type MatchScope,
} from "@/services/rally-ledger-service";

let db: ScoutDB;
let scope: MatchScope;

beforeEach(async () => {
  db = new ScoutDB(`serve-${crypto.randomUUID()}`);
  const m = await createMatch(db, {
    tenant_id: "t",
    modality: "beach",
    team_a: { name: "A", athlete_ids: ["A1", "A2"] },
    team_b: { name: "B", athlete_ids: ["B1", "B2"] },
    first_server: "A",
  });
  scope = { tenant_id: "t", match_id: m.id };
});
afterEach(async () => {
  await db.delete();
});

describe("quem começa sacando (set_start)", () => {
  it("no 0×0 troca o sacador sem alterar a partida; o primeiro ponto segue a regra", async () => {
    const matchBefore = await db.matches.get(scope.match_id);
    await chooseServer(db, scope, "B");
    let state = await getMatchState(db, scope);
    expect(state).toMatchObject({ serving_team: "B", sets: [{ first_server: "B" }] });
    expect(await db.matches.get(scope.match_id)).toEqual(matchBefore);

    await appendRallyEnd(db, scope, { point_to: "B", reason: "manual" });
    state = await getMatchState(db, scope);
    expect(state.rallies[0]).toMatchObject({ serving_team: "B", rally_number: 1 });
    expect(state.serving_team).toBe("B");
  });

  it("depois do primeiro ponto do set é recusado", async () => {
    await appendRallyEnd(db, scope, { point_to: "A", reason: "manual" });
    await expect(chooseServer(db, scope, "B")).rejects.toThrow(/antes do primeiro ponto/);
  });

  it("escolher o lado que já saca não grava nada; desfazer volta ao sacador da partida", async () => {
    expect(await chooseServer(db, scope, "A")).toBeNull();
    await chooseServer(db, scope, "B");
    await undoLastAction(db, scope);
    expect((await getMatchState(db, scope)).serving_team).toBe("A");
  });

  it("vale no início de cada set (sorteio do set decisivo)", async () => {
    for (let i = 0; i < 21; i++) await appendRallyEnd(db, scope, { point_to: "A", reason: "manual" });
    expect((await getMatchState(db, scope)).serving_team).toBe("B"); // alternância do set 2
    await chooseServer(db, scope, "A");
    const state = await getMatchState(db, scope);
    expect(state).toMatchObject({ current_set: 2, serving_team: "A" });
    expect(state.sets[1].first_server).toBe("A");
  });

  it("o evento passa na validação da exportação", async () => {
    await chooseServer(db, scope, "B");
    const errors = validateExportData((await exportMatch(db, scope)).envelope.data);
    // (As atletas deste cenário são fictícias; aqui só interessa o evento de sacador inicial.)
    expect(errors.filter((e) => e.startsWith("Evento"))).toEqual([]);
  });
});
