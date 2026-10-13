/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // /match?id=…, /team?key=…, /rankings?year=… devem casar com a página pré-cacheada (os filtros são lidos no cliente).
  precacheOptions: {
    ignoreURLParametersMatching: [/^id$/, /^key$/, /^year$/, /^gender$/, /^view$/, /^category$/, /^friendlies$/, /^utm_/, /^fbclid$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
