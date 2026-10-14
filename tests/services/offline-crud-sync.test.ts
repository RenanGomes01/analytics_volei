import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoutDB } from "@/db/schema";
import { canonicalJson } from "@/domain/export/canonical-json";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import type { TeamSide } from "@/domain/types";
import { createAthlete } from "@/services/athlete-service";
import { deleteMatch, listDeletedMatches, listMatches, restoreMatch, updateMatchTeams } from "@/services/match-service";
import { listPending } from "@/services/outbox-service";
import { appendRally } from "@/services/rally-ledger-service";
import { deleteAthlete, deleteTeam, findOrCreateTeam, updateAthlete } from "@/services/roster-service";
import { loadSeason } from "@/services/season-service";
import { retryPendingNow } from "@/services/sync/account-service";
import { runPull } from "@/services/sync/pull-service";
import { SupabaseTransport } from "@/services/sync/supabase-transport";
import { getSyncStatus, runSyncCycle } from "@/services/sync/sync-engine";
import { getSyncSummary } from "@/services/sync/sync-summary";
import {
  createMatchFromTeams,
  createTournament,
  deleteTournament,
  listTournamentMatches,
  setMatchPhase,
  updateTournament,
} from "@/services/tournament-service";
import { FakeSupabase } from "../helpers/fake-supabase";

/**
 * Fase 10, o cenário da beira da quadra: tudo offline (criar, editar, excluir), depois a rede volta,
 * "Sincronizar agora" esvazia a fila, a nuvem guarda as lápides e um segundo aparelho fica igual.
 */

vi.setConfig({ testTimeout: 60_000 });

