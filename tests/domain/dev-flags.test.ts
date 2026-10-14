import { describe, expect, it } from "vitest";
import { isSeedEnabled } from "@/lib/dev-flags";

describe("/dev/seed só fora de produção", () => {
  it("dev e teste: liberado; produção (Vercel): bloqueado; produção local com ENABLE_DEV_SEED=true: liberado", () => {
    expect(isSeedEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isSeedEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isSeedEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isSeedEnabled({ NODE_ENV: "production", ENABLE_DEV_SEED: "1" })).toBe(false);
    expect(isSeedEnabled({ NODE_ENV: "production", ENABLE_DEV_SEED: "true" })).toBe(true);
  });
});
