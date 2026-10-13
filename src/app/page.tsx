import { HardLink } from "@/components/hard-link";
import { MatchList } from "@/features/matches/match-list";
import { SyncBadge } from "@/features/sync/sync-badge";

export default function Home() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        <header className="flex items-center justify-between gap-4 pt-4">
          <div className="flex flex-col items-start gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Scout Vôlei</h1>
            <SyncBadge />
          </div>
          <HardLink href="/new" className="min-h-14 rounded-2xl bg-amber-400 px-5 py-4 text-lg font-bold text-zinc-950">
            + Nova partida
          </HardLink>
        </header>
        <MatchList />
      </main>
    </div>
  );
}
