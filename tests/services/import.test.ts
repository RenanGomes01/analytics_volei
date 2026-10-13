import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@/domain/export/canonical-json";
import { validateExportData } from "@/domain/export/validate-export-data";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES } from "@/domain/rules/modality";
import { computeBoxScore } from "@/domain/stats/box-score";
import { ScoutDB } from "@/db/schema";
import { toBase64, sha256Hex, utf8 } from "@/services/export/crypto-encoding";
import { exportMatch } from "@/services/export/export-service";
import { importMatchExport, inspectMatchExport } from "@/services/export/import-service";
import { verifyMatchExport } from "@/services/export/verify-export";
import { createMatchWithRoster } from "@/services/match-service";
import { appendTouch, listMatchEvents, type MatchScope } from "@/services/rally-ledger-service";
import { MockTransport } from "@/services/sync/mock-transport";

let source: ScoutDB; // tablet que exporta (tenant "origem")
let target: ScoutDB; // tablet que importa (tenant "local")
let scope: MatchScope;
let a1: string;
let b1: string;

const serve = (db: ScoutDB, s: MatchScope, quality: "#" | "+" = "+") =>
  appendTouch(db, s, { team: "A", athlete_id: a1, skill: "serve", quality });

beforeEach(async () => {
  source = new ScoutDB(`origem-${crypto.randomUUID()}`);
  target = new ScoutDB(`destino-${crypto.randomUUID()}`);
  const match = await createMatchWithRoster(source, {
    tenant_id: "origem",
    modality: "beach",
    first_server: "A",
    team_a: { name: "Areia A", athletes: [{ name: "Ana", jersey_number: 1 }, { name: "Bia", jersey_number: 2 }] },
    team_b: { name: "Areia B", athletes: [{ name: "Carla", jersey_number: 3 }, { name: "Duda", jersey_number: 4 }] },
  });
  scope = { tenant_id: "origem", match_id: match.id };
  [a1] = match.team_a.athlete_ids;
  [b1] = match.team_b.athlete_ids;
  await serve(source, scope, "#"); // ace
  await serve(source, scope);
  await appendTouch(source, scope, { team: "B", athlete_id: b1, skill: "reception", quality: "#" });
});

afterEach(async () => {
  await source.delete();
  await target.delete();
});

const exported = async () => (await exportMatch(source, scope)).json;
const local = { tenant_id: "local", match_id: "" };

describe("importação de partida", () => {
  it("partida nova: grava tudo com o tenant local, preenche o outbox e reproduz placar e Box Score", async () => {
    const json = await exported();
    const preview = await inspectMatchExport(target, json, "local");
    expect(preview).toMatchObject({ ok: true, situation: "new", origin: "new", pending: { match: true, athletes: 4, events: 3 } });
    expect(preview.fingerprint).toMatch(/^[0-9A-F]{4}·[0-9A-F]{4}$/);
    expect(await target.matches.count()).toBe(0); // inspecionar não grava

    const result = await importMatchExport(target, json, "local");
    expect(result).toMatchObject({ imported: true, match_id: scope.match_id });

    const s = { ...local, match_id: scope.match_id };
    const [srcEvents, dstEvents] = [await listMatchEvents(source, scope), await listMatchEvents(target, s)];
    expect(dstEvents.map((e) => ({ ...e, tenant_id: "origem" }))).toEqual(srcEvents);
    // O estado do replay carrega os eventos completos: compara com o tenant normalizado.
    const asSource = dstEvents.map((e) => ({ ...e, tenant_id: "origem" }));
    const opts = { rules: BEACH_RULES, first_server: "A" as const };
    expect(replayMatch(asSource, opts)).toEqual(replayMatch(srcEvents, opts));
    expect(replayMatch(dstEvents, opts).sets).toEqual([{ set_number: 1, first_server: "A", score: { A: 1, B: 0 }, winner: null }]);
    const roster = { A: [a1], B: [b1] };
    expect(computeBoxScore(asSource, { ...opts, roster })).toEqual(computeBoxScore(srcEvents, { ...opts, roster }));

    const outbox = await target.outbox.toArray();
    expect(outbox).toHaveLength(8); // 4 atletas + partida + 3 eventos
    expect(outbox.every((e) => e.tenant_id === "local" && e.status === "pending")).toBe(true);
    expect((await target.matches.get(scope.match_id))?.tenant_id).toBe("local");
  });

  it("reimportar o mesmo arquivo é inofensivo e o aparelho de origem passa a ser 'já visto'", async () => {
    const json = await exported();
    await importMatchExport(target, json, "local");
    const outboxBefore = await target.outbox.count();

    const again = await importMatchExport(target, json, "local");
    expect(again.imported).toBe(false);
    expect(again.preview).toMatchObject({ situation: "up_to_date", origin: "known" });
    expect(await target.outbox.count()).toBe(outboxBefore);
  });

  it("backup mais novo do mesmo jogo importa só os eventos que faltam", async () => {
    await importMatchExport(target, await exported(), "local");
    await serve(source, scope);
    await serve(source, scope);

    const result = await importMatchExport(target, await exported(), "local");
    expect(result).toMatchObject({ imported: true, preview: { situation: "append", pending: { match: false, athletes: 0, events: 2 } } });
    expect(await target.rally_events.count()).toBe(5);
  });

  it("recusa mesclar quando este aparelho lançou eventos que o arquivo não tem", async () => {
    const json = await exported();
    await importMatchExport(target, json, "local");
    await serve(target, { ...local, match_id: scope.match_id }); // lance feito no tablet de destino
    const before = await target.rally_events.count();

    const result = await importMatchExport(target, json, "local");
    expect(result.imported).toBe(false);
    expect(result.preview).toMatchObject({ situation: "diverged", reason: expect.stringMatching(/alterada neste aparelho/) });
    expect(await target.rally_events.count()).toBe(before);
  });

  it("recusa conflito: mesmo id com conteúdo diferente", async () => {
    const json = await exported();
    await importMatchExport(target, json, "local");
    const athlete = (await target.athletes.get(a1))!;
    await target.athletes.put({ ...athlete, name: "Outra Ana" });

    const preview = await inspectMatchExport(target, json, "local");
    expect(preview).toMatchObject({ situation: "conflict", reason: expect.stringMatching(/Ana está diferente/) });
  });

  it("recusa arquivo adulterado sem gravar nada", async () => {
    const envelope = JSON.parse(await exported());
    envelope.data.events[0].quality = "=";
    const result = await importMatchExport(target, JSON.stringify(envelope), "local");
    expect(result.imported).toBe(false);
    expect(result.preview.errors.join(" ")).toMatch(/Hash não confere/);
    expect(await target.matches.count()).toBe(0);
  });

  it("falha no meio da gravação desfaz tudo", async () => {
    vi.spyOn(target.rally_events, "add").mockRejectedValueOnce(new Error("disco cheio"));
    await expect(importMatchExport(target, await exported(), "local")).rejects.toThrow("disco cheio");
    expect([await target.matches.count(), await target.athletes.count(), await target.outbox.count()]).toEqual([0, 0, 0]);
  });

  it("arquivo exportado pelo próprio aparelho é reconhecido", async () => {
    const preview = await inspectMatchExport(source, await exported(), "origem");
    expect(preview).toMatchObject({ origin: "this_device", situation: "up_to_date" });
  });
});

