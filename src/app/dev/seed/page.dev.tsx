import { HardLink } from "@/components/hard-link";
import { SeedScreen } from "@/features/dev/seed-screen";

export const metadata = { title: "Dados de teste" };

// Ferramenta de homologação: sem link na home e fora do pré-cache (acesse digitando /dev/seed).
// Arquivo `page.dev.tsx`: só vira rota quando next.config inclui a extensão "dev.tsx" (fora de
// produção ou com ENABLE_DEV_SEED=true; ver src/lib/dev-flags.ts). Na Vercel a rota nem é gerada.
export default function SeedPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-2xl items-center gap-4 p-4">
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Início
        </HardLink>
        <h1 className="text-2xl font-bold">Dados de teste</h1>
      </header>
      <SeedScreen />
    </div>
  );
}
