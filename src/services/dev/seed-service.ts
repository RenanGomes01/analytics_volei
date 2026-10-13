import type { ScoutDB } from "@/db/schema";
import { createRng, generateRally, type PlayerProfile } from "@/domain/dev/rally-generator";
import type { TournamentCategory } from "@/domain/roster/types";
import type { Gender, TeamSide } from "@/domain/types";
import { appendRallies } from "@/services/rally-ledger-service";
import { createAthlete, findOrCreateTeam } from "@/services/roster-service";
import { createMatchFromTeams, createTournament } from "@/services/tournament-service";

/**
 * Ferramenta de homologação: popula o aparelho com ~1 ano de jogos sintéticos (modo detalhado),
 * gravados pelos services reais. Os ids criados ficam em `meta["dev_seed"]` para poderem ser removidos.
 */

export const DEV_SEED_KEY = "dev_seed";
export const DEFAULT_SEED = 20260313;

export interface DevSeedRecord {
  created_at: number;
  athlete_ids: string[];
  team_ids: string[];
  tournament_ids: string[];
  match_ids: string[];
  /** Atalhos para a tela de resultado. */
  showcase: { athlete_id: string; pair_key: string };
}

interface SeedAthlete {
  name: string;
  gender: Gender;
  jersey: number;
  profile: PlayerProfile;
}

const prof = (serve: number, pass: number, attack: number, block: number, dig: number): PlayerProfile => ({ serve, pass, attack, block, dig });

// Perfis com "especialistas" claros, para os rankings terem líderes.
const ATHLETES: SeedAthlete[] = [
  { name: "Renan", gender: "M", jersey: 1, profile: prof(0.6, 0.7, 0.85, 0.45, 0.65) }, // atacante
  { name: "Pedro", gender: "M", jersey: 2, profile: prof(0.4, 0.45, 0.6, 0.95, 0.35) }, // paredão
  { name: "George", gender: "M", jersey: 1, profile: prof(0.95, 0.55, 0.65, 0.5, 0.55) }, // sacador
  { name: "André", gender: "M", jersey: 2, profile: prof(0.45, 0.85, 0.55, 0.35, 0.9) }, // defensor
  { name: "Bruno", gender: "M", jersey: 1, profile: prof(0.55, 0.5, 0.7, 0.75, 0.45) },
  { name: "Thiago", gender: "M", jersey: 2, profile: prof(0.5, 0.6, 0.5, 0.4, 0.6) },
  { name: "Ana", gender: "F", jersey: 1, profile: prof(0.55, 0.6, 0.85, 0.5, 0.6) }, // atacante
  { name: "Bia", gender: "F", jersey: 2, profile: prof(0.4, 0.45, 0.6, 0.9, 0.4) }, // paredão
  { name: "Carol", gender: "F", jersey: 1, profile: prof(0.5, 0.95, 0.55, 0.35, 0.75) }, // passadora
  { name: "Duda", gender: "F", jersey: 2, profile: prof(0.9, 0.55, 0.6, 0.5, 0.5) }, // sacadora
  { name: "Júlia", gender: "F", jersey: 1, profile: prof(0.45, 0.7, 0.55, 0.4, 0.95) }, // defensora
  { name: "Larissa", gender: "F", jersey: 2, profile: prof(0.5, 0.6, 0.65, 0.6, 0.5) },
];

type PairNames = [string, string];
type Lineup = [PairNames, PairNames, PairNames];

// A volatilidade do vôlei de praia: as duplas da Etapa 1 se desfazem na Etapa 2.
const LINEUP_1: Record<Gender, Lineup> = {
  M: [["Renan", "Pedro"], ["George", "André"], ["Bruno", "Thiago"]],
  F: [["Ana", "Bia"], ["Carol", "Duda"], ["Júlia", "Larissa"]],
};
const LINEUP_2: Record<Gender, Lineup> = {
  M: [["Renan", "George"], ["Pedro", "Bruno"], ["André", "Thiago"]],
  F: [["Ana", "Carol"], ["Bia", "Júlia"], ["Duda", "Larissa"]],
};

interface SeedTournament {
  name: string;
  start_date: string;
  category: TournamentCategory;
  location: string;
  genders: Gender[];
  lineup: Record<Gender, Lineup>;
}

