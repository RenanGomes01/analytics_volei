/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

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
    ignoreURLParametersMatching: [/^id$/, /^key$/, /^year$/, /^gender$/, /^view$/, /^category$/, /^friendlies$/, /^phase$/, /^tab$/, /^mode$/, /^ids$/, /^sort$/, /^dir$/, /^cols$/, /^min$/, /^q$/, /^t$/, /^utm_/, /^fbclid$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // API e login do Supabase nunca passam pelo cache (o defaultCache guardaria GETs de outra origem).
  runtimeCaching: [{ matcher: ({ url }) => /\.supabase\.(co|in)$/.test(url.hostname), handler: new NetworkOnly() }, ...defaultCache],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
