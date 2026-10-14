import { Suspense } from "react";
import { TournamentDashboard } from "@/features/tournament/tournament-dashboard";

export const metadata = { title: "Torneio" };

// Rota estática (pré-cacheada pelo service worker). O `?id=` é lido no cliente.
export default function TournamentPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-zinc-400">Carregando torneio…</p>}>
      <TournamentDashboard />
    </Suspense>
  );
}
