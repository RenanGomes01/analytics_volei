"use client";

import { useEffect, useMemo } from "react";
import { HardLink } from "@/components/hard-link";
import { groupByMatch, type Occurrence } from "@/domain/stats/occurrences";
import type { Match } from "@/domain/types";

const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** Cabeçalho e ordem dos jogos na folha: "17/10 · Ana/Bia × Cris/Dani · Torneio X", por data. */
export function matchTitles(matches: readonly { match: Match; tournament?: { name: string } | null }[]) {
  const byId = new Map(matches.map((m) => [m.match.id, m]));
  return {
    label: (id: string) => {
      const m = byId.get(id);
      return m ? `${shortDate.format(m.match.created_at)} · ${m.match.team_a.name} × ${m.match.team_b.name} · ${m.tournament?.name ?? "amistoso"}` : id.slice(0, 6);
    },
    rank: (id: string) => byId.get(id)?.match.created_at ?? 0,
  };
}

/**
 * "Em qual jogo e em qual placar" (Fase 19): os lances de uma barra, agrupados por partida, com o
 * placar do set antes do rali e o link para o scout. Mesma folha do DrillPanel.
 */
export function OccurrencesSheet({
  title,
  subtitle,
  occurrences,
  matchLabel,
  matchRank,
  athleteLabel,
  showActor = false,
  onClose,
}: {
  title: string;
  subtitle?: string;
  occurrences: readonly Occurrence[];
  matchLabel: (match_id: string) => string;
  /** Ordem dos jogos (ex.: data); sem isto, a ordem em que aparecem. */
  matchRank?: (match_id: string) => number;
  athleteLabel?: (athlete_id: string) => string;
  /** Mostra quem fez o lance (cartões de dupla/recorte). */
  showActor?: boolean;
  onClose: () => void;
}) {
  const groups = useMemo(() => groupByMatch(occurrences, matchRank), [occurrences, matchRank]);
  const total = groups.reduce((n, g) => n + g.total, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-2 sm:items-center print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5 text-zinc-100 print:max-h-none print:rounded-none" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {subtitle && <p className="truncate text-sm text-zinc-400">{subtitle}</p>}
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-zinc-400">
              Em {groups.length} {groups.length === 1 ? "jogo" : "jogos"} · placar do set antes do rali
            </p>
          </div>
          <p className="text-4xl font-black tabular-nums">{total}</p>
        </header>

        {groups.length === 0 && <p className="text-sm text-zinc-500">Nenhum lance neste recorte.</p>}
        {groups.map((g) => (
          <section key={g.match_id} className="flex flex-col gap-1 rounded-2xl bg-zinc-950/60 p-3">
            <header className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="min-w-0 flex-1 truncate font-semibold">{matchLabel(g.match_id)}</h3>
              <span className="text-sm tabular-nums text-zinc-400">{g.total}×</span>
              <HardLink href={`/match?id=${encodeURIComponent(g.match_id)}`} className="inline-flex min-h-11 items-center text-xs text-zinc-400 underline underline-offset-4" data-print="hide">
                abrir jogo
              </HardLink>
            </header>
            <ol className="flex flex-col gap-1 text-sm tabular-nums">
              {g.items.map((o: Occurrence, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-28 shrink-0 text-zinc-400">
                    Set {o.set_number} · <strong className="text-zinc-100">{o.score_own}×{o.score_opp}</strong>
                  </span>
                  <span className="min-w-0 flex-1">
                    {o.label}
                    {o.duel && <span className="text-zinc-300"> — {o.duel}</span>}
                    {!o.duel && o.opponent_id && athleteLabel && <span className="text-zinc-400"> — vs. {athleteLabel(o.opponent_id)}</span>}
                  </span>
                  {showActor && o.athlete_id && athleteLabel && <span className="text-zinc-400">{athleteLabel(o.athlete_id)}</span>}
                </li>
              ))}
            </ol>
          </section>
        ))}

        <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-zinc-800 font-semibold" data-print="hide">
          Fechar
        </button>
      </div>
    </div>
  );
}
