/**
 * O /dev/seed (dados sintéticos) só existe fora de produção. Em `next start` local dá para religar
 * com `ENABLE_DEV_SEED=true` (no ambiente do `npm run build`); na Vercel a variável não existe e a
 * rota nem é gerada (404). Usado por next.config.ts (`pageExtensions`): a página é
 * `src/app/dev/seed/page.dev.tsx`.
 */
export function isSeedEnabled(env: { NODE_ENV?: string; ENABLE_DEV_SEED?: string }): boolean {
  return env.NODE_ENV !== "production" || env.ENABLE_DEV_SEED === "true";
}
