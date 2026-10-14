import { ScoutDB } from "./schema";

let instance: ScoutDB | null = null;

/**
 * Saúde da conexão (Fase 14), para a tela de scout explicar um carregamento que não termina em vez
 * de ficar em "Carregando…" para sempre. `blocked`: a abertura (ou atualização do schema) espera
 * outra aba/janela do app que ainda segura o banco — típico de aba congelada no Android.
 */
export interface DBHealth {
  blocked: boolean;
  /** Outra aba abriu uma versão nova do schema e esta conexão foi fechada. */
  versionChanged: boolean;
}

let health: DBHealth = { blocked: false, versionChanged: false };
const listeners = new Set<() => void>();

function setHealth(patch: Partial<DBHealth>) {
  health = { ...health, ...patch };
  for (const listener of listeners) listener();
}

export const getDBHealth = (): DBHealth => health;

export function subscribeDBHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Instância única do banco. Só existe no browser: Server Components e SSR não têm IndexedDB. */
export function getDB(): ScoutDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB indisponível: getDB() só pode ser chamado no cliente.");
  }
  if (!instance) {
    const db = new ScoutDB();
    db.on("blocked", () => setHealth({ blocked: true }));
    db.on("ready", () => setHealth({ blocked: false }), true);
    // O Dexie fecha esta conexão sozinho para não travar a atualização na outra aba.
    db.on("versionchange", () => setHealth({ versionChanged: true }));
    instance = db;
  }
  return instance;
}

/**
 * "Recarregar banco de dados local": fecha a conexão e recarrega a página, que abre uma nova.
 * NUNCA apaga dados — nada de `Dexie.delete` aqui.
 */
export function reopenDB(): void {
  instance?.close();
  instance = null;
  location.reload();
}
