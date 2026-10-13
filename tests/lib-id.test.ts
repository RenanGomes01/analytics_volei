import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/lib/id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newId", () => {
  it("usa crypto.randomUUID quando existe", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("funciona sem crypto.randomUUID (app aberto por http://IP-da-rede): UUID v4 via getRandomValues", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const ids = Array.from({ length: 500 }, newId);
    expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(500);
  });
});
