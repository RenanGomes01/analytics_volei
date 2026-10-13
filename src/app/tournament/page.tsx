import { Suspense } from "react";
import { HardLink } from "@/components/hard-link";
import { TournamentDashboard } from "@/features/tournament/tournament-dashboard";

export const metadata = { title: "Torneio" };

// Rota estática (pré-cacheada pelo service worker). O `?id=` é lido no cliente.
export default function TournamentPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <HardLink href="/" className="inline-block min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Início
        </HardLink>
      </div>
      <Suspense fallback={<p className="p-8 text-center text-zinc-400">Carregando torneio…</p>}>
        <TournamentDashboard />
      </Suspense>
    </div>
  );
}
