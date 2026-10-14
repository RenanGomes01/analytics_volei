"use client";

import { EmptyState } from "@/components/empty-state";
import { HardLink } from "@/components/hard-link";
import { useRosterData } from "@/features/roster/use-roster-data";

const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** Torneios do aparelho, com o número de partidas de cada um. Novos torneios nascem no /new. */
export function TournamentList() {
  const roster = useRosterData();
  if (!roster) return null;

  const count = (id: string) => roster.entries.filter((e) => e.tournament_id === id).length;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Torneios</h2>
      {roster.tournaments.length === 0 ? (
        <EmptyState icon="🏆" title="Nenhum torneio ainda." primary={{ label: "+ Criar torneio", href: "/new" }}>
          O torneio é criado junto com a primeira partida dele, em “Nova partida”. Jogos sem torneio contam como amistosos.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.tournaments.map((t) => (
            <li key={t.id}>
              <HardLink
                href={`/tournament?id=${encodeURIComponent(t.id)}`}
                className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-zinc-900 px-4 active:bg-zinc-800"
              >
                <span className="truncate text-lg font-semibold">{t.name}</span>
                <span className="shrink-0 text-sm text-zinc-400">
                  {t.modality === "beach" ? "Beach" : "Indoor"} · {brDate(t.start_date)} · {count(t.id)} {count(t.id) === 1 ? "jogo" : "jogos"}
                </span>
              </HardLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
