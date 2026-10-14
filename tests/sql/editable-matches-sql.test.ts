import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/** supabase/migrations/0002_editable_matches.sql sobre o 0001, num Postgres em memória (como em cloud-sync-sql). */

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), "utf8");
const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";

let pg: PGlite;

async function as<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await tx.exec("set local role authenticated");
    return (await tx.query<T>(sql, params)).rows;
  });
}

type Row = { mutation_id: string; status: string; server_seq: number | null; reason: string | null };
const push = (uid: string, batch: unknown[]) => as<Row>(uid, "select * from push_mutations($1::jsonb)", [JSON.stringify(batch)]);
const mut = (mutation_id: string, entity: string, entity_id: string, payload: object, op = "insert") => ({
  mutation_id,
  entity,
  entity_id,
  op,
  payload: { tenant_id: "local", id: entity_id, ...payload },
});
const match = { team_a: { name: "A" }, team_b: { name: "B" }, modality: "beach" };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await pg.exec(read("0001_cloud_sync.sql"));
  await pg.exec(read("0002_editable_matches.sql"));
  await pg.exec(read("0002_editable_matches.sql")); // idempotente
}, 60_000);

describe("0002: partidas editáveis", () => {
  it("partida aceita upsert e delete (lápide com seq novo; a linha fica)", async () => {
    const [ins] = await push(ANA, [mut("m1", "match", "x1", match)]);
    const [up] = await push(ANA, [mut("m2", "match", "x1", { ...match, team_b: { name: "C" } }, "upsert")]);
    const [del] = await push(ANA, [mut("m3", "match", "x1", { ...match, team_b: { name: "C" }, deleted_at: 1 }, "delete")]);
    expect([ins.status, up.status, del.status]).toEqual(["acked", "acked", "acked"]);
    expect(Number(del.server_seq)).toBeGreaterThan(Number(up.server_seq));

    const [row] = await as<{ deleted_at: string | null; data: { team_b: { name: string } } }>(ANA, "select deleted_at, data from matches where id = 'x1'");
    expect(row.deleted_at).not.toBeNull();
    expect(row.data.team_b.name).toBe("C");
    const pulled = await as<{ entity_id: string; deleted: boolean }>(ANA, "select * from pull_changes(0, 100)");
    expect(pulled.find((c) => c.entity_id === "x1")).toMatchObject({ deleted: true });

    // Restaurar = upsert sem deleted_at.
    await push(ANA, [mut("m4", "match", "x1", match, "upsert")]);
    const [restored] = await as<{ deleted_at: string | null }>(ANA, "select deleted_at from matches where id = 'x1'");
    expect(restored.deleted_at).toBeNull();
  });

  it("lances continuam só com insert e imutáveis", async () => {
    await push(ANA, [mut("e1", "rally_event", "ev1", { match_id: "x1", kind: "touch", set_number: 1, local_seq: 1 })]);
    const [bad] = await push(ANA, [mut("e2", "rally_event", "ev1", { match_id: "x1", kind: "void", set_number: 1, local_seq: 1 }, "upsert")]);
    expect(bad).toMatchObject({ status: "conflict" });
    expect(bad.reason).toMatch(/só aceita insert/);
    await expect(pg.exec("update rally_events set data = '{}'::jsonb")).rejects.toThrow(/append-only/);
  });

  it("outra conta não altera a partida de ninguém", async () => {
    await push(BIA, [mut("b1", "match", "x1", { ...match, team_a: { name: "Bia" } }, "upsert")]);
    const [mine] = await as<{ data: { team_a: { name: string } } }>(ANA, "select data from matches where id = 'x1'");
    expect(mine.data.team_a.name).toBe("A");
    expect(await as(BIA, "select id from matches where owner_id = $1", [ANA])).toEqual([]);
  });
});
