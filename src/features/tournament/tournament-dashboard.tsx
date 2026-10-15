"use client";

import { athleteHref, EntityLink, teamHref } from "@/features/analytics/ui";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { TournamentEditSheet } from "./tournament-edit";
import { athleteColumns, tableColumns, teamColumns, type PlayerLine } from "@/domain/stats/stat-columns";
import { StatTable, type StatRow } from "@/features/stats/stat-table";
import { EmptyState } from "@/components/empty-state";
import { toast } from "@/features/toast/toast";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { competitionCsvFilename, competitionToCsv } from "@/domain/export/competition-csv";
import { pairKey } from "@/domain/roster/identity";
import { PHASE_LABEL, TOURNAMENT_PHASES, type PhaseFilter, type TournamentPhase } from "@/domain/roster/types";
import type { AthleteAggregate, TeamAggregate } from "@/domain/stats/aggregate";
import { rankAthletes, rankingSpecs, type RankingSpec } from "@/domain/stats/rankings";
import { deliverFile } from "@/features/export/deliver-file";
import { useRosterData, type RosterData } from "@/features/roster/use-roster-data";
import { secondaryButton } from "@/features/setup/form-styles";
import { pct } from "@/features/stats/format";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { addMatchToTournament, removeMatchFromTournament, setMatchPhase } from "@/services/tournament-service";
import { useCompetitionData, type CompetitionData } from "./use-competition-data";
import { TournamentReport } from "./tournament-report";
import { factsIn } from "@/domain/stats/drill";
import { PrintButton } from "@/features/print/print-button";
import { PrintHeader } from "@/features/print/print-header";
import { StaffHidden } from "@/features/staff/staff-hidden";
import { useStaffMode } from "@/features/staff/staff-mode";