const T = "local";
const dbs: ScoutDB[] = [];
const newDb = () => {
  const db = new ScoutDB(`crud-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

async function pushAll(db: ScoutDB, transport: SupabaseTransport) {
  for (let i = 0; i < 20 && (await listPending(db, T)).length > 0; i++) await runSyncCycle(db, transport, { tenant_id: T, batchSize: 50 });
}

/** Alguns ralis por ace/erro de saque, alternando quem pontua. */
async function playRallies(db: ScoutDB, match_id: string, servers: Record<TeamSide, string>, n: number) {
  for (let i = 0; i < n; i++) {
    const team: TeamSide = i % 2 ? "B" : "A";
    await appendRally(db, { tenant_id: T, match_id }, [{ team, athlete_id: servers[team], skill: "serve", quality: "#" }], { point_to: team, reason: "ace" });
  }
}

async function buildOfflineSeason(db: ScoutDB) {
  const [ana, bia, julia, larissa] = await Promise.all(
    ["Ana", "Bia", "Júlia", "Larissa"].map((name) => createAthlete(db, { tenant_id: T, name, gender: "F" })),
  );
  const typo = await createAthlete(db, { tenant_id: T, name: "Larisa (erro)", gender: "F" });
  const ab = await findOrCreateTeam(db, T, { athlete_ids: [ana.id, bia.id], modality: "beach" });
  const jl = await findOrCreateTeam(db, T, { athlete_ids: [julia.id, larissa.id], modality: "beach" });
  const wrongTeam = await findOrCreateTeam(db, T, { athlete_ids: [julia.id, typo.id], modality: "beach" });
  const open = await createTournament(db, T, { name: "Open", start_date: "2026-10-10", modality: "beach" });

  const matches = [];
  for (let i = 0; i < 3; i++) {
    const m = await createMatchFromTeams(db, { tenant_id: T, team_a_id: ab.id, team_b_id: jl.id, first_server: "A", tournament_id: open.id, phase: "group" });
    await playRallies(db, m.id, { A: ana.id, B: julia.id }, 4 + i);
    matches.push(m);
  }
  return { ana, typo, ab, jl, wrongTeam, open, matches };
}

describe("CRUD offline → sync → segundo aparelho", () => {
  it("criar, editar e excluir sem rede; ao voltar, a fila esvazia, a nuvem tem as lápides e o PC fica igual", async () => {
    const tablet = newDb();
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    server.offline = true;

    // --- Sem rede, na quadra ---
    const s = await buildOfflineSeason(tablet);
    await updateAthlete(tablet, T, s.ana.id, { name: "Ana Paula" });
    await updateTournament(tablet, T, s.open.id, { name: "Open Nacional" });
    const [entry] = await tablet.tournament_entries.where("match_id").equals(s.matches[2].id).toArray();
    await setMatchPhase(tablet, T, entry.id, "final");
    await deleteTeam(tablet, T, s.wrongTeam.id);
    await deleteAthlete(tablet, T, s.typo.id);
    await deleteMatch(tablet, T, s.matches[1].id);

    expect((await listMatches(tablet, T)).map((m) => m.id).sort()).toEqual([s.matches[0].id, s.matches[2].id].sort());
    expect(await listTournamentMatches(tablet, T, s.open.id)).toHaveLength(2);

    // Tentou sincronizar sem rede: nada se perde e o painel diz onde parou e por quê.
    await runSyncCycle(tablet, transport, { tenant_id: T });
    const offline = await getSyncSummary(tablet, T);
    expect(offline.pending).toEqual({ match: 3, athlete: 5, team: 3, tournament: 1, link: 3 });
    expect(offline.pendingEvents).toBe((4 + 5 + 6) * 2); // cada rali: toque + fim de rali
    expect(offline.pendingMatches).toHaveLength(3);
    expect(offline.stalled).toMatchObject({ transient: true, canSkip: false, reason: "Sem conexão com o servidor." });
    expect(offline.issues).toEqual([]);

    // --- A rede voltou: "Sincronizar agora" ---
    server.offline = false;
    expect(await retryPendingNow(tablet, T)).toBeGreaterThan(0); // o botão tira a fila do backoff
    await pushAll(tablet, transport);
    expect(await listPending(tablet, T)).toEqual([]);
    expect(await getSyncStatus(tablet, T)).toMatchObject({ pending: 0, conflicts: 0 });
    const done = await getSyncSummary(tablet, T);
    expect(done).toMatchObject({ pendingTotal: 0, stalled: null, issues: [] });

    // Na nuvem: lápides da dupla, da atleta e da partida; os lances da partida excluída continuam lá.
    const row = (entity: string, id: string) => server.rows.get(`${entity}:${id}`);
    expect(row("team", s.wrongTeam.id)?.deleted).toBe(true);
    expect(row("athlete", s.typo.id)?.deleted).toBe(true);
    expect(row("match", s.matches[1].id)).toMatchObject({ deleted: true, data: expect.objectContaining({ deleted_at: expect.any(Number) }) });
    const ledgerOfDeleted = [...server.rows.values()].filter((r) => r.entity === "rally_event" && r.data.match_id === s.matches[1].id);
    expect(ledgerOfDeleted.length).toBeGreaterThan(0);
    expect(ledgerOfDeleted.every((r) => !r.deleted)).toBe(true);

    // --- Segundo aparelho, vazio ---
    const pc = newDb();
    await runPull(pc, transport, { tenant_id: T });
    expect((await listMatches(pc, T)).map((m) => m.id).sort()).toEqual([s.matches[0].id, s.matches[2].id].sort());
    expect((await listDeletedMatches(pc, T)).map((m) => m.id)).toEqual([s.matches[1].id]);
    expect((await pc.athletes.get(s.ana.id))?.name).toBe("Ana Paula");
    expect(await pc.athletes.get(s.typo.id)).toBeUndefined();
    expect(await pc.teams.get(s.wrongTeam.id)).toBeUndefined();
    expect((await pc.tournaments.get(s.open.id))?.name).toBe("Open Nacional");
    expect((await pc.tournament_entries.get(entry.id))?.phase).toBe("final");
    expect(await listPending(pc, T)).toEqual([]); // o pull não gera outbox

    // Estatísticas iguais nos dois (a partida excluída fica fora das duas).
    const stats = async (db: ScoutDB) => {
      const season = await loadSeason(db, T);
      expect(season.matches).toHaveLength(2);
      return canonicalJson(aggregateCompetition(season.matches, { aliases: new Map() }));
    };
    expect(await stats(pc)).toBe(await stats(tablet));
  });

  it("restaurar da lixeira volta nos dois aparelhos; excluir torneio deixa as partidas como amistosos", async () => {
    const tablet = newDb();
    const pc = newDb();
    const server = new FakeSupabase();
    const transport = new SupabaseTransport(server);
    const s = await buildOfflineSeason(tablet);
    await deleteMatch(tablet, T, s.matches[0].id);
    await pushAll(tablet, transport);
    await runPull(pc, transport, { tenant_id: T });
    expect(await listMatches(pc, T)).toHaveLength(2);

    await restoreMatch(tablet, T, s.matches[0].id);
    const { unlinked } = await deleteTournament(tablet, T, s.open.id);
    expect(unlinked).toBe(3);
    await pushAll(tablet, transport);
    await runPull(pc, transport, { tenant_id: T });

    expect(await listMatches(pc, T)).toHaveLength(3);
    expect(await pc.tournaments.count()).toBe(0);
    expect(await pc.tournament_entries.count()).toBe(0);
    expect(await pc.rally_events.count()).toBe(await tablet.rally_events.count()); // nenhum lance apagado
  });
});

describe("integridade do CRUD", () => {
  it("não exclui atleta que jogou (nem na lixeira); exclui a que só tem dupla do cadastro, levando a dupla", async () => {
    const db = newDb();
    const s = await buildOfflineSeason(db);
    await expect(deleteAthlete(db, T, s.ana.id)).rejects.toThrow(/joga em 3 partidas.*Unir atletas/);
    await deleteMatch(db, T, s.matches[0].id);
    await expect(deleteAthlete(db, T, s.ana.id)).rejects.toThrow(/contando a lixeira/);

    expect(await deleteAthlete(db, T, s.typo.id)).toEqual({ teams: 1 });
    expect(await db.teams.get(s.wrongTeam.id)).toBeUndefined();
  });

  it("trocar a dupla só antes do scout", async () => {
    const db = newDb();
    const s = await buildOfflineSeason(db);
    const other = { name: "Outra", athlete_ids: s.wrongTeam.athlete_ids };
    await expect(updateMatchTeams(db, T, s.matches[0].id, { team_b: other })).rejects.toThrow(/já tem lances/);

    const fresh = await createMatchFromTeams(db, { tenant_id: T, team_a_id: s.ab.id, team_b_id: s.jl.id, first_server: "A" });
    const updated = await updateMatchTeams(db, T, fresh.id, { team_b: other });
    expect(updated.team_b.name).toBe("Outra");
    const last = (await db.outbox.toArray()).sort((a, b) => b.created_at - a.created_at)[0];
    expect(last).toMatchObject({ entity: "match", entity_id: fresh.id, op: "upsert" });
    await expect(updateMatchTeams(db, T, fresh.id, { team_a: other })).rejects.toThrow(/mesma atleta/);
  });
});

describe("dados de teste continuam locais", () => {
  it("editar ou excluir algo do /dev/seed não manda nada para a nuvem", async () => {
    const { seedDemoData } = await import("@/services/dev/seed-service");
    const db = newDb();
    await seedDemoData(db, T, { maxMatches: 1 });
    const [match] = await listMatches(db, T);
    const [team] = await db.teams.toArray();
    await deleteMatch(db, T, match.id);
    await restoreMatch(db, T, match.id);
    await deleteTeam(db, T, team.id);
    expect(await listPending(db, T)).toEqual([]);
    expect((await getSyncSummary(db, T)).pendingTotal).toBe(0);
  });
});
