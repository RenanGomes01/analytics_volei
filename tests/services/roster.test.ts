import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { createMatchWithRoster } from "@/services/match-service";
import {
  createAthlete,
  findOrCreateTeam,
  getAliasMap,
  listTeams,
  mergeAthletes,
  renameTeam,
  unmergeAthlete,
  updateAthlete,
} from "@/services/roster-service";
import {
  addMatchToTournament,
  createMatchFromTeams,
  createTournament,
  listTournamentMatches,
  listTournaments,
  removeMatchFromTournament,
  setMatchCompetition,
  setMatchPhase,
} from "@/services/tournament-service";
import { appendTouch } from "@/services/rally-ledger-service";

const T = "local";
let db: ScoutDB;
/** Outbox na ordem de criação (a chave primária é um UUID aleatório). */
const outbox = async () => (await db.outbox.toArray()).sort((a, b) => a.created_at - b.created_at);

beforeEach(() => {
  db = new ScoutDB(`roster-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

const athlete = (name: string, jersey_number?: number) => createAthlete(db, { tenant_id: T, name, jersey_number });

async function fourAthletes() {
  return Promise.all([athlete("Renan", 1), athlete("Pedro", 2), athlete("André", 3), athlete("George", 4)]);
}

describe("atletas", () => {
  it("edição de nome e número vai para o outbox como upsert", async () => {
    const renan = await athlete("Renan");
    const updated = await updateAthlete(db, T, renan.id, { name: "  Renan Gomes ", jersey_number: 7 });
    expect(updated).toMatchObject({ name: "Renan Gomes", jersey_number: 7 });
    expect((await outbox()).map((e) => [e.entity, e.op])).toEqual([["athlete", "insert"], ["athlete", "upsert"]]);
    await expect(updateAthlete(db, T, renan.id, { name: "  " })).rejects.toThrow(/vazio/);
    expect(await updateAthlete(db, T, renan.id, { jersey_number: null })).not.toHaveProperty("jersey_number");
  });
});

describe("duplas", () => {
  it("uma dupla por par de atletas: o mesmo par (em qualquer ordem) reutiliza a dupla", async () => {
    const [r, p] = await fourAthletes();
    const first = await findOrCreateTeam(db, T, { athlete_ids: [r.id, p.id], modality: "beach" });
    const again = await findOrCreateTeam(db, T, { athlete_ids: [p.id, r.id], modality: "beach", name: "Outro nome" });
    expect(again.id).toBe(first.id);
    expect(first.name).toBe("Renan / Pedro");
    expect(await db.teams.count()).toBe(1);
  });

  it("valida o tamanho da dupla e renomeia", async () => {
    const [r, p] = await fourAthletes();
    await expect(findOrCreateTeam(db, T, { athlete_ids: [r.id, r.id], modality: "beach" })).rejects.toThrow(/2 atletas diferentes/);
    await expect(findOrCreateTeam(db, T, { athlete_ids: [r.id], modality: "indoor" })).rejects.toThrow(/de 6 a 14/);
    const team = await findOrCreateTeam(db, T, { athlete_ids: [r.id, p.id], modality: "beach" });
    expect((await renameTeam(db, T, team.id, "Renan e Pedro")).name).toBe("Renan e Pedro");
    expect((await listTeams(db, T, "beach")).map((t) => t.name)).toEqual(["Renan e Pedro"]);
  });
});

describe("unir atletas duplicadas (jogos do MVP)", () => {
  async function mvpMatch(names: [string, string, string, string]) {
    return createMatchWithRoster(db, {
      tenant_id: T,
      modality: "beach",
      first_server: "A",
      team_a: { name: "A", athletes: [{ name: names[0] }, { name: names[1] }] },
      team_b: { name: "B", athletes: [{ name: names[2] }, { name: names[3] }] },
    });
  }

  it("une sem reescrever partidas nem lances, sem cadeias, e desfaz", async () => {
    const m1 = await mvpMatch(["Renan", "Pedro", "André", "George"]);
    const m2 = await mvpMatch(["Renan", "Pedro", "X", "Y"]);
    const m3 = await mvpMatch(["Renan", "Z", "W", "K"]);
    const [r1, r2, r3] = [m1.team_a.athlete_ids[0], m2.team_a.athlete_ids[0], m3.team_a.athlete_ids[0]];
    const matchesBefore = await db.matches.toArray();

    await mergeAthletes(db, T, { canonical_id: r2, alias_ids: [r3] });
    await mergeAthletes(db, T, { canonical_id: r1, alias_ids: [r2] }); // r3 apontava para r2 → passa a r1
    expect(Object.fromEntries(await getAliasMap(db, T))).toEqual({ [r2]: r1, [r3]: r1 });
    expect(await db.matches.toArray()).toEqual(matchesBefore);

    await unmergeAthlete(db, T, r3);
    expect(Object.fromEntries(await getAliasMap(db, T))).toEqual({ [r2]: r1 });
    expect((await outbox()).filter((e) => e.entity === "athlete_alias").map((e) => e.op)).toEqual(["upsert", "upsert", "upsert", "delete"]);
  });

  it("recusa unir duas atletas que jogaram a mesma partida", async () => {
    const m = await mvpMatch(["Renan", "Pedro", "André", "George"]);
    const [renan, pedro] = m.team_a.athlete_ids;
    await expect(mergeAthletes(db, T, { canonical_id: renan, alias_ids: [pedro] })).rejects.toThrow(/jogaram a mesma partida/);
    const andre = m.team_b.athlete_ids[0];
    await expect(mergeAthletes(db, T, { canonical_id: renan, alias_ids: [andre] })).rejects.toThrow(/mesma partida/);
    expect(await db.athlete_aliases.count()).toBe(0);
  });

  it("dupla nova com atleta unida usa o id canônico (mesma dupla dos jogos antigos)", async () => {
    const m1 = await mvpMatch(["Renan", "Pedro", "A", "B"]);
    const m2 = await mvpMatch(["Renan", "Pedro", "C", "D"]);
    await mergeAthletes(db, T, { canonical_id: m1.team_a.athlete_ids[0], alias_ids: [m2.team_a.athlete_ids[0]] });
    await mergeAthletes(db, T, { canonical_id: m1.team_a.athlete_ids[1], alias_ids: [m2.team_a.athlete_ids[1]] });
    const fromOld = await findOrCreateTeam(db, T, { athlete_ids: m1.team_a.athlete_ids, modality: "beach" });
    const fromNew = await findOrCreateTeam(db, T, { athlete_ids: m2.team_a.athlete_ids, modality: "beach" });
    expect(fromNew.id).toBe(fromOld.id);
    expect(fromNew.athlete_ids).toEqual(m1.team_a.athlete_ids);
  });
});

describe("torneios e partidas", () => {
  async function setup() {
    const [r, p, a, g] = await fourAthletes();
    const teamA = await findOrCreateTeam(db, T, { athlete_ids: [r.id, p.id], modality: "beach" });
    const teamB = await findOrCreateTeam(db, T, { athlete_ids: [a.id, g.id], modality: "beach" });
    const tournament = await createTournament(db, T, { name: "Etapa Saquarema", start_date: "2026-10-10", end_date: "2026-10-13", modality: "beach" });
    return { r, teamA, teamB, tournament };
  }

  it("valida o torneio e lista do mais recente para o mais antigo", async () => {
    await expect(createTournament(db, T, { name: " ", start_date: "2026-10-10", modality: "beach" })).rejects.toThrow(/nome/);
    await expect(createTournament(db, T, { name: "X", start_date: "10/10/2026", modality: "beach" })).rejects.toThrow(/início/);
    await expect(createTournament(db, T, { name: "X", start_date: "2026-10-10", end_date: "2026-10-01", modality: "beach" })).rejects.toThrow(/fim/);
    await createTournament(db, T, { name: "Velho", start_date: "2026-01-01", modality: "beach" });
    await createTournament(db, T, { name: "Novo", start_date: "2026-09-01", modality: "beach" });
    expect((await listTournaments(db, T)).map((t) => t.name)).toEqual(["Novo", "Velho"]);
  });

  it("createMatchFromTeams grava partida (retrato das duplas), vínculo e outbox de forma atômica", async () => {
    const { r, teamA, teamB, tournament } = await setup();
    const athletesBefore = await db.athletes.count();
    const match = await createMatchFromTeams(db, { tenant_id: T, team_a_id: teamA.id, team_b_id: teamB.id, first_server: "B", tournament_id: tournament.id });

    expect(match).toMatchObject({ modality: "beach", team_a: { name: "Renan / Pedro", athlete_ids: teamA.athlete_ids }, first_server: "B" });
    expect(match.team_a.athlete_ids).toContain(r.id); // atleta reutilizada, não recriada
    expect(await db.athletes.count()).toBe(athletesBefore);
    expect((await listTournamentMatches(db, T, tournament.id)).map((m) => m.id)).toEqual([match.id]);

    vi.spyOn(db.tournament_entries, "add").mockRejectedValueOnce(new Error("falhou"));
    const matchesBefore = await db.matches.count();
    await expect(
      createMatchFromTeams(db, { tenant_id: T, team_a_id: teamA.id, team_b_id: teamB.id, first_server: "A", tournament_id: tournament.id }),
    ).rejects.toThrow("falhou");
    expect(await db.matches.count()).toBe(matchesBefore);
  });

  it("recusa a mesma atleta nos dois lados e modalidade diferente do torneio", async () => {
    const { teamA, teamB } = await setup();
    await expect(createMatchFromTeams(db, { tenant_id: T, team_a_id: teamA.id, team_b_id: teamA.id, first_server: "A" })).rejects.toThrow(/duas duplas/);
    const indoor = await createTournament(db, T, { name: "Liga", start_date: "2026-10-10", modality: "indoor" });
    await expect(
      createMatchFromTeams(db, { tenant_id: T, team_a_id: teamA.id, team_b_id: teamB.id, first_server: "A", tournament_id: indoor.id }),
    ).rejects.toThrow(/modalidade/);
  });

  it("partida do MVP entra no torneio por vínculo: idempotente, um torneio só, e pode sair", async () => {
    const { tournament } = await setup();
    const legacy = await createMatchWithRoster(db, {
      tenant_id: T,
      modality: "beach",
      first_server: "A",
      team_a: { name: "A", athletes: [{ name: "a" }, { name: "b" }] },
      team_b: { name: "B", athletes: [{ name: "c" }, { name: "d" }] },
    });
    const before = structuredClone(legacy);
    const entry = await addMatchToTournament(db, T, { tournament_id: tournament.id, match_id: legacy.id });
    expect((await addMatchToTournament(db, T, { tournament_id: tournament.id, match_id: legacy.id })).id).toBe(entry.id);
    expect(await db.tournament_entries.count()).toBe(1);
    expect(await db.matches.get(legacy.id)).toEqual(before); // a partida não muda

    const other = await createTournament(db, T, { name: "Outra", start_date: "2026-11-01", modality: "beach" });
    await expect(addMatchToTournament(db, T, { tournament_id: other.id, match_id: legacy.id })).rejects.toThrow(/outro torneio/);

    await removeMatchFromTournament(db, T, entry.id);
    expect(await listTournamentMatches(db, T, tournament.id)).toEqual([]);
  });

  describe("setMatchCompetition (edição da partida)", () => {
    async function friendly() {
      const { teamA, teamB, tournament } = await setup();
      const match = await createMatchFromTeams(db, { tenant_id: T, team_a_id: teamA.id, team_b_id: teamB.id, first_server: "A" });
      await appendTouch(db, { tenant_id: T, match_id: match.id }, { team: "A", athlete_id: teamA.athlete_ids[0], skill: "serve", quality: "+" });
      return { match, tournament, teamA, teamB };
    }
    const snapshot = async (match_id: string) => ({
      match: await db.matches.get(match_id),
      events: await db.rally_events.where("match_id").equals(match_id).toArray(),
    });

    it("amistoso com lances vai para o torneio já nas oitavas: 1 vínculo, 1 mutação, lances intocados", async () => {
      const { match, tournament } = await friendly();
      const before = await snapshot(match.id);
      const outboxBefore = (await outbox()).length;

      const entry = await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "round_of_16" });

      expect(entry).toMatchObject({ id: `${tournament.id}:${match.id}`, tournament_id: tournament.id, phase: "round_of_16" });
      const added = (await outbox()).slice(outboxBefore);
      expect(added.map((e) => [e.entity, e.op, (e.payload as { phase?: string }).phase])).toEqual([["tournament_entry", "insert", "round_of_16"]]);
      expect(await snapshot(match.id)).toEqual(before);
    });

    it("fase de grupos → oitavas no mesmo torneio é um upsert do mesmo vínculo; sem mudança não grava", async () => {
      const { match, tournament } = await friendly();
      const entry = await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "group" });
      const outboxBefore = (await outbox()).length;

      const fixed = await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "round_of_16" });
      expect(fixed?.id).toBe(entry?.id);
      expect((await outbox()).slice(outboxBefore).map((e) => [e.op, (e.payload as { phase?: string }).phase])).toEqual([["upsert", "round_of_16"]]);

      await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "round_of_16" });
      expect((await outbox()).length).toBe(outboxBefore + 1);
    });

    it("troca de torneio e volta a amistoso: lápide do vínculo antigo, sem mexer na partida", async () => {
      const { match, tournament } = await friendly();
      const other = await createTournament(db, T, { name: "Campeonato Estadual", start_date: "2026-10-17", modality: "beach" });
      await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "group" });
      const before = await snapshot(match.id);
      const outboxBefore = (await outbox()).length;

      await setMatchCompetition(db, T, match.id, { tournament_id: other.id, phase: "quarterfinal" });
      expect(await db.tournament_entries.where("match_id").equals(match.id).toArray()).toMatchObject([{ tournament_id: other.id, phase: "quarterfinal" }]);
      expect((await outbox()).slice(outboxBefore).map((e) => [e.op, e.entity_id])).toEqual([
        ["delete", `${tournament.id}:${match.id}`],
        ["insert", `${other.id}:${match.id}`],
      ]);

      expect(await setMatchCompetition(db, T, match.id, { tournament_id: null, phase: "final" })).toBeNull();
      expect(await db.tournament_entries.where("match_id").equals(match.id).count()).toBe(0);
      expect(await snapshot(match.id)).toEqual(before);
    });

    it("recusa torneio de outra modalidade e desfaz tudo se o novo vínculo falhar", async () => {
      const { match, tournament } = await friendly();
      const indoor = await createTournament(db, T, { name: "Liga", start_date: "2026-10-10", modality: "indoor" });
      await expect(setMatchCompetition(db, T, match.id, { tournament_id: indoor.id, phase: null })).rejects.toThrow(/modalidade/);

      await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "group" });
      const other = await createTournament(db, T, { name: "Outra", start_date: "2026-11-01", modality: "beach" });
      const outboxBefore = (await outbox()).length;
      vi.spyOn(db.tournament_entries, "add").mockRejectedValueOnce(new Error("falhou"));
      await expect(setMatchCompetition(db, T, match.id, { tournament_id: other.id, phase: "final" })).rejects.toThrow("falhou");
      expect(await db.tournament_entries.where("match_id").equals(match.id).toArray()).toMatchObject([{ tournament_id: tournament.id, phase: "group" }]);
      expect((await outbox()).length).toBe(outboxBefore);
    });

    it("vínculo de dado local_only continua local_only", async () => {
      const { match, tournament } = await friendly();
      const entry = await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "group" });
      await db.outbox.where("entity_id").equals(entry!.id).modify({ status: "local_only" });
      await setMatchPhase(db, T, entry!.id, "semifinal");
      await setMatchCompetition(db, T, match.id, { tournament_id: tournament.id, phase: "final" });
      const statuses = (await db.outbox.where("entity_id").equals(entry!.id).toArray()).map((e) => e.status);
      expect(new Set(statuses)).toEqual(new Set(["local_only"]));
    });
  });
});
