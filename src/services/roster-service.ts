import { newId } from "@/lib/id";
import { normalizeName, pairKey, resolveAthlete } from "@/domain/roster/identity";
import type { AthleteAlias, Team } from "@/domain/roster/types";
import type { Athlete, Gender, Modality } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { createAthlete } from "./athlete-service";
import { enqueue } from "./outbox-service";

/**
 * Cadastro central de atletas e duplas (Fase 5). Atletas e duplas são CADASTRO (editáveis, op
 * "upsert" no outbox); o ledger continua com os ids originais. Atletas duplicados do MVP são unidos
 * por aliases — nunca reescrevendo partidas ou lances.
 */

export { createAthlete };

export async function updateAthlete(
  db: ScoutDB,
  tenant_id: string,
  id: string,
  changes: { name?: string; jersey_number?: number | null; gender?: Gender | null },
): Promise<Athlete> {
  return db.transaction("rw", db.athletes, db.outbox, async () => {
    const current = await db.athletes.get(id);
    if (!current || current.tenant_id !== tenant_id) throw new Error("Atleta não encontrada.");
    const name = changes.name?.trim();
    if (changes.name !== undefined && !name) throw new Error("O nome não pode ficar vazio.");
    const updated: Athlete = { ...current, ...(name ? { name } : {}) };
    if (changes.jersey_number === null) delete updated.jersey_number;
    else if (changes.jersey_number !== undefined) updated.jersey_number = changes.jersey_number;
    if (changes.gender === null) delete updated.gender;
    else if (changes.gender !== undefined) updated.gender = changes.gender;
    await db.athletes.put(updated);
    await enqueue(db, "athlete", updated, "upsert");
    return updated;
  });
}

export async function listAthletes(db: ScoutDB, tenant_id: string): Promise<Athlete[]> {
  const all = await db.athletes.where("tenant_id").equals(tenant_id).toArray();
  return all.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name), "pt-BR"));
}

export async function getAliasMap(db: ScoutDB, tenant_id: string): Promise<Map<string, string>> {
  const rows = await db.athlete_aliases.where("tenant_id").equals(tenant_id).toArray();
  return new Map(rows.map((r) => [r.alias_id, r.canonical_id]));
}

/**
 * Une cadastros duplicados: `alias_ids` passam a ser o mesmo atleta que `canonical_id`.
 * Recusa se dois deles jogaram a mesma partida (somaria os números de duas pessoas) e mantém o
 * mapa sem cadeias (quem apontava para um alias passa a apontar para o canônico).
 */
export async function mergeAthletes(
  db: ScoutDB,
  tenant_id: string,
  { canonical_id, alias_ids }: { canonical_id: string; alias_ids: string[] },
  now = Date.now(),
): Promise<void> {
  await db.transaction("rw", [db.athletes, db.matches, db.athlete_aliases, db.outbox], async () => {
    const aliases = await getAliasMap(db, tenant_id);
    const target = resolveAthlete(aliases, canonical_id);
    const sources = [...new Set(alias_ids.map((id) => resolveAthlete(aliases, id)))].filter((id) => id !== target);
    if (sources.length === 0) throw new Error("Escolha ao menos uma atleta diferente da principal.");
    const found = await db.athletes.bulkGet([target, ...sources]);
    if (found.some((a) => !a || a.tenant_id !== tenant_id)) throw new Error("Atleta não encontrada.");

    // Mapa depois da união: fontes e quem já apontava para elas vão para o alvo.
    const merged = new Map(aliases);
    for (const [alias, canonical] of aliases) if (sources.includes(canonical)) merged.set(alias, target);
    for (const id of sources) merged.set(id, target);

    const matches = await db.matches.where("tenant_id").equals(tenant_id).toArray();
    for (const m of matches) {
      const ids = [...m.team_a.athlete_ids, ...m.team_b.athlete_ids].map((id) => resolveAthlete(merged, id));
      if (new Set(ids).size !== ids.length) {
        const names = found.filter(Boolean).map((a) => a!.name).join(", ");
        throw new Error(`Não é possível unir (${names}): duas delas jogaram a mesma partida (${m.team_a.name} × ${m.team_b.name}).`);
      }
    }

    for (const [alias_id, canonical] of merged) {
      if (aliases.get(alias_id) === canonical) continue;
      const row: AthleteAlias = { alias_id, canonical_id: canonical, tenant_id, created_at: now };
      await db.athlete_aliases.put(row);
      await enqueue(db, "athlete_alias", { ...row, id: alias_id }, "upsert");
    }
  });
}

/** Desfaz a união de um atleta (volta a ser independente). */
export async function unmergeAthlete(db: ScoutDB, tenant_id: string, alias_id: string): Promise<void> {
  await db.transaction("rw", db.athlete_aliases, db.outbox, async () => {
    const row = await db.athlete_aliases.get(alias_id);
    if (!row || row.tenant_id !== tenant_id) throw new Error("Esta atleta não está unida a outra.");
    await db.athlete_aliases.delete(alias_id);
    await enqueue(db, "athlete_alias", { ...row, id: alias_id }, "delete");
  });
}

const TEAM_SIZE: Record<Modality, { min: number; max: number }> = { beach: { min: 2, max: 2 }, indoor: { min: 6, max: 14 } };

