import { canonicalJson } from "@/domain/export/canonical-json";
import type { ScoutDB } from "@/db/schema";
import { sha256Hex } from "./crypto-encoding";

const SIGNING_KEY = "device_signing_key";
const KNOWN_DEVICES_KEY = "known_devices";

/** De onde veio um arquivo, pela chave pública que o assinou. */
export type DeviceOrigin = "this_device" | "known" | "new";

type KnownDevices = Record<string, { first_seen: number }>;

/** Impressão digital curta e legível de uma chave pública EC: "7F3A·91C2". */
export async function keyFingerprint(jwk: JsonWebKey): Promise<string> {
  const hex = (await sha256Hex(canonicalJson({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))).toUpperCase();
  return `${hex.slice(0, 4)}·${hex.slice(4, 8)}`;
}

/** Só lê: não cria a chave deste aparelho se ela ainda não existir. */
export async function classifyOrigin(db: ScoutDB, fingerprint: string): Promise<DeviceOrigin> {
  const own = (await db.meta.get(SIGNING_KEY))?.value as CryptoKeyPair | undefined;
  if (own?.publicKey && (await keyFingerprint(await crypto.subtle.exportKey("jwk", own.publicKey))) === fingerprint) {
    return "this_device";
  }
  const known = ((await db.meta.get(KNOWN_DEVICES_KEY))?.value ?? {}) as KnownDevices;
  return fingerprint in known ? "known" : "new";
}

/** Registra o aparelho como "já visto". Deve rodar dentro da transação da importação (usa só a tabela meta). */
export async function rememberDevice(db: ScoutDB, fingerprint: string, now: number): Promise<void> {
  const known = ((await db.meta.get(KNOWN_DEVICES_KEY))?.value ?? {}) as KnownDevices;
  if (fingerprint in known) return;
  await db.meta.put({ key: KNOWN_DEVICES_KEY, value: { ...known, [fingerprint]: { first_seen: now } } });
}
