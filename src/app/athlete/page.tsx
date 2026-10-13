import { Suspense } from "react";
import { AthleteProfile } from "@/features/analytics/athlete-profile";

export const metadata = { title: "Atleta" };

// Rota estática (pré-cacheada). O identificador vem da query string e é lido no cliente.
export default function AthleteProfilePage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <Suspense fallback={<p className="p-8 text-center text-zinc-400">Carregando…</p>}>
        <AthleteProfile />
      </Suspense>
    </div>
  );
}
