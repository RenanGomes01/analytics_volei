"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { competitionCsvFilename, competitionToCsv } from "@/domain/export/competition-csv";
import { pairKey } from "@/domain/roster/identity";
import type { AthleteAggregate, TeamAggregate } from "@/domain/stats/aggregate";
import { rankAthletes, rankingSpecs, type RankingSpec } from "@/domain/stats/rankings";
import { deliverFile } from "@/features/export/deliver-file";
import { useRosterData, type RosterData } from "@/features/roster/use-roster-data";
import { secondaryButton } from "@/features/setup/form-styles";
import { pct } from "@/features/stats/format";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { addMatchToTournament, removeMatchFromTournament } from "@/services/tournament-service";
import { useCompetitionData, type CompetitionData } from "./use-competition-data";

type Tab = "ranking" | "teams" | "athletes" | "matches";
const TABS: [Tab, string][] = [
  ["ranking", "Ranking"],
  ["teams", "Duplas"],
  ["athletes", "Atletas"],
  ["matches", "Partidas"],
];

const brDate = (iso: string) => iso.split("-").reverse().join("/");

function useNames(roster: RosterData, stats: CompetitionData["stats"]) {
  const athleteName = (id: string) => roster.athleteById.get(id)?.name ?? id.slice(0, 6);
  const teamName = (key: string) => roster.teamByKey.get(key)?.name ?? stats.teams[key]?.name ?? key;
  return { athleteName, teamName };
}

function formatRanking(spec: RankingSpec, a: AthleteAggregate, value: number): { main: string; detail: string } {
  switch (spec.metric) {
    case "attack":
      return { main: pct(value), detail: `${a.attack.kills}-${a.attack.errors}/${a.attack.attempts}` };
    case "reception":
      return { main: pct(value), detail: `${a.reception.positive.num}/${a.reception.attempts}` };
    case "aces":
      return { main: String(value), detail: `${a.serve.attempts} saques` };
    default:
      return { main: String(value), detail: `${a.matches} ${a.matches === 1 ? "jogo" : "jogos"}` };
  }
}

