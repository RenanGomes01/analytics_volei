import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// Sem `cacheComponents`: o app lê os dados do IndexedDB no cliente, e a rota do
// Serwist (src/app/serwist/[path]/route.ts) usa segment config incompatível com ele.
const nextConfig: NextConfig = {
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
