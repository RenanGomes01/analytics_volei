"use client";

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
        <p className="text-sm text-zinc-400">Nenhum torneio ainda. Crie um ao iniciar uma nova partida.</p>
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