/** Devolve a dupla desse par de atletas; cria se ainda não existir (uma dupla por par). */
export async function findOrCreateTeam(
  db: ScoutDB,
  tenant_id: string,
  { athlete_ids, modality, name }: { athlete_ids: string[]; modality: Modality; name?: string },
  now = Date.now(),
): Promise<Team> {
  return db.transaction("rw", [db.teams, db.athletes, db.athlete_aliases, db.outbox], async () => {
    const aliases = await getAliasMap(db, tenant_id);
    const ids = [...new Set(athlete_ids.map((id) => resolveAthlete(aliases, id)))];
    const { min, max } = TEAM_SIZE[modality];
    if (ids.length < min || ids.length > max) {
      throw new Error(modality === "beach" ? "Uma dupla tem 2 atletas diferentes." : `Um time tem de ${min} a ${max} atletas.`);
    }
    const key = pairKey(ids);
    const existing = await db.teams.where("[tenant_id+pair_key]").equals([tenant_id, key]).first();
    if (existing) return existing;

    const athletes = await db.athletes.bulkGet(ids);
    if (athletes.some((a) => !a || a.tenant_id !== tenant_id)) throw new Error("Atleta não encontrada.");
    const team: Team = {
      id: newId(),
      tenant_id,
      name: name?.trim() || athletes.map((a) => a!.name).join(" / "),
      athlete_ids: ids,
      pair_key: key,
      modality,
      created_at: now,
    };
    await db.teams.add(team);
    await enqueue(db, "team", team);
    return team;
  });
}

export async function renameTeam(db: ScoutDB, tenant_id: string, id: string, name: string): Promise<Team> {
  return db.transaction("rw", db.teams, db.outbox, async () => {
    const team = await db.teams.get(id);
    if (!team || team.tenant_id !== tenant_id) throw new Error("Dupla não encontrada.");
    if (!name.trim()) throw new Error("O nome não pode ficar vazio.");
    const updated = { ...team, name: name.trim() };
    await db.teams.put(updated);
    await enqueue(db, "team", updated, "upsert");
    return updated;
  });
}

export async function listTeams(db: ScoutDB, tenant_id: string, modality?: Modality): Promise<Team[]> {
  const teams = await db.teams.where("tenant_id").equals(tenant_id).toArray();
  return teams
    .filter((t) => !modality || t.modality === modality)
    .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name), "pt-BR"));
}

/**
 * Exclui uma dupla do cadastro. A dupla é só um atalho: as partidas guardam o retrato (nome +
 * atletas), então nada se perde. Lápide no outbox.
 */
export async function deleteTeam(db: ScoutDB, tenant_id: string, id: string): Promise<void> {
  await db.transaction("rw", db.teams, db.outbox, async () => {
    const team = await db.teams.get(id);
    if (!team || team.tenant_id !== tenant_id) throw new Error("Dupla não encontrada.");
    await db.teams.delete(id);
    await enqueue(db, "team", team, "delete");
  });
}

/** Onde a atleta é usada: partidas (inclusive na lixeira), uniões e duplas do cadastro. */
export async function athleteUsage(db: ScoutDB, tenant_id: string, id: string) {
  const [matches, aliases, teams] = await Promise.all([
    db.matches.where("tenant_id").equals(tenant_id).toArray(),
    db.athlete_aliases.where("tenant_id").equals(tenant_id).toArray(),
    db.teams.where("tenant_id").equals(tenant_id).toArray(),
  ]);
  return {
    matches: matches.filter((m) => m.team_a.athlete_ids.includes(id) || m.team_b.athlete_ids.includes(id)).length,
    merged: aliases.some((a) => a.alias_id === id || a.canonical_id === id),
    teams: teams.filter((t) => t.athlete_ids.includes(id)),
  };
}

/**
 * Exclui uma atleta cadastrada por engano. Recusa se ela jogou alguma partida (os lances guardam o
 * id dela — para duplicados, use "Unir atletas") ou se está numa união. As duplas do cadastro que a
 * incluem (sem partidas, portanto) vão junto. Lápides no outbox, numa transação.
 */
export async function deleteAthlete(db: ScoutDB, tenant_id: string, id: string): Promise<{ teams: number }> {
  return db.transaction("rw", [db.athletes, db.matches, db.athlete_aliases, db.teams, db.outbox], async () => {
    const athlete = await db.athletes.get(id);
    if (!athlete || athlete.tenant_id !== tenant_id) throw new Error("Atleta não encontrada.");
    const usage = await athleteUsage(db, tenant_id, id);
    if (usage.matches > 0) {
      throw new Error(
        `${athlete.name} joga em ${usage.matches} ${usage.matches === 1 ? "partida" : "partidas"} (contando a lixeira). Para corrigir um cadastro duplicado, use "Unir atletas".`,
      );
    }
    if (usage.merged) throw new Error(`${athlete.name} está unida a outro cadastro: desfaça a união antes de excluir.`);
    for (const team of usage.teams) {
      await db.teams.delete(team.id);
      await enqueue(db, "team", team, "delete");
    }
    await db.athletes.delete(id);
    await enqueue(db, "athlete", athlete, "delete");
    return { teams: usage.teams.length };
  });
}
