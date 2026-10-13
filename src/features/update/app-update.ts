/**
 * Detecção de versão nova do PWA.
 *
 * O service worker usa skipWaiting + clientsClaim: uma versão nova assume o controle das abas
 * abertas imediatamente, mas o JavaScript já carregado em cada aba continua sendo o antigo até
 * recarregar. Uma aba assim fica "desatualizada": mostra o banner e pausa o sync, para não
 * enviar o outbox com código velho.
 */

type Listener = () => void;

let outdated = false;
const listeners = new Set<Listener>();

export const isAppOutdated = (): boolean => outdated;

export function markAppOutdated(): void {
  if (outdated) return;
  outdated = true;
  for (const listener of listeners) listener();
}

export function subscribeAppOutdated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** O subconjunto de ServiceWorkerContainer usado aqui (permite testar sem navegador). */
export interface WatchableContainer {
  controller: unknown;
  addEventListener(type: "controllerchange", listener: Listener): void;
  removeEventListener(type: "controllerchange", listener: Listener): void;
  getRegistration(): Promise<{ update(): Promise<unknown> } | undefined>;
}

/**
 * Chama `onUpdate` quando uma versão nova assume o controle desta aba.
 * Na primeira instalação a página ainda não tinha controlador e o clientsClaim também dispara
 * `controllerchange`; isso não é versão nova e é ignorado.
 */
export function watchForUpdates(container: WatchableContainer, onUpdate: Listener): () => void {
  let hadController = !!container.controller;
  const onChange = () => {
    if (hadController) onUpdate();
    hadController = true;
  };
  container.addEventListener("controllerchange", onChange);
  return () => container.removeEventListener("controllerchange", onChange);
}

/** Pede ao navegador para conferir se há service worker novo. Falha em silêncio (offline). */
export async function checkForUpdate(container: WatchableContainer): Promise<void> {
  try {
    await (await container.getRegistration())?.update();
  } catch {
    // Sem rede ou servidor fora: tenta de novo no próximo gatilho.
  }
}
