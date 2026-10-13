import { Suspense } from "react";
import { RankingsScreen } from "@/features/analytics/rankings-screen";

export const metadata = { title: "Rankings" };

// Rota estática (pré-cacheada). Os filtros vêm da query string e são lidos no cliente.
export default function RankingsPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <Suspense fallback={<p className="p-8 text-center text-zinc-400">Carregando temporada…</p>}>
        <RankingsScreen />
      </Suspense>
    </div>
  );
}