const TOURNAMENTS: SeedTournament[] = [
  { name: "Circuito MT – Etapa 1 Masc.", start_date: "2026-03-14", category: "M", location: "Cuiabá", genders: ["M"], lineup: LINEUP_1 },
  { name: "Circuito MT – Etapa 1 Fem.", start_date: "2026-03-14", category: "F", location: "Cuiabá", genders: ["F"], lineup: LINEUP_1 },
  { name: "Circuito MT – Etapa 2 Masc.", start_date: "2026-06-13", category: "M", location: "Chapada", genders: ["M"], lineup: LINEUP_2 },
  { name: "Circuito MT – Etapa 2 Fem.", start_date: "2026-06-13", category: "F", location: "Chapada", genders: ["F"], lineup: LINEUP_2 },
  { name: "Open Nacional", start_date: "2026-09-12", category: "Open", location: "Rio de Janeiro", genders: ["M", "F"], lineup: LINEUP_2 },
];

// Amistosos sem torneio, espalhados pelo ano (o de 2025 deixa dois anos no filtro).
const FRIENDLIES: { date: string; gender: Gender; lineup: Record<Gender, Lineup>; pairs: [number, number] }[] = [
  { date: "2025-11-15", gender: "M", lineup: LINEUP_1, pairs: [0, 1] },
  { date: "2025-12-13", gender: "F", lineup: LINEUP_1, pairs: [0, 2] },
  { date: "2026-02-07", gender: "M", lineup: LINEUP_1, pairs: [1, 2] },
  { date: "2026-04-18", gender: "F", lineup: LINEUP_1, pairs: [1, 2] },
  { date: "2026-07-25", gender: "M", lineup: LINEUP_2, pairs: [0, 2] },
  { date: "2026-08-22", gender: "F", lineup: LINEUP_2, pairs: [0, 1] },
];

const MATCHES_PER_GROUP = 4; // todos contra todos (3) + final
export const DEV_SEED_TOTAL_MATCHES =
  TOURNAMENTS.reduce((s, t) => s + t.genders.length * MATCHES_PER_GROUP, 0) + FRIENDLIES.length;

export async function getDevSeed(db: ScoutDB): Promise<DevSeedRecord | undefined> {
  return (await db.meta.get(DEV_SEED_KEY))?.value as DevSeedRecord | undefined;
}

export interface SeedOptions {
  seed?: number;
  onProgress?: (done: number, total: number) => void;
  /** Só para testes: para depois de N partidas (o mock de IndexedDB é lento para apagar milhares de eventos). */
  maxMatches?: number;
}