type Tab = "report" | "ranking" | "teams" | "athletes" | "matches";
const TABS: [Tab, string][] = [
  ["report", "Relatório"],
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
  // Passe na mão só com recepções avaliadas no recorte (o modo rápido não avalia o passe).
  const rated = athletes.some((a) => a.reception.positive.den > 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rankingSpecs(data.tournament.modality).filter((spec) => spec.metric !== "reception" || rated).map((spec) => {
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
                    <span className="flex-1 truncate">
                      <EntityLink href={athleteHref(row.athlete_id)}>{athleteName(row.athlete_id)}</EntityLink>
                    </span>
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

function TeamsTable({ data, roster, detailed }: { data: CompetitionData; roster: RosterData; detailed: boolean }) {
  const { teamName } = useNames(roster, data.stats);
  const teams = Object.values(data.stats.teams).sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.points_for - b.points_against - (a.points_for - a.points_against),
  );
  const showReception = teams.some((t) => t.reception.positive.den > 0);
  const rows: StatRow<TeamAggregate>[] = teams.map((t) => ({
    key: t.pair_key,
    name: teamName(t.pair_key),
    line: t,
    label: <EntityLink href={teamHref(t.pair_key)}>{teamName(t.pair_key)}</EntityLink>,
  }));
  return (
    <StatTable
      firstHeader={data.tournament.modality === "beach" ? "Dupla" : "Time"}
      columns={tableColumns(teamColumns({ modality: data.tournament.modality, showReception }), { detailed })}
      rows={rows}
      minWidth={detailed ? 1600 : 1000}
      drill={(row) => ({ facts: factsIn(data.facts, { pair_key: row.key }), matchLabel: matchLabelOf(data), athleteLabel: (id) => roster.athleteById.get(id)?.name ?? id.slice(0, 6) })}
    />
  );
}

/** Rótulo da partida no drill-down: "Dupla A × Dupla B". */
function matchLabelOf(data: CompetitionData) {
  const byId = new Map(data.matches.map((m) => [m.match.id, m.match]));
  return (id: string) => {
    const m = byId.get(id);
    return m ? `${m.team_a.name} × ${m.team_b.name}` : id.slice(0, 6);
  };
}

function AthletesTable({ data, roster, detailed }: { data: CompetitionData; roster: RosterData; detailed: boolean }) {
  const { athleteName } = useNames(roster, data.stats);
  const athletes = Object.values(data.stats.athletes).sort((a, b) => b.points - a.points || athleteName(a.athlete_id).localeCompare(athleteName(b.athlete_id)));
  // Passe na mão só com recepções avaliadas (o modo rápido não avalia o passe).
  const showReception = athletes.some((a) => a.reception.positive.den > 0);
  const rows: StatRow<PlayerLine>[] = athletes.map((a) => ({
    key: a.athlete_id,
    name: athleteName(a.athlete_id),
    line: a,
    label: <EntityLink href={athleteHref(a.athlete_id)}>{athleteName(a.athlete_id)}</EntityLink>,
  }));
  return (
    <StatTable
      firstHeader="Atleta"
      columns={tableColumns(athleteColumns({ modality: data.tournament.modality, aggregated: true, showReception }), { detailed })}
      rows={rows}
      minWidth={detailed ? 2400 : 1000}
      drill={(row) => ({ facts: factsIn(data.facts, { athlete_id: row.key }), matchLabel: matchLabelOf(data), athleteLabel: athleteName, defaultDimension: "match" })}
    />
  );
}

function MatchesTab({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { teamName } = useNames(roster, data.stats);
  const candidates = roster.matches.filter((m) => m.modality === data.tournament.modality && !roster.tournamentOfMatch.has(m.id));

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      toast.success(done);
      setAdding("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {data.matches.map(({ match, state, entry_id, phase }) => {
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
              <select
                value={phase ?? ""}
                onChange={(e) =>
                  run(
                    () => setMatchPhase(getDB(), LOCAL_TENANT_ID, entry_id, (e.target.value || null) as TournamentPhase | null),
                    e.target.value ? `Fase: ${PHASE_LABEL[e.target.value as TournamentPhase]}.` : "Fase removida.",
                  )
                }
                aria-label="Fase da partida"
                className="min-h-12 max-w-40 rounded-xl border-2 border-zinc-700 bg-zinc-950 px-2 text-sm"
              >
                <option value="">Fase não informada</option>
                {TOURNAMENT_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABEL[p]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => run(() => removeMatchFromTournament(getDB(), LOCAL_TENANT_ID, entry_id), "Partida tirada do torneio (virou amistoso).")} className="min-h-12 rounded-xl px-3 text-sm text-zinc-400" title="Tirar a partida deste torneio (a partida não é apagada)">
                Remover
              </button>
            </li>
          );
        })}
        {data.matches.length === 0 && (
          <li>
            <EmptyState
              icon="📋"
              title="Nenhuma partida neste torneio ainda."
              primary={{ label: "+ Partida neste torneio", href: `/new?tournament=${encodeURIComponent(data.tournament.id)}` }}
            >
              {candidates.length > 0 ? "Ou adicione uma partida já scouteada, logo abaixo." : undefined}
            </EmptyState>
          </li>
        )}
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
          <button type="button" disabled={!adding} className={secondaryButton} onClick={() => run(() => addMatchToTournament(getDB(), LOCAL_TENANT_ID, { tournament_id: data.tournament.id, match_id: adding }), "Partida adicionada ao torneio.")}>
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
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const data = useCompetitionData(tournamentId, roster?.aliases, phase);
  const params = useSearchParams();
  const staff = useStaffMode();
  const [tab, setTab] = useState<Tab>(() => (TABS.some(([t]) => t === params.get("tab")) ? (params.get("tab") as Tab) : "report"));
  const [editing, setEditing] = useState(false);
  const [detailed, setDetailed] = useState(false);

  if (data === null) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p>Torneio não encontrado neste aparelho (foi excluído?).</p>
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-5 py-3 font-semibold">
          Voltar ao início
        </HardLink>
      </div>
    );
  }
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
        <div className="flex flex-wrap gap-2" data-print="hide">
          <StaffHidden>
            <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-xl bg-zinc-800 px-4 font-semibold">
              Editar
            </button>
          </StaffHidden>
          <PrintButton />
          <button type="button" onClick={exportCsv} className="min-h-12 rounded-xl bg-emerald-200 px-4 font-semibold text-emerald-950">
            ⇩ CSV
          </button>
          <StaffHidden>
            <HardLink href={`/new?tournament=${encodeURIComponent(tournament.id)}`} className="min-h-12 rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950">
              + Partida
            </HardLink>
          </StaffHidden>
        </div>
      </header>
      {editing && <TournamentEditSheet tournament={tournament} matches={data.matches.length} onClose={() => setEditing(false)} />}

      <PrintHeader subtitle={`${TABS.find(([t]) => t === tab)?.[1] ?? ""}${phase !== "all" ? ` · fase: ${phase}` : ""}`} />
      <nav role="tablist" data-print="hide" className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
        {TABS.filter(([id]) => !staff || id !== "matches").map(([id, label]) => (
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

      {tab !== "matches" && (
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <label htmlFor="phase-filter" className="text-sm text-zinc-400">
            Fase:
          </label>
          <select
            id="phase-filter"
            value={phase}
            onChange={(e) => setPhase(e.target.value as PhaseFilter)}
            className="min-h-12 rounded-xl border-2 border-zinc-700 bg-zinc-900 px-3"
          >
            <option value="all">Todas as partidas</option>
            <option value="group">Fase de grupos</option>
            <option value="knockout">Mata-mata (oitavas → final)</option>
            {TOURNAMENT_PHASES.filter((p) => p !== "group").map((p) => (
              <option key={p} value={p}>
                Só {PHASE_LABEL[p].toLowerCase()}
              </option>
            ))}
          </select>
          {phase !== "all" && data.matches.some((m) => !m.phase) && (
            <span className="text-sm text-amber-300">Partidas sem fase ficam fora: classifique na aba Partidas.</span>
          )}
        </div>
      )}

      {(tab === "teams" || tab === "athletes") && (
        <label className="flex min-h-11 items-center gap-2 self-start text-sm text-zinc-300" data-print="hide">
          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} className="size-5" />
          Ver todas as métricas (toque num número para detalhar)
        </label>
      )}
      {tab === "report" && <TournamentReport data={data} roster={roster} />}
      {tab === "ranking" && <RankingCards data={data} roster={roster} />}
      {tab === "teams" && <TeamsTable data={data} roster={roster} detailed={detailed} />}
      {tab === "athletes" && <AthletesTable data={data} roster={roster} detailed={detailed} />}
      {tab === "matches" && !staff && <MatchesTab data={data} roster={roster} />}
    </div>
  );
}

/** Dashboard da etapa (`/tournament?id=…`): rota estática pré-cacheada, o id é lido no cliente. */
export function TournamentDashboard() {
  const id = useSearchParams().get("id") ?? "";
  if (!id) return <p className="p-8 text-center">Nenhum torneio selecionado.</p>;
  return <Dashboard key={id} tournamentId={id} />;
}
