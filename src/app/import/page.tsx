import { HardLink } from "@/components/hard-link";
import { ImportScreen } from "@/features/import/import-screen";

export const metadata = { title: "Importar partida" };

export default function ImportPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 p-4">
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Partidas
        </HardLink>
        <h1 className="text-2xl font-bold">Importar partida</h1>
      </header>
      <ImportScreen />
    </div>
  );
}
