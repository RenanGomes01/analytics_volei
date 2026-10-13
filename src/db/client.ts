import { ScoutDB } from "./schema";

let instance: ScoutDB | null = null;

/** Instância única do banco. Só existe no browser: Server Components e SSR não têm IndexedDB. */
export function getDB(): ScoutDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB indisponível: getDB() só pode ser chamado no cliente.");
  }
  return (instance ??= new ScoutDB());
}
