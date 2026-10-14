import { describe, expect, it, vi } from "vitest";
import { runOnce } from "@/components/use-submit";

describe("trava de envio (toques repetidos no tablet)", () => {
  it("o segundo toque durante a gravação é ignorado; depois de terminar, libera", async () => {
    const lock = { current: false };
    let release!: () => void;
    const save = vi.fn(() => new Promise<string>((r) => (release = () => r("ok"))));

    const first = runOnce(lock, save);
    const second = await runOnce(lock, save); // mesmo toque, antes do React re-renderizar
    const third = await runOnce(lock, save);
    expect(second).toEqual({ ran: false });
    expect(third).toEqual({ ran: false });
    expect(save).toHaveBeenCalledTimes(1);

    release();
    expect(await first).toEqual({ ran: true, value: "ok" });
    expect(lock.current).toBe(false);
    await runOnce(lock, async () => "de novo");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("erro libera a trava (dá para tentar de novo)", async () => {
    const lock = { current: false };
    await expect(runOnce(lock, async () => Promise.reject(new Error("falhou")))).rejects.toThrow("falhou");
    expect(lock.current).toBe(false);
  });
});
