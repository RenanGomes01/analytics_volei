import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  isAppOutdated,
  markAppOutdated,
  subscribeAppOutdated,
  watchForUpdates,
  type WatchableContainer,
} from "@/features/update/app-update";

function fakeContainer(controller: unknown, update = vi.fn(async () => undefined)) {
  const target = new EventTarget();
  const container: WatchableContainer = {
    controller,
    addEventListener: (type, l) => target.addEventListener(type, l),
    removeEventListener: (type, l) => target.removeEventListener(type, l),
    getRegistration: async () => ({ update }),
  };
  const takeOver = () => target.dispatchEvent(new Event("controllerchange"));
  return { container, takeOver, update };
}

describe("watchForUpdates", () => {
  it("aba já controlada por um SW: a troca de controlador é versão nova", () => {
    const { container, takeOver } = fakeContainer({ scriptURL: "/serwist/sw.js" });
    const onUpdate = vi.fn();
    watchForUpdates(container, onUpdate);
    takeOver();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("primeira instalação (sem controlador) não é versão nova; a troca seguinte é", () => {
    const { container, takeOver } = fakeContainer(null);
    const onUpdate = vi.fn();
    watchForUpdates(container, onUpdate);
    takeOver(); // clientsClaim da primeira instalação
    expect(onUpdate).not.toHaveBeenCalled();
    takeOver(); // deploy seguinte
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("para de observar após o cleanup", () => {
    const { container, takeOver } = fakeContainer({});
    const onUpdate = vi.fn();
    watchForUpdates(container, onUpdate)();
    takeOver();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("checkForUpdate", () => {
  it("pede update ao registro e engole falhas de rede", async () => {
    const ok = fakeContainer({});
    await checkForUpdate(ok.container);
    expect(ok.update).toHaveBeenCalledOnce();

    const offline = fakeContainer({}, vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(checkForUpdate(offline.container)).resolves.toBeUndefined();
  });
});

describe("estado de aba desatualizada", () => {
  it("marca uma única vez e avisa os assinantes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppOutdated(listener);
    expect(isAppOutdated()).toBe(false);
    markAppOutdated();
    markAppOutdated();
    expect(isAppOutdated()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
