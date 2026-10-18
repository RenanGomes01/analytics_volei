"use client";

import { useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { replayMatch } from "@/domain/rally/replay";
import { athleteNameResolver } from "@/domain/roster/match-search";
import { PHASE_LABEL } from "@/domain/roster/types";
import { rulesFor } from "@/domain/rules/modality";
import type { SeasonMatch } from "@/domain/stats/season";
import type { TeamSide } from "@/domain/types";
import { TeamNames } from "@/features/matches/team-names";
import { readQueryParam } from "@/features/matches/use-match-search";
import { useStaffMode } from "@/features/staff/staff-mode";
import { Card } from "./ui";
import { replaceQuery, type SeasonView } from "./use-season-data";

const FRIENDLIES = "amistosos";
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

interface Props {
  /** Partidas do recorte (temporada/fase) em que o perfil jogou. */
  matches: readonly SeasonMatch[];
  season: SeasonView;
  /** Lado do perfil (atleta ou dupla) na partida. */
  sideOf: (m: SeasonMatch) => TeamSide | null;
  /** false = o recorte por torneio é feito pela tela (perfil da atleta, Fase 18): sem select próprio. */
  showFilter?: boolean;
}

/**
 * "Partidas" do perfil (atleta ou dupla): cartões com placar, V/D do ponto de vista do perfil, torneio
 * e fase, e nomes clicáveis. Filtro por torneio na URL (`?t=`). Parte dos dados já carregados do perfil.
 * Modo comissão: a lista aparece, só sem o link para o scout.
 */
export function ProfileMatches({ matches, season, sideOf, showFilter = true }: Props) {
  const staff = useStaffMode();
  const [chosen, setTournamentState] = useState(() => readQueryParam("t"));
  const tournament = showFilter ? chosen : "";
  const setTournament = (t: string) => {
    setTournamentState(t);
    replaceQuery({ t: t || undefined });
  };

  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of matches) if (m.tournament) seen.set(m.tournament.id, m.tournament.name);
    return [...seen];
  }, [matches]);
  const hasFriendlies = matches.some((m) => !m.tournament);

  const rows = useMemo(
    () =>
      matches
        .filter((m) => !tournament || (tournament === FRIENDLIES ? !m.tournament : m.tournament?.id === tournament))
        .map((m) => ({ ...m, side: sideOf(m), state: replayMatch(m.events, { rules: rulesFor(m.match.modality), first_server: m.match.first_server }) }))
        .reverse(),
    [matches, tournament, sideOf],
  );
  const nameOf = useMemo(() => athleteNameResolver(season.athletes, season.aliases), [season]);
  const wins = rows.filter((r) => r.side && r.state.winner === r.side).length;
  const losses = rows.filter((r) => r.side && r.state.winner && r.state.winner !== r.side).length;

  return (
    <Card title="Partidas" note={`${rows.length} ${rows.length === 1 ? "jogo" : "jogos"} · ${wins} V · ${losses} D`}>
      {showFilter && (options.length > 1 || (options.length > 0 && hasFriendlies)) && (
        <select
          value={tournament}
          onChange={(e) => setTournament(e.target.value)}
          aria-label="Filtrar partidas por torneio"
          data-print="hide"
          className="min-h-12 min-w-0 rounded-xl border-2 border-zinc-700 bg-zinc-950 px-3"
        >
          <option value="">Todos os torneios</option>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          {hasFriendlies && <option value={FRIENDLIES}>Amistosos</option>}
        </select>
      )}
      <ul className="flex flex-col gap-1">
        {rows.map(({ match, tournament: t, phase, state, side }) => {
          const score = state.sets
            .filter((s) => s.score.A + s.score.B > 0)
            .map((s) => (side === "B" ? `${s.score.B}×${s.score.A}` : `${s.score.A}×${s.score.B}`))
            .join(" · ");
          const result = !state.winner || !side ? null : state.winner === side ? "V" : "D";
          return (
            <li key={match.id} className="relative flex min-h-14 items-center gap-3 rounded-xl px-2 py-1 odd:bg-zinc-950/40">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                  result === "V" ? "bg-emerald-700 text-white" : result === "D" ? "bg-red-900 text-red-100" : "bg-zinc-800 text-zinc-400"
                }`}
                title={result === "V" ? "Vitória" : result === "D" ? "Derrota" : "Em andamento"}
              >
                {result ?? "–"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 flex-col font-semibold leading-snug">
                  <TeamNames side={match.team_a} nameOf={nameOf} aliases={season.aliases} className={side === "A" ? "text-amber-200" : ""} />
                  <span className="flex min-w-0 gap-1.5">
                    <span className="shrink-0 text-zinc-500">×</span>
                    <TeamNames side={match.team_b} nameOf={nameOf} aliases={season.aliases} className={side === "B" ? "text-amber-200" : ""} />
                  </span>
                </span>
                <span className="truncate text-xs text-zinc-400">
                  {dateFormat.format(match.created_at)} · {t ? `${t.name}${phase ? ` · ${PHASE_LABEL[phase]}` : ""}` : "Amistoso"}
                </span>
              </span>
              {staff ? (
                <span className="shrink-0 text-sm tabular-nums text-zinc-300">{score || "sem pontos"}</span>
              ) : (
                <HardLink
                  href={`/match?id=${encodeURIComponent(match.id)}`}
                  aria-label={`Abrir ${match.team_a.name} × ${match.team_b.name}`}
                  className="shrink-0 text-sm tabular-nums text-zinc-300 after:absolute after:inset-0 after:rounded-xl"
                >
                  {score || "sem pontos"}
                </HardLink>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