describe("validação da estrutura (além de hash e assinatura)", () => {
  /** Reassina um envelope alterado com OUTRA chave: hash e assinatura ficam válidos. */
  async function resignWithForeignKey(envelope: { data: unknown; integrity: { content_hash: string; signature: { public_key: JsonWebKey; value: string } } }) {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const canonical = canonicalJson(envelope.data);
    envelope.integrity.content_hash = await sha256Hex(canonical);
    envelope.integrity.signature.public_key = await crypto.subtle.exportKey("jwk", keys.publicKey);
    envelope.integrity.signature.value = toBase64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, utf8(canonical)));
    return envelope;
  }

  it("arquivo assinado com outra chave mas com evento malformado é recusado", async () => {
    const envelope = JSON.parse(await exported());
    envelope.data.events[0].quality = "★";
    envelope.data.events[1].kind = "teleporte";
    const result = await verifyMatchExport(await resignWithForeignKey(envelope));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["Evento 1: qualidade fora da escala.", "Evento 2: tipo desconhecido."]);
  });

  it("detecta local_seq repetido, anulação órfã e atleta do elenco ausente", async () => {
    const { data } = JSON.parse(await exported());
    data.events[1].local_seq = data.events[0].local_seq;
    data.events.push({ ...data.events[2], id: "x", local_seq: 99, kind: "void", voids_event_id: "nao-existe" });
    data.athletes.pop();
    expect(validateExportData(data)).toEqual([
      expect.stringMatching(/do elenco não está no arquivo/),
      "Evento 2: local_seq repetido.",
      "Evento 4: anula um evento que não está no arquivo.",
    ]);
  });

  it("um arquivo legítimo não tem nenhum erro de estrutura", async () => {
    expect(validateExportData(JSON.parse(await exported()).data)).toEqual([]);
  });
});

describe("sync de partida importada", () => {
  it("o servidor não duplica: mesma entidade com outro mutation_id recebe o mesmo server_seq", async () => {
    // Caso real: os dois tablets usam o mesmo tenant local.
    const tablet1 = new ScoutDB(`t1-${crypto.randomUUID()}`);
    const tablet2 = new ScoutDB(`t2-${crypto.randomUUID()}`);
    try {
      const match = await createMatchWithRoster(tablet1, {
        tenant_id: "local",
        modality: "beach",
        first_server: "A",
        team_a: { name: "A", athletes: [{ name: "Ana" }] },
        team_b: { name: "B", athletes: [{ name: "Carla" }] },
      });
      const s = { tenant_id: "local", match_id: match.id };
      await appendTouch(tablet1, s, { team: "A", athlete_id: match.team_a.athlete_ids[0], skill: "serve", quality: "#" });

      const transport = new MockTransport();
      const fromTablet1 = await tablet1.outbox.toArray();
      const first = await transport.push(fromTablet1);

      await importMatchExport(tablet2, (await exportMatch(tablet1, s)).json, "local");
      const fromTablet2 = await tablet2.outbox.toArray();
      expect(fromTablet2.map((e) => e.mutation_id)).not.toEqual(fromTablet1.map((e) => e.mutation_id));
      const second = await transport.push(fromTablet2);

      const seqByEntity = (entries: typeof fromTablet1, results: typeof first) =>
        Object.fromEntries(entries.map((e, i) => [e.entity_id, results[i].status === "acked" ? results[i].server_seq : results[i].status]));
      expect(seqByEntity(fromTablet2, second)).toEqual(seqByEntity(fromTablet1, first));
      expect(transport.lastSeq).toBe(fromTablet1.length); // nada foi gravado duas vezes
    } finally {
      await tablet1.delete();
      await tablet2.delete();
    }
  });
});
