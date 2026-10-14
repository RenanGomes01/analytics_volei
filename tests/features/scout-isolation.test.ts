import { describe, expect, it, vi } from "vitest";
import { syncAllowedOn } from "@/features/sync/sync-config";
import { pausedWhenHidden } from "@/lib/use-visible-live-query";

/** Fase 14 — nada disputa o IndexedDB com o scout no tablet. */
describe("isolamento da tela de scout", () => {
  it("o sync não roda na tela de scout e volta em qualquer outra tela", () => {
    expect(syncAllowedOn("/match")).toBe(false);
    expect(syncAllowedOn("/match/")).toBe(false);
    for (const path of ["/", "/account", "/rankings", "/athlete", "/new", "/matches-old"]) expect(syncAllowedOn(path)).toBe(true);
  });

  it("aba oculta: a consulta pesada não roda (nem lê tabela) até a aba voltar", async () => {
    const querier = vi.fn(async () => "temporada");
    const hidden = pausedWhenHidden(false, querier);
    let settled = false;
    void Promise.resolve(hidden()).then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(querier).not.toHaveBeenCalled();
    expect(settled).toBe(false); // o useLiveQuery mantém o último resultado

    expect(await pausedWhenHidden(true, querier)()).toBe("temporada");
    expect(querier).toHaveBeenCalledTimes(1);
  });
});
