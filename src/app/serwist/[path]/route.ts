import { createSerwistRoute } from "@serwist/turbopack";

// Revisão das páginas HTML pré-cacheadas. A rota é estática: o valor é fixado no build,
// então cada build novo invalida o HTML antigo (os assets em _next/static já têm hash).
const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/match", revision },
    { url: "/new", revision },
    { url: "/import", revision },
    { url: "/tournament", revision },
    { url: "/roster", revision },
    { url: "/~offline", revision },
  ],
  useNativeEsbuild: true,
});
