import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_KEY, MAX_TOASTS, TOAST_MS, dismissToast, getToasts, resetToasts, showFlashToasts, toast } from "@/features/toast/toast";
import { sameNameAthletes } from "@/domain/roster/identity";

beforeEach(() => {
  vi.useFakeTimers();
  resetToasts();
});
afterEach(() => {
  resetToasts();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("toasts", () => {
  it("empilha no máximo 3 e cada um some sozinho", () => {
    for (let i = 1; i <= 4; i++) toast.success(`ação ${i}`);
    expect(getToasts().map((t) => t.message)).toEqual(["ação 2", "ação 3", "ação 4"]);
    expect(getToasts()).toHaveLength(MAX_TOASTS);
    vi.advanceTimersByTime(TOAST_MS);
    expect(getToasts()).toEqual([]);
  });

  it("com ação (Desfazer) fica mais tempo; fechar remove na hora", () => {
    const run = vi.fn();
    toast.success("Partida enviada para a lixeira.", { action: { label: "Desfazer", run } });
    vi.advanceTimersByTime(TOAST_MS);
    expect(getToasts()).toHaveLength(1);
    getToasts()[0].action!.run();
    expect(run).toHaveBeenCalledOnce();
    dismissToast(getToasts()[0].id);
    expect(getToasts()).toEqual([]);
  });

  it("afterNavigation guarda no sessionStorage e aparece na próxima página", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    toast.success("Partida criada.", { afterNavigation: true });
    expect(getToasts()).toEqual([]);
    expect(store.has(FLASH_KEY)).toBe(true);

    showFlashToasts(); // "nova página"
    expect(getToasts().map((t) => t.message)).toEqual(["Partida criada."]);
    expect(store.has(FLASH_KEY)).toBe(false);
    showFlashToasts();
    expect(getToasts()).toHaveLength(1); // não repete
  });

  it("sem storage (aba privada, bloqueado): mostra já, nesta página", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    toast.info("Partida importada.", { afterNavigation: true });
    expect(getToasts().map((t) => t.message)).toEqual(["Partida importada."]);
  });
});

describe("cadastro de atleta: aviso de nome repetido", () => {
  const athletes = [{ name: "Júlia Souza" }, { name: "Ana" }];
  it("ignora acento, maiúsculas e espaços", () => {
    expect(sameNameAthletes(athletes, "  julia   SOUZA ")).toEqual([{ name: "Júlia Souza" }]);
    expect(sameNameAthletes(athletes, "Júlia")).toEqual([]);
    expect(sameNameAthletes(athletes, "")).toEqual([]);
  });
});
