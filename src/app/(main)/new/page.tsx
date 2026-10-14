import { Suspense } from "react";
import { NewMatchForm } from "@/features/setup/new-match-form";

export const metadata = { title: "Nova partida" };

export default function NewMatchPage() {
  return (
    <>
      <h1 className="mx-auto w-full max-w-4xl px-4 pt-4 text-2xl font-bold">Nova partida</h1>
      {/* useSearchParams (?tournament=) numa rota estática exige Suspense. */}
      <Suspense fallback={<p className="p-4 text-center text-zinc-400">Carregando cadastro…</p>}>
        <NewMatchForm />
      </Suspense>
    </>
  );
}
