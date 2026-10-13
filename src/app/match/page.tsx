import { Suspense } from "react";
import { MatchScreen } from "@/features/scout/match-screen";

export const metadata = { title: "Scout — Partida" };

// Rota estática (pré-cacheada pelo service worker). O `?id=` é lido no cliente,
// por isso o Suspense é obrigatório em volta de useSearchParams.
export default function MatchPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-zinc-950" />}>
      <MatchScreen />
    </Suspense>
  );
}
