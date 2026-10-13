import { Suspense } from "react";
import { HardLink } from "@/components/hard-link";
import { NewMatchForm } from "@/features/setup/new-match-form";

export const metadata = { title: "Nova partida" };

export default function NewMatchPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-4xl items-center gap-4 p-4">
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Partidas
        </HardLink>
        <h1 className="text-2xl font-bold">Nova partida</h1>
      </header>
      {/* useSearchParams (?tournament=) numa rota estática exige Suspense. */}
      <Suspense fallback={<p className="p-4 text-center text-zinc-400">Carregando cadastro…</p>}>
        <NewMatchForm />
      </Suspense>
    </div>
  );
}
