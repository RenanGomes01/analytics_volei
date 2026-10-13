/**
 * Proteção do IndexedDB contra a limpeza automática do navegador (storage eviction).
 * `persist()` só PEDE a proteção: quem decide é o navegador (no Chrome, PWA instalado e site
 * muito usado costumam receber sem aviso; no Safari/iPad a proteção vem de instalar o app).
 */

/** O subconjunto de StorageManager usado aqui (permite testar sem navegador). */
export interface StorageLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface StorageProtection {
  supported: boolean;
  persisted: boolean;
  usage?: number;
  quota?: number;
}

const defaultStorage = (): StorageLike | undefined =>
  typeof navigator !== "undefined" ? navigator.storage : undefined;

export async function getStorageProtection(storage: StorageLike | undefined = defaultStorage()): Promise<StorageProtection> {
  if (!storage?.persisted || !storage.persist) return { supported: false, persisted: false };
  const [persisted, estimate] = await Promise.all([
    storage.persisted().catch(() => false),
    storage.estimate?.().catch(() => undefined),
  ]);
  return { supported: true, persisted, usage: estimate?.usage, quota: estimate?.quota };
}

/** Pede a proteção se ainda não houver. Nunca lança: em caso de erro, responde `false`. */
export async function requestStorageProtection(storage: StorageLike | undefined = defaultStorage()): Promise<boolean> {
  if (!storage?.persisted || !storage.persist) return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}
