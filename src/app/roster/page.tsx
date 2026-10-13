import { HardLink } from "@/components/hard-link";
import { RosterScreen } from "@/features/roster/roster-screen";

export const metadata = { title: "Atletas e duplas" };

export default function RosterPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 p-4">
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Início
        </HardLink>
        <h1 className="text-2xl font-bold">Atletas e duplas</h1>
      </header>
      <RosterScreen />
    </div>
  );
}
