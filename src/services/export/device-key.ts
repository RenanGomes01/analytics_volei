import type { ScoutDB } from "@/db/schema";

const SIGNING_KEY = "device_signing_key";

export const ECDSA_P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
export const ECDSA_SHA256 = { name: "ECDSA", hash: "SHA-256" } as const;

const isKeyPair = (value: unknown): value is CryptoKeyPair =>
  !!value && typeof value === "object" && "privateKey" in value && "publicKey" in value;

/**
 * Par de chaves de assinatura deste aparelho. A chave privada é NÃO-extraível: fica no IndexedDB
 * (structured clone de CryptoKey) e nunca sai do tablet; a pública vai em cada exportação.
 */
export async function getDeviceSigningKey(db: ScoutDB): Promise<CryptoKeyPair> {
  const stored = (await db.meta.get(SIGNING_KEY))?.value;
  if (isKeyPair(stored)) return stored;

  // Gerada fora da transação: o Dexie não aceita aguardar WebCrypto dentro de uma.
  const fresh = await crypto.subtle.generateKey(ECDSA_P256, false, ["sign", "verify"]);
  return db.transaction("rw", db.meta, async () => {
    const existing = (await db.meta.get(SIGNING_KEY))?.value;
    if (isKeyPair(existing)) return existing; // outra exportação simultânea venceu a corrida
    await db.meta.put({ key: SIGNING_KEY, value: fresh });
    return fresh;
  });
}
