import { HardLink } from "@/components/hard-link";
import { MatchList } from "@/features/matches/match-list";
import { TournamentList } from "@/features/tournament/tournament-list";
import { StorageStatus } from "@/features/storage/storage-status";
import { SyncBadge } from "@/features/sync/sync-badge";

export default function Home() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <div className="flex flex-col items-start gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Scout Vôlei</h1>
            <div className="flex flex-wrap items-center gap-2">
              <SyncBadge />
              <StorageStatus />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HardLink href="/roster" className="min-h-14 rounded-2xl bg-zinc-800 px-5 py-4 text-lg font-semibold">
              Atletas e duplas
            </HardLink>
            <HardLink href="/import" className="min-h-14 rounded-2xl bg-zinc-800 px-5 py-4 text-lg font-semibold">
              ⇧ Importar JSON
            </HardLink>
            <HardLink href="/new" className="min-h-14 rounded-2xl bg-amber-400 px-5 py-4 text-lg font-bold text-zinc-950">
              + Nova partida
            </HardLink>
          </div>
        </header>
        <TournamentList />
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Partidas</h2>
          <MatchList />
        </section>
      </main>
    </div>
  );
}
