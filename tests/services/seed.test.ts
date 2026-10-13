import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScoutDB } from "@/db/schema";
import { replayMatch } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import { rankAthletes, rankingSpecs } from "@/domain/stats/rankings";
import { athletePartners, athletesByGender, filterSeason, seasonStats, teamsByGender } from "@/domain/stats/season";
import { rankTeams, TEAM_RANKINGS } from "@/domain/stats/team-rankings";
import { createMatchWithRoster } from "@/services/match-service";
import { appendRallies, appendRally, appendTouch, listMatchEvents } from "@/services/rally-ledger-service";
import { createRng, generateRally } from "@/domain/dev/rally-generator";
import { DEV_SEED_TOTAL_MATCHES, getDevSeed, removeDemoData, seedDemoData } from "@/services/dev/seed-service";
import { loadSeason } from "@/services/season-service";

const T = "local";
let db: ScoutDB;
beforeEach(() => {
  db = new ScoutDB(`seed-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

describe("seedDemoData", () => {
  it("gera um ano de jogos completos que enchem todos os rankings, em M e F", async () => {
    const progress: number[] = [];
    const record = await seedDemoData(db, T, { onProgress: (done) => progress.push(done) });
    expect(record.match_ids).toHaveLength(DEV_SEED_TOTAL_MATCHES);
    expect(progress.at(-1)).toBe(DEV_SEED_TOTAL_MATCHES);

    const season = await loadSeason(db, T);
    for (const { match, events } of season.matches) {
      const state = replayMatch(events, { rules: rulesFor("beach"), first_server: match.first_server });
      expect(state.winner).not.toBeNull();
      for (const set of state.sets) {
        const target = set.set_number === 3 ? 15 : 21;
        const [hi, lo] = [Math.max(set.score.A, set.score.B), Math.min(set.score.A, set.score.B)];
        expect(hi >= target && hi - lo >= 2 && (hi === target || hi - lo === 2)).toBe(true);
      }
    }

    const stats = seasonStats(filterSeason(season.matches, { year: 2026 }), season.aliases);
    for (const gender of ["M", "F"] as const) {
      const athletes = athletesByGender(stats, season.athletes, gender);
      expect(athletes.missingGender).toBe(0);
      for (const spec of rankingSpecs("beach")) {
        expect(rankAthletes(athletes.included, spec, { nameOf: (id) => id }).length, `${gender} ${spec.metric}`).toBeGreaterThanOrEqual(3);
      }
      const teams = teamsByGender(stats, season.athletes, gender).included;
      for (const spec of TEAM_RANKINGS) {
        expect(rankTeams(teams, spec, { nameOf: (k) => k }).length, `${gender} ${spec.metric}`).toBeGreaterThanOrEqual(3);
      }
    }

    // Renan trocou de parceiro entre as etapas.
    const renan = record.showcase.athlete_id;
    expect(athletePartners(season.matches, renan, season.aliases).map((p) => season.athletes.get(p.partner_ids[0])?.name).sort()).toEqual(["George", "Pedro"]);
    // Amistoso de 2025 deixa dois anos no filtro.
    expect(filterSeason(season.matches, { year: 2025, includeFriendlies: true }).length).toBeGreaterThan(0);
  }, 60_000);

  it("não injeta duas vezes e remove só o que criou", async () => {
    const real = await createMatchWithRoster(db, {
      tenant_id: T, modality: "beach", first_server: "A",
      team_a: { name: "A", athletes: [{ name: "Real 1" }, { name: "Real 2" }] },
      team_b: { name: "B", athletes: [{ name: "Real 3" }, { name: "Real 4" }] },
    });
    await appendTouch(db, { tenant_id: T, match_id: real.id }, { team: "A", athlete_id: real.team_a.athlete_ids[0], skill: "serve", quality: "#" });
    const before = { matches: await db.matches.count(), events: await db.rally_events.count(), athletes: await db.athletes.count(), outbox: await db.outbox.count() };

    await seedDemoData(db, T, { maxMatches: 2 });
    expect(await db.matches.count()).toBe(before.matches + 2);
    await expect(seedDemoData(db, T)).rejects.toThrow(/já foram injetados/);

    expect(await removeDemoData(db, T)).toBe(true);
    expect(await getDevSeed(db)).toBeUndefined();
    expect({ matches: await db.matches.count(), events: await db.rally_events.count(), athletes: await db.athletes.count(), outbox: await db.outbox.count() }).toEqual(before);
    expect(await db.tournaments.count()).toBe(0);
    expect(await removeDemoData(db, T)).toBe(false);
  }, 60_000);
});

describe("appendRallies", () => {
  it("em lote dá o mesmo placar, ralis e fases que appendRally um a um", async () => {
    const mk = () =>
      createMatchWithRoster(db, {
        tenant_id: T, modality: "beach", first_server: "B",
        team_a: { name: "A", athletes: [{ name: "a1" }, { name: "a2" }] },
        team_b: { name: "B", athletes: [{ name: "b1" }, { name: "b2" }] },
      });
    const [m1, m2] = [await mk(), await mk()];
    const avg = { serve: 0.5, pass: 0.5, attack: 0.5, block: 0.5, dig: 0.5 };
    const gen = (m: typeof m1, rng: () => number) => (serving: "A" | "B") => {
      const athletes = { A: m.team_a.athlete_ids as [string, string], B: m.team_b.athlete_ids as [string, string] };
      return generateRally({ serving_team: serving, server_id: athletes[serving][0], athletes, profiles: Object.fromEntries([...athletes.A, ...athletes.B].map((id) => [id, avg])) }, rng);
    };
    const rules = rulesFor("beach");
    const one = gen(m1, createRng(9));
    for (let i = 0; i < 30; i++) {
      const state = replayMatch(await listMatchEvents(db, { tenant_id: T, match_id: m1.id }), { rules, first_server: "B" });
      const r = one(state.serving_team);
      await appendRally(db, { tenant_id: T, match_id: m1.id }, r.touches, r.end);
    }
    const batch = gen(m2, createRng(9));
    let n = 0;
    await appendRallies(db, { tenant_id: T, match_id: m2.id }, (state) => (n++ < 30 ? batch(state.serving_team) : null));

    const shape = async (id: string) => {
      const events = await listMatchEvents(db, { tenant_id: T, match_id: id });
      const state = replayMatch(events, { rules, first_server: "B" });
      return { sets: state.sets.map((s) => s.score), rallies: state.rallies.length, phases: events.map((e) => (e.kind === "touch" ? e.phase : e.kind)), seqs: events.map((e) => e.local_seq) };
    };
    expect(await shape(m2.id)).toEqual(await shape(m1.id));
  }, 30_000);
});
