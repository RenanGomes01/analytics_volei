import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterSeason, seasonStats } from "@/domain/stats/season";
import { ScoutDB } from "@/db/schema";
import { appendTouch } from "@/services/rally-ledger-service";
import { createAthlete, findOrCreateTeam, mergeAthletes } from "@/services/roster-service";
import { loadSeason } from "@/services/season-service";
import { addMatchToTournament, createMatchFromTeams, createTournament } from "@/services/tournament-service";
import { createMatchWithRoster } from "@/services/match-service";

const T = "local";
let db: ScoutDB;
beforeEach(() => {
  db = new ScoutDB(`season-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

describe("loadSeason", () => {
  it("junta partidas de vários torneios + amistosos, com os lances de cada uma, sem duplicar", async () => {
    const [r, p, x, y] = await Promise.all(["Renan", "Pedro", "Xande", "Yuri"].map((name) => createAthlete(db, { tenant_id: T, name, gender: "M" })));
    const rp = await findOrCreateTeam(db, T, { athlete_ids: [r.id, p.id], modality: "beach" });
    const xy = await findOrCreateTeam(db, T, { athlete_ids: [x.id, y.id], modality: "beach" });
    const t1 = await createTournament(db, T, { name: "Etapa 1", start_date: "2026-03-01", modality: "beach", category: "M" });
    const t2 = await createTournament(db, T, { name: "Etapa 2", start_date: "2026-08-01", modality: "beach", category: "M" });
    for (const t of [t1, t2]) {
      const m = await createMatchFromTeams(db, { tenant_id: T, team_a_id: rp.id, team_b_id: xy.id, first_server: "A", tournament_id: t.id });
      await appendTouch(db, { tenant_id: T, match_id: m.id }, { team: "A", athlete_id: r.id, skill: "serve", quality: "#" });
    }
    await createMatchFromTeams(db, { tenant_id: T, team_a_id: rp.id, team_b_id: xy.id, first_server: "A" }); // amistoso

    const season = await loadSeason(db, T);
    expect(season.matches).toHaveLength(3);
    expect(season.matches.map((m) => m.tournament?.name ?? null)).toEqual(["Etapa 1", "Etapa 2", null]);
    expect(season.matches.map((m) => m.events.length)).toEqual([1, 1, 0]);
    expect(season.athletes.get(r.id)?.gender).toBe("M");
    expect(seasonStats(filterSeason(season.matches, { year: 2026 }), season.aliases).athletes[r.id]).toMatchObject({ matches: 2, serve: { aces: 2 } });
  });

  it("partida do MVP vinculada a torneio e atleta unido por alias entram na temporada", async () => {
    const legacy = await createMatchWithRoster(db, {
      tenant_id: T, modality: "beach", first_server: "A",
      team_a: { name: "A", athletes: [{ name: "Renan" }, { name: "Pedro" }] },
      team_b: { name: "B", athletes: [{ name: "X" }, { name: "Y" }] },
    });
    const renan = await createAthlete(db, { tenant_id: T, name: "Renan", gender: "M" });
    await mergeAthletes(db, T, { canonical_id: renan.id, alias_ids: [legacy.team_a.athlete_ids[0]] });
    const t = await createTournament(db, T, { name: "Etapa", start_date: "2026-05-01", modality: "beach" });
    await addMatchToTournament(db, T, { tournament_id: t.id, match_id: legacy.id });
    await appendTouch(db, { tenant_id: T, match_id: legacy.id }, { team: "A", athlete_id: legacy.team_a.athlete_ids[0], skill: "serve", quality: "#" });

    const season = await loadSeason(db, T);
    const stats = seasonStats(filterSeason(season.matches, { year: 2026 }), season.aliases);
    expect(stats.athletes[renan.id]).toMatchObject({ matches: 1, serve: { aces: 1 } });
  });
});
