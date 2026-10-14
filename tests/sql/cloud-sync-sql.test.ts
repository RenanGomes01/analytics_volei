import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Roda o script do Supabase (supabase/migrations/0001_cloud_sync.sql) num Postgres em memória,
 * com `auth.uid()` simulado como no Supabase (claim `sub` do JWT), e o papel `authenticated`
 * sujeito ao RLS.
 */

const MIGRATION = readFileSync(fileURLToPath(new URL("../../supabase/migrations/0001_cloud_sync.sql", import.meta.url)), "utf8");
const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";

interface Row {
  mutation_id: string;
  status: string;
  server_seq: number | null;
  reason: string | null;
}

let pg: PGlite;

async function as<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    await tx.exec("set local role authenticated");
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

const push = (uid: string, batch: unknown[]) =>
  as<Row>(uid, "select * from push_mutations($1::jsonb)", [JSON.stringify(batch)]).then((rows) =>
    rows.map((r) => ({ ...r, server_seq: r.server_seq === null ? null : Number(r.server_seq) })),
  );

const pull = (uid: string, since = 0) =>
  as<{ entity: string; entity_id: string; server_seq: number; deleted: boolean; data: Record<string, unknown> }>(
    uid,
    "select * from pull_changes($1, 1000)",
    [since],
  );

const mut = (mutation_id: string, entity: string, entity_id: string, payload: object, op = "insert") => ({
  mutation_id,
  entity,
  entity_id,
  op,
  payload: { tenant_id: "local", id: entity_id, ...payload },
});

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
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // rodar de novo no painel não pode quebrar
}, 60_000);

describe("push_mutations", () => {
  it("grava, devolve server_seq crescente e é idempotente por mutation_id", async () => {
    const first = await push(ANA, [
      mut("m1", "athlete", "a1", { name: "Renan" }),
      mut("m2", "match", "x1", { modality: "beach", team_a: { name: "A" }, team_b: { name: "B" } }),
    ]);
    expect(first.map((r) => r.status)).toEqual(["acked", "acked"]);
    expect(first[1].server_seq!).toBeGreaterThan(first[0].server_seq!);

    const again = await push(ANA, [mut("m1", "athlete", "a1", { name: "outro conteúdo, mesmo mutation_id" })]);
    expect(again).toEqual([{ mutation_id: "m1", status: "acked", server_seq: first[0].server_seq, reason: null }]);
  });

  it("insert da mesma entidade: igual → acked com o seq existente; diferente → conflict (e o lote segue)", async () => {
    const [orig] = await push(ANA, [mut("e1", "rally_event", "ev1", { match_id: "x1", kind: "touch", set_number: 1, local_seq: 1 })]);
    const res = await push(ANA, [
      mut("e1-import", "rally_event", "ev1", { local_seq: 1, set_number: 1, kind: "touch", match_id: "x1" }), // ordem das chaves não importa
      mut("e1-bad", "rally_event", "ev1", { match_id: "x1", kind: "void", set_number: 1, local_seq: 1 }),
      mut("e2", "rally_event", "ev2", { match_id: "x1", kind: "touch", set_number: 1, local_seq: 2 }),
    ]);
    expect(res[0]).toMatchObject({ status: "acked", server_seq: orig.server_seq });
    expect(res[1]).toMatchObject({ status: "conflict", server_seq: null });
    expect(res[1].reason).toMatch(/já existe com outro conteúdo/);
    expect(res[2]).toMatchObject({ status: "acked" });
  });

  it("upsert e delete geram seq novo; delete vira lápide; partida e lances só aceitam insert", async () => {
    const [ins] = await push(ANA, [mut("t1", "tournament_entry", "te1", { tournament_id: "T", match_id: "x1" })]);
    const [up] = await push(ANA, [mut("t2", "tournament_entry", "te1", { tournament_id: "T", match_id: "x1", phase: "final" }, "upsert")]);
    const [del] = await push(ANA, [mut("t3", "tournament_entry", "te1", { tournament_id: "T", match_id: "x1", phase: "final" }, "delete")]);
    expect(up.server_seq!).toBeGreaterThan(ins.server_seq!);
    expect(del.server_seq!).toBeGreaterThan(up.server_seq!);
    const rows = await as<{ phase: string; deleted_at: string | null }>(ANA, "select phase, deleted_at from tournament_entries where id = 'te1'");
    expect(rows[0].phase).toBe("final");
    expect(rows[0].deleted_at).not.toBeNull();

    const bad = await push(ANA, [mut("bad-op", "rally_event", "ev1", { kind: "touch" }, "upsert"), mut("bad-entity", "planet", "p1", {})]);
    expect(bad.map((r) => r.status)).toEqual(["conflict", "conflict"]);
  });

  it("não guarda o tenant_id local no espelho", async () => {
    const rows = await as<{ data: Record<string, unknown> }>(ANA, "select data from athletes where id = 'a1'");
    expect(rows[0].data).toEqual({ id: "a1", name: "Renan" });
  });

  it("sem login, recusa", async () => {
    await expect(as(null, "select * from push_mutations('[]'::jsonb)")).rejects.toThrow(/Não autenticado/);
  });
});

describe("ledger imutável e RLS", () => {
  it("rally_events recusa UPDATE e DELETE (nem o dono altera o ledger)", async () => {
    await expect(pg.exec("update rally_events set data = '{}'::jsonb where id = 'ev1'")).rejects.toThrow(/append-only/);
    await expect(pg.exec("delete from rally_events where id = 'ev1'")).rejects.toThrow(/append-only/);
  });

  it("cada conta só vê o que é seu; mesmo id em contas diferentes não colide", async () => {
    const res = await push(BIA, [mut("b1", "athlete", "a1", { name: "Outra pessoa" })]);
    expect(res[0].status).toBe("acked");
    expect((await pull(BIA)).map((c) => c.entity_id)).toEqual(["a1"]);
    expect((await pull(ANA)).some((c) => c.data.name === "Outra pessoa")).toBe(false);
    // Nem com SQL direto: o RLS filtra e recusa gravar em nome de outra conta.
    expect(await as(BIA, "select id from rally_events")).toEqual([]);
    await expect(
      as(BIA, "insert into athletes (owner_id, id, server_seq, data) values ($1, 'zz', 1, '{}')", [ANA]),
    ).rejects.toThrow(/row-level security/);
    await expect(as(BIA, "select * from push_mutations('[]'::jsonb)")).resolves.toEqual([]);
  });

  it("anon não tem acesso às tabelas nem às funções", async () => {
    await expect(
      pg.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from athletes");
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("pull_changes", () => {
  it("devolve em ordem de server_seq a partir do cursor, com lápides marcadas", async () => {
    const all = await pull(ANA);
    const seqs = all.map((c) => Number(c.server_seq));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(all.find((c) => c.entity_id === "te1")).toMatchObject({ entity: "tournament_entry", deleted: true });
    const tail = await pull(ANA, seqs[1]);
    expect(tail.length).toBe(all.length - 2);
  });
});