function RankingCards({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const { athleteName } = useNames(roster, data.stats);
  const athletes = Object.values(data.stats.athletes);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rankingSpecs(data.tournament.modality).map((spec) => {
        const rows = rankAthletes(athletes, spec, { nameOf: athleteName });
        return (
          <section key={spec.metric} className="rounded-2xl bg-zinc-900 p-4">
            <h3 className="font-bold">{spec.label}</h3>
            {spec.min > 0 && <p className="text-xs text-zinc-500">mín. {spec.min} {spec.metric === "attack" ? "ataques" : "recepções"}</p>}
            <ol className="mt-2 flex flex-col gap-1">
              {rows.map((row, i) => {
                const a = data.stats.athletes[row.athlete_id];
                const f = formatRanking(spec, a, row.value);
                return (
                  <li key={row.athlete_id} className="flex items-baseline gap-2 tabular-nums">
                    <span className="w-5 text-right text-zinc-500">{i + 1}</span>
                    <span className="flex-1 truncate">{athleteName(row.athlete_id)}</span>
                    <span className="font-bold">{f.main}</span>
                    <span className="w-20 text-right text-xs text-zinc-500">{f.detail}</span>
                  </li>
                );
              })}
              {rows.length === 0 && <li className="text-sm text-zinc-500">Ainda sem dados suficientes.</li>}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function TeamsTable({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const { teamName } = useNames(roster, data.stats);
  const teams = Object.values(data.stats.teams).sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.points_for - b.points_against - (a.points_for - a.points_against),
  );
  const cols: [string, string, (t: TeamAggregate) => string | number][] = [
    ["J", "Jogos", (t) => t.matches],
    ["V-D", "Vitórias e derrotas", (t) => `${t.wins}-${t.losses}`],
    ["Sets", "Sets vencidos e perdidos", (t) => `${t.sets_won}-${t.sets_lost}`],
    ["Pts ±", "Saldo de pontos", (t) => t.points_for - t.points_against],
    ["Virada", "Virada de bola (K1)", (t) => pct(t.side_out)],
    ["Quebra", "Quebra de saque (K2)", (t) => pct(t.break_point)],
    ["Efic.", "Eficiência de ataque", (t) => pct(t.attack.efficiency)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-right tabular-nums">
        <thead>
          <tr className="text-xs uppercase text-zinc-400">
            <th className="py-2 text-left">{data.tournament.modality === "beach" ? "Dupla" : "Time"}</th>
            {cols.map(([label, title]) => (
              <th key={label} title={title} className="px-2 py-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.pair_key} className="odd:bg-zinc-900/60">
              <th scope="row" className="py-2.5 text-left font-medium">
                {teamName(t.pair_key)}
              </th>
              {cols.map(([label, , value]) => (
                <td key={label} className="px-2 py-2.5">
                  {value(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AthletesTable({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const { athleteName } = useNames(roster, data.stats);
  const beach = data.tournament.modality === "beach";
  const athletes = Object.values(data.stats.athletes).sort((a, b) => b.points - a.points || athleteName(a.athlete_id).localeCompare(athleteName(b.athlete_id)));
  const cols: [string, string, (a: AthleteAggregate) => string | number][] = [
    ["J", "Jogos", (a) => a.matches],
    ["Pts", "Pontos (ataques + aces + bloqueios)", (a) => a.points],
    ["PA", "Pontos de ataque", (a) => a.attack.kills],
    ["E", "Erros de ataque", (a) => a.attack.errors],
    ["TA", "Total de ataques", (a) => a.attack.attempts],
    ["Efic.", "Eficiência de ataque: (PA − E) / TA, somando todos os jogos", (a) => pct(a.attack.efficiency)],
    ["Ace", "Aces", (a) => a.serve.aces],
    ["ES", "Erros de saque", (a) => a.serve.errors],
    ["Rec", "Recepções", (a) => a.reception.attempts],
    [beach ? "Na mão" : "#+", beach ? "Passes na mão" : "Recepções # e +", (a) => pct(a.reception.positive)],
    ["Blq", "Pontos de bloqueio", (a) => a.blocks],
    ["Def", "Defesas", (a) => a.digs],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-right tabular-nums">
        <thead>
          <tr className="text-xs uppercase text-zinc-400">
            <th className="sticky left-0 bg-zinc-950 py-2 text-left">Atleta</th>
            {cols.map(([label, title]) => (
              <th key={label} title={title} className="px-2 py-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => (
            <tr key={a.athlete_id} className="odd:bg-zinc-900/60">
              <th scope="row" className="sticky left-0 bg-inherit py-2.5 text-left font-medium">
                {athleteName(a.athlete_id)}
              </th>
              {cols.map(([label, , value]) => (
                <td key={label} className="px-2 py-2.5">
                  {value(a)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchesTab({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { teamName } = useNames(roster, data.stats);
  const candidates = roster.matches.filter((m) => m.modality === data.tournament.modality && !roster.tournamentOfMatch.has(m.id));

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setAdding("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {data.matches.map(({ match, state, entry_id }) => {
          const names = [match.team_a, match.team_b].map((t) => teamName(pairKey(t.athlete_ids, roster.aliases)));
          const score = state.sets.filter((s) => s.score.A + s.score.B > 0).map((s) => `${s.score.A}×${s.score.B}`).join(" · ");
          return (
            <li key={match.id} className="flex items-center gap-2 rounded-2xl bg-zinc-900 pr-2">
              <HardLink href={`/match?id=${encodeURIComponent(match.id)}`} className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4">
                <span className="truncate font-semibold">
                  {names[0]} × {names[1]}
                </span>
                <span className="text-sm text-zinc-400">
                  {score || "sem pontos"} · {state.winner ? `vitória ${names[state.winner === "A" ? 0 : 1]}` : "em andamento"}
                </span>
              </HardLink>
              <button type="button" onClick={() => run(() => removeMatchFromTournament(getDB(), LOCAL_TENANT_ID, entry_id))} className="min-h-12 rounded-xl px-3 text-sm text-zinc-400" title="Tirar a partida deste torneio (a partida não é apagada)">
                Remover
              </button>
            </li>
          );
        })}
        {data.matches.length === 0 && <li className="text-zinc-500">Nenhuma partida neste torneio ainda.</li>}
      </ul>

      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl border-2 border-dashed border-zinc-700 p-3">
          <select className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-zinc-700 bg-zinc-900 px-3" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Partida existente para adicionar">
            <option value="">Adicionar partida existente (sem torneio)…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.team_a.name} × {m.team_b.name} · {new Date(m.created_at).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
          <button type="button" disabled={!adding} className={secondaryButton} onClick={() => run(() => addMatchToTournament(getDB(), LOCAL_TENANT_ID, { tournament_id: data.tournament.id, match_id: adding }))}>
            Adicionar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
          {error}
        </p>
      )}
    </div>
  );
}

function Dashboard({ tournamentId }: { tournamentId: string }) {
  const roster = useRosterData();
  const data = useCompetitionData(tournamentId, roster?.aliases);
  const [tab, setTab] = useState<Tab>("ranking");

  if (data === null) return <p className="p-8 text-center">Torneio não encontrado neste aparelho.</p>;
  if (!data || !roster) return <p className="p-8 text-center text-zinc-400">Carregando torneio…</p>;

  const { tournament, stats } = data;
  const period = tournament.end_date ? `${brDate(tournament.start_date)}–${brDate(tournament.end_date)}` : brDate(tournament.start_date);

  async function exportCsv() {
    const csv = competitionToCsv({
      stats,
      tournament,
      athleteName: (id) => roster!.athleteById.get(id)?.name ?? id.slice(0, 6),
      athleteNumber: (id) => roster!.athleteById.get(id)?.jersey_number ?? null,
      teamName: (key) => roster!.teamByKey.get(key)?.name ?? stats.teams[key]?.name ?? key,
    });
    await deliverFile(csv, competitionCsvFilename(tournament), "text/csv;charset=utf-8");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-zinc-400">
            {[tournament.location, period, tournament.modality === "beach" ? "Beach" : "Indoor"].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm tabular-nums">
            {stats.totals.matches} jogos ({stats.totals.finished} encerrados) · {stats.totals.sets} sets · {stats.totals.rallies} ralis
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="min-h-12 rounded-xl bg-emerald-200 px-4 font-semibold text-emerald-950">
            ⇩ CSV
          </button>
          <HardLink href={`/new?tournament=${encodeURIComponent(tournament.id)}`} className="min-h-12 rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950">
            + Partida
          </HardLink>
        </div>
      </header>

      <nav role="tablist" className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-12 flex-1 rounded-xl font-semibold ${tab === id ? "bg-amber-400 text-zinc-950" : "text-zinc-300"}`}
          >
            {label === "Duplas" && tournament.modality === "indoor" ? "Times" : label}
          </button>
        ))}
      </nav>

      {tab === "ranking" && <RankingCards data={data} roster={roster} />}
      {tab === "teams" && <TeamsTable data={data} roster={roster} />}
      {tab === "athletes" && <AthletesTable data={data} roster={roster} />}
      {tab === "matches" && <MatchesTab data={data} roster={roster} />}
    </div>
  );
}

/** Dashboard da etapa (`/tournament?id=…`): rota estática pré-cacheada, o id é lido no cliente. */
export function TournamentDashboard() {
  const id = useSearchParams().get("id") ?? "";
  if (!id) return <p className="p-8 text-center">Nenhum torneio selecionado.</p>;
  return <Dashboard key={id} tournamentId={id} />;
}
