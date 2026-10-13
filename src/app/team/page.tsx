import { Suspense } from "react";
import { TeamProfile } from "@/features/analytics/team-profile";

export const metadata = { title: "Dupla" };

// Rota estática (pré-cacheada). O identificador vem da query string e é lido no cliente.
export default function TeamProfilePage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <Suspense fallback={<p className="p-8 text-center text-zinc-400">Carregando…</p>}>
        <TeamProfile />
      </Suspense>
    </div>
  );
}
