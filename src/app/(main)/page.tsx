import { MatchList } from "@/features/matches/match-list";
import { TournamentList } from "@/features/tournament/tournament-list";
import { StorageStatus } from "@/features/storage/storage-status";
import { SyncBadge } from "@/features/sync/sync-badge";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      {/* A navegação está no cabeçalho global; aqui só o estado do aparelho (informativo). */}
      <div className="flex flex-wrap items-center gap-2">
        <SyncBadge />
        <StorageStatus />
      </div>
      <TournamentList />
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Partidas</h1>
        <MatchList />
      </section>
    </main>
  );
}
