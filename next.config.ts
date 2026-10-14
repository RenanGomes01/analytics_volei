import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isSeedEnabled } from "./src/lib/dev-flags";

const { version } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };

// Sem `cacheComponents`: o app lê os dados do IndexedDB no cliente, e a rota do
// Serwist (src/app/serwist/[path]/route.ts) usa segment config incompatível com ele.
const nextConfig: NextConfig = {
  // Páginas `*.dev.tsx` (hoje só o /dev/seed) existem só fora de produção ou com ENABLE_DEV_SEED=true.
  pageExtensions: isSeedEnabled(process.env) ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  // Vai no envelope de cada exportação JSON (app_version).
  env: { NEXT_PUBLIC_APP_VERSION: version },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
