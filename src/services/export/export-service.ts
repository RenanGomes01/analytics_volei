import { canonicalJson } from "@/domain/export/canonical-json";
import {
  buildMatchExport,
  exportFilename,
  SIGNATURE_ALGORITHM,
  type MatchExportV1,
} from "@/domain/export/match-export";
import type { Athlete } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { APP_VERSION } from "@/lib/app-version";
import { getDeviceId } from "../device-service";
import { getMatch } from "../match-service";
import { listMatchEvents, type MatchScope } from "../rally-ledger-service";
import { sha256Hex, toBase64, utf8 } from "./crypto-encoding";
import { ECDSA_SHA256, getDeviceSigningKey } from "./device-key";

export interface MatchExportFile {
  envelope: MatchExportV1;
  json: string;
  filename: string;
}

export interface LastExport {
  at: number;
  content_hash: string;
}

const lastExportKey = (match_id: string) => `export:${match_id}`;

/**
 * Gera a exportação assinada de uma partida. Só lê partida, elenco e ledger
 * (a meta pode ganhar o device_id e a chave de assinatura na primeira vez).
 */
export async function exportMatch(
  db: ScoutDB,
  scope: MatchScope,
  { now = Date.now(), app_version = APP_VERSION }: { now?: number; app_version?: string } = {},
): Promise<MatchExportFile> {
  const { match, athletes, events, device_id } = await db.transaction(
    "rw",
    [db.matches, db.athletes, db.rally_events, db.meta],
    async () => {
      const match = await getMatch(db, scope.tenant_id, scope.match_id);
      if (!match) throw new Error(`Partida ${scope.match_id} não encontrada.`);
      const ids = [...match.team_a.athlete_ids, ...match.team_b.athlete_ids];
      const athletes = (await db.athletes.bulkGet(ids)).filter((a): a is Athlete => !!a);
      return { match, athletes, events: await listMatchEvents(db, scope), device_id: await getDeviceId(db) };
    },
  );

  const unsigned = buildMatchExport({ match, athletes, events, exported_at: now, app_version, device_id });
  const canonical = canonicalJson(unsigned.data);
  const keys = await getDeviceSigningKey(db);
  const [content_hash, signature, public_key] = await Promise.all([
    sha256Hex(canonical),
    crypto.subtle.sign(ECDSA_SHA256, keys.privateKey, utf8(canonical)),
    crypto.subtle.exportKey("jwk", keys.publicKey),
  ]);

  const envelope: MatchExportV1 = {
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      content_hash,
      signature: { algorithm: SIGNATURE_ALGORITHM, public_key, value: toBase64(signature) },
    },
  };
  return { envelope, json: JSON.stringify(envelope, null, 2), filename: exportFilename(match, now) };
}

/** Registra que o arquivo foi entregue (baixado ou compartilhado), para o aviso "Último backup". */
export async function markExported(db: ScoutDB, match_id: string, entry: LastExport): Promise<void> {
  await db.meta.put({ key: lastExportKey(match_id), value: entry });
}

export async function getLastExport(db: ScoutDB, match_id: string): Promise<LastExport | null> {
  const value = (await db.meta.get(lastExportKey(match_id)))?.value as LastExport | undefined;
  return value ?? null;
}