export async function seedDemoData(db: ScoutDB, tenant_id: string, { seed = DEFAULT_SEED, onProgress, maxMatches = Infinity }: SeedOptions = {}): Promise<DevSeedRecord> {
  if (await getDevSeed(db)) throw new Error("Os dados de teste já foram injetados neste aparelho.");
  const rng = createRng(seed);
  const record: DevSeedRecord = { created_at: Date.now(), athlete_ids: [], team_ids: [], tournament_ids: [], match_ids: [], showcase: { athlete_id: "", pair_key: "" } };
  // Registra antes de criar: mesmo uma injeção interrompida pode ser removida depois.
  const save = () => db.meta.put({ key: DEV_SEED_KEY, value: record });
  await save();

  const byName = new Map<string, { id: string; profile: PlayerProfile }>();
  for (const a of ATHLETES) {
    const athlete = await createAthlete(db, { tenant_id, name: a.name, jersey_number: a.jersey, gender: a.gender });
    byName.set(a.name, { id: athlete.id, profile: a.profile });
    record.athlete_ids.push(athlete.id);
  }
  const profiles = Object.fromEntries([...byName.values()].map((a) => [a.id, a.profile]));
  const idOf = (name: string) => byName.get(name)!.id;

  const teamCache = new Map<string, { id: string; pair_key: string }>();
  async function team(pair: PairNames) {
    const key = pair.join("|");
    if (!teamCache.has(key)) {
      const t = await findOrCreateTeam(db, tenant_id, { athlete_ids: pair.map(idOf), modality: "beach" });
      teamCache.set(key, { id: t.id, pair_key: t.pair_key });
      if (!record.team_ids.includes(t.id)) record.team_ids.push(t.id);
    }
    return teamCache.get(key)!;
  }

  let done = 0;
  /** Cria a partida e joga rali a rali até haver vencedor. Devolve o lado vencedor. */
  async function play(a: PairNames, b: PairNames, when: number, tournament_id?: string): Promise<TeamSide> {
    if (record.match_ids.length >= maxMatches) return "A";
    const [ta, tb] = [await team(a), await team(b)];
    const first_server: TeamSide = rng() < 0.5 ? "A" : "B";
    const match = await createMatchFromTeams(db, { tenant_id, team_a_id: ta.id, team_b_id: tb.id, first_server, tournament_id }, when);
    record.match_ids.push(match.id);
    await save();

    const athletes: Record<TeamSide, [string, string]> = { A: [idOf(a[0]), idOf(a[1])], B: [idOf(b[0]), idOf(b[1])] };
    // No beach as duas atletas se alternam no saque a cada vez que a equipe recupera o saque.
    const nextServer: Record<TeamSide, number> = { A: 0, B: 0 };
    let previousServing: TeamSide | null = null;
    let rallies = 0;
    const final = await appendRallies(db, { tenant_id, match_id: match.id }, (state) => {
      if (rallies++ >= 400) return null;
      const serving = state.serving_team;
      if (previousServing !== null && serving !== previousServing) nextServer[serving] ^= 1;
      previousServing = serving;
      return generateRally({ serving_team: serving, server_id: athletes[serving][nextServer[serving]], athletes, profiles }, rng);
    });
    if (!final.winner) throw new Error("Partida sintética não terminou.");
    done += 1;
    onProgress?.(done, DEV_SEED_TOTAL_MATCHES);
    return final.winner;
  }

  const day = (iso: string, offsetHours = 0) => new Date(`${iso}T09:00:00`).getTime() + offsetHours * 3_600_000;

  for (const t of TOURNAMENTS) {
    const tournament = await createTournament(db, tenant_id, { name: t.name, location: t.location, start_date: t.start_date, modality: "beach", category: t.category });
    record.tournament_ids.push(tournament.id);
    await save();
    for (const gender of t.genders) {
      const pairs = t.lineup[gender];
      const wins = [0, 0, 0];
      const games: [number, number][] = [[0, 1], [0, 2], [1, 2]];
      for (const [g, [x, y]] of games.entries()) {
        const winner = await play(pairs[x], pairs[y], day(t.start_date, g), tournament.id);
        wins[winner === "A" ? x : y] += 1;
      }
      const [f1, f2] = [0, 1, 2].sort((i, j) => wins[j] - wins[i] || i - j);
      await play(pairs[f1], pairs[f2], day(t.start_date, 30), tournament.id); // final no dia seguinte
    }
  }
  for (const f of FRIENDLIES) {
    const pairs = f.lineup[f.gender];
    await play(pairs[f.pairs[0]], pairs[f.pairs[1]], day(f.date));
  }

  record.showcase = { athlete_id: idOf("Renan"), pair_key: (await team(LINEUP_2.M[0])).pair_key };
  await save();
  return record;
}

/**
 * Remove SÓ o que `seedDemoData` criou (ids registrados em `meta["dev_seed"]`), inclusive o outbox.
 * Exceção deliberada ao append-only: são dados sintéticos de homologação, nunca jogos reais.
 */
export async function removeDemoData(db: ScoutDB, tenant_id: string): Promise<boolean> {
  const record = await getDevSeed(db);
  if (!record) return false;
  await db.transaction(
    "rw",
    [db.rally_events, db.matches, db.tournament_entries, db.tournaments, db.teams, db.athletes, db.outbox, db.meta],
    async () => {
      const eventIds: string[] = [];
      for (const match_id of record.match_ids) {
        const events = await db.rally_events.where("[match_id+local_seq]").between([match_id, -Infinity], [match_id, Infinity]).toArray();
        eventIds.push(...events.filter((e) => e.tenant_id === tenant_id).map((e) => e.id));
      }
      const entries = await db.tournament_entries.where("match_id").anyOf(record.match_ids).toArray();
      const entryIds = entries.filter((e) => e.tenant_id === tenant_id).map((e) => e.id);
      const all = [...eventIds, ...entryIds, ...record.match_ids, ...record.tournament_ids, ...record.team_ids, ...record.athlete_ids];
      await db.rally_events.bulkDelete(eventIds);
      await db.tournament_entries.bulkDelete(entryIds);
      await db.matches.bulkDelete(record.match_ids);
      await db.tournaments.bulkDelete(record.tournament_ids);
      await db.teams.bulkDelete(record.team_ids);
      await db.athletes.bulkDelete(record.athlete_ids);
      const created = new Set(all);
      const outbox = await db.outbox.where("tenant_id").equals(tenant_id).filter((e) => created.has(e.entity_id)).primaryKeys();
      await db.outbox.bulkDelete(outbox);
      await db.meta.delete(DEV_SEED_KEY);
    },
  );
  return true;
}
