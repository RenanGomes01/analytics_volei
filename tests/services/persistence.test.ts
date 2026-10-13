import { describe, expect, it, vi } from "vitest";
import { getStorageProtection, requestStorageProtection, type StorageLike } from "@/services/storage/persistence";

const storage = (persisted: boolean, grant: boolean): StorageLike & { persist: ReturnType<typeof vi.fn> } => ({
  persisted: vi.fn(async () => persisted),
  persist: vi.fn(async () => grant),
  estimate: vi.fn(async () => ({ usage: 1_200_000, quota: 2_000_000_000 })),
});

describe("proteção do armazenamento", () => {
  it("já protegido: não pede de novo", async () => {
    const s = storage(true, false);
    expect(await requestStorageProtection(s)).toBe(true);
    expect(s.persist).not.toHaveBeenCalled();
    expect(await getStorageProtection(s)).toEqual({ supported: true, persisted: true, usage: 1_200_000, quota: 2_000_000_000 });
  });

  it("não protegido: pede e respeita a decisão do navegador", async () => {
    expect(await requestStorageProtection(storage(false, true))).toBe(true);
    const denied = storage(false, false);
    expect(await requestStorageProtection(denied)).toBe(false);
    expect(denied.persist).toHaveBeenCalledOnce();
  });

  it("navegador sem a API: não suportado, sem lançar", async () => {
    expect(await getStorageProtection({})).toEqual({ supported: false, persisted: false });
    expect(await requestStorageProtection({})).toBe(false);
    expect(await requestStorageProtection(undefined)).toBe(false);
  });

  it("erro do navegador vira 'não protegido', nunca uma exceção", async () => {
    const broken: StorageLike = { persisted: async () => false, persist: async () => Promise.reject(new Error("bloqueado")) };
    expect(await requestStorageProtection(broken)).toBe(false);
  });
});
