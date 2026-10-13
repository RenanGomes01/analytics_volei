import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/export/canonical-json";
import { replayMatch } from "@/domain/rally/replay";
import { rulesFor } from "@/domain/rules/modality";
import { ScoutDB } from "@/db/schema";
import { sha256Hex } from "@/services/export/crypto-encoding";
import { exportMatch, getLastExport, markExported } from "@/services/export/export-service";
import { verifyMatchExport } from "@/services/export/verify-export";
import { createMatchWithRoster } from "@/services/match-service";
import { appendRallyEnd, appendTouch, undoLastAction, type MatchScope } from "@/services/rally-ledger-service";

let db: ScoutDB;
let scope: MatchScope;
const NOW = Date.UTC(2026, 9, 13, 14, 2, 11);

beforeEach(async () => {
  db = new ScoutDB(`test-${crypto.randomUUID()}`);
  const match = await createMatchWithRoster(db, {
    tenant_id: "t1",
    modality: "beach",
    first_server: "A",
    team_a: { name: "Dupla Azul", athletes: [{ name: "Ana", jersey_number: 1 }, { name: "Bia" }] },
    team_b: { name: "Dupla Verde ção", athletes: [{ name: "Carla", jersey_number: 3 }, { name: "Duda", jersey_number: 4 }] },
  });
  scope = { tenant_id: "t1", match_id: match.id };
  const [a1] = match.team_a.athlete_ids;
  const [b1] = match.team_b.athlete_ids;
  await appendTouch(db, scope, { team: "A", athlete_id: a1, skill: "serve", quality: "#" }); // ace
  await appendTouch(db, scope, { team: "A", athlete_id: a1, skill: "serve", quality: "+" });
  await appendTouch(db, scope, { team: "B", athlete_id: b1, skill: "reception", quality: "+" });
  await appendRallyEnd(db, scope, { point_to: "B", reason: "manual" });
  await undoLastAction(db, scope); // VoidEvent no ledger
});

afterEach(async () => {
  await db.delete();
});

describe("canonicalJson", () => {
  it("é estável sob reordenação de chaves e omite undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: undefined }], c: "x" } })).toBe(
      canonicalJson({ a: { c: "x", d: [1, { z: 0 }] }, b: 1 }),
    );
    expect(canonicalJson({ b: [undefined], a: null })).toBe('{"a":null,"b":[null]}');
    expect(() => canonicalJson({ n: NaN })).toThrow();
  });
});

describe("exportMatch + verifyMatchExport", () => {
  it("gera envelope v1 com ledger completo (inclusive anulações) e nome de arquivo previsível", async () => {
    const { envelope, filename } = await exportMatch(db, scope, { now: NOW, app_version: "9.9.9" });
    expect(envelope).toMatchObject({
      format: "volei-scout/match-export",
      schema_version: 1,
      exported_at: "2026-10-13T14:02:11.000Z",
      app_version: "9.9.9",
      source: { tenant_id: "t1" },
      summary: { score_by_set: [[1, 0]], winner: null, event_count: 5 },
      integrity: { algorithm: "SHA-256", signature: { algorithm: "ECDSA-P256-SHA256" } },
    });
    expect(envelope.data.events.map((e) => e.kind)).toEqual(["touch", "touch", "touch", "rally_end", "void"]);
    expect(envelope.data.events.map((e) => e.local_seq)).toEqual([1, 2, 3, 4, 5]);
    expect(envelope.data.athletes.map((a) => a.name)).toEqual(["Ana", "Bia", "Carla", "Duda"]);
    expect(filename).toBe(`scout_dupla-azul-x-dupla-verde-cao_2026-10-13_${scope.match_id.slice(0, 8)}.json`);
  });

  it("o arquivo exportado é verificável e o replay dele reproduz o placar do banco", async () => {
    const { json } = await exportMatch(db, scope, { now: NOW });
    const result = await verifyMatchExport(json);
    expect(result).toMatchObject({ ok: true, errors: [] });

    const { match, events } = result.envelope!.data;
    const state = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server });
    expect(state.sets[0].score).toEqual({ A: 1, B: 0 });
    expect(state.open_rally?.touches).toHaveLength(2); // o ponto manual foi desfeito
  });

  it("hash é determinístico e a chave do aparelho é reutilizada entre exportações", async () => {
    const first = await exportMatch(db, scope, { now: NOW });
    const second = await exportMatch(db, scope, { now: NOW + 60_000 });
    expect(second.envelope.integrity.content_hash).toBe(first.envelope.integrity.content_hash);
    expect(second.envelope.integrity.signature.public_key).toEqual(first.envelope.integrity.signature.public_key);
    expect(second.envelope.source.device_id).toBe(first.envelope.source.device_id);
  });

  it("alterar um único evento invalida o hash e a assinatura", async () => {
    const { envelope } = await exportMatch(db, scope, { now: NOW });
    const tampered = structuredClone(envelope);
    const touch = tampered.data.events[0];
    if (touch.kind === "touch") touch.quality = "=";

    const result = await verifyMatchExport(JSON.stringify(tampered));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Hash não confere/);
    expect(result.errors.join(" ")).toMatch(/Assinatura inválida/);
  });

  it("recalcular o hash não basta: a assinatura continua presa à chave original", async () => {
    const { envelope } = await exportMatch(db, scope, { now: NOW });
    const tampered = structuredClone(envelope);
    tampered.data.match.team_a.name = "Outro time";
    tampered.integrity.content_hash = await sha256Hex(canonicalJson(tampered.data));

    const result = await verifyMatchExport(tampered);
    expect(result.errors).toEqual(["Assinatura inválida para esta chave pública."]);
  });

  it("trocar a chave pública por outra invalida a assinatura", async () => {
    const { envelope } = await exportMatch(db, scope, { now: NOW });
    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    envelope.integrity.signature.public_key = await crypto.subtle.exportKey("jwk", other.publicKey);
    expect((await verifyMatchExport(envelope)).ok).toBe(false);
  });

  it("rejeita arquivos que não são exportações válidas", async () => {
    expect((await verifyMatchExport("{nao é json")).errors).toEqual(["Arquivo não é um JSON válido."]);
    expect((await verifyMatchExport({ format: "outro", schema_version: 7 })).ok).toBe(false);
  });

  it("exportar não grava nada no ledger nem no outbox; markExported registra o último backup", async () => {
    const before = { events: await db.rally_events.count(), outbox: await db.outbox.count() };
    const { envelope } = await exportMatch(db, scope, { now: NOW });
    expect({ events: await db.rally_events.count(), outbox: await db.outbox.count() }).toEqual(before);

    expect(await getLastExport(db, scope.match_id)).toBeNull();
    await markExported(db, scope.match_id, { at: NOW, content_hash: envelope.integrity.content_hash });
    expect(await getLastExport(db, scope.match_id)).toEqual({ at: NOW, content_hash: envelope.integrity.content_hash });
  });

  it("a chave privada do aparelho não é extraível", async () => {
    await exportMatch(db, scope, { now: NOW });
    const pair = (await db.meta.get("device_signing_key"))!.value as CryptoKeyPair;
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("jwk", pair.privateKey)).rejects.toThrow();
  });
});
