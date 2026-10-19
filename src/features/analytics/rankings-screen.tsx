"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { competitionToCsv } from "@/domain/export/competition-csv";
import type { PhaseFilter, TournamentCategory } from "@/domain/roster/types";
import { rankAthletes, rankingSpecs } from "@/domain/stats/rankings";
import {
  athletesByGender,
  availableYears,
  filterSeason,
  pointKinds,
  seasonStats,
  teamsByGender,
  type GenderFilter,
} from "@/domain/stats/season";
import { rankTeams, TEAM_RANKINGS } from "@/domain/stats/team-rankings";
import { PointKindsChart } from "@/features/charts/point-kinds-chart";
import { PointsMixChart } from "@/features/charts/points-mix-chart";
import { pct } from "@/features/charts/palette";
import { deliverFile } from "@/features/export/deliver-file";
import { EmptyState } from "@/components/empty-state";
import { buildAnalytics } from "@/domain/stats/facts";
import { ConcededCard } from "@/features/analytics/drill/conceded-card";
import { matchTitles, OccurrencesSheet } from "@/features/analytics/drill/occurrences-sheet";
import { rallyOccurrences, type Occurrence } from "@/domain/stats/occurrences";
import { PrintButton } from "@/features/print/print-button";
import { PrintHeader } from "@/features/print/print-header";
import { ReportBuilder } from "./report-builder";
import { athleteHref, Card, EntityLink, Segmented, teamHref } from "./ui";
import { replaceQuery, useSeasonData } from "./use-season-data";

type View = "athletes" | "teams";
type Mode = "highlights" | "builder";
type Category = TournamentCategory | "all";

const GENDERS: [GenderFilter, string][] = [["all", "Todos"], ["F", "Feminino"], ["M", "Masculino"]];
const CATEGORIES: [Category, string][] = [["all", "Todas as etapas"], ["F", "Feminino"], ["M", "Masculino"], ["Mixed", "Misto"], ["Open", "Aberto"]];

/** Central global: ranking anual somando todos os torneios do aparelho (soma de contadores, nunca média). */
export function RankingsScreen() {
  const params = useSearchParams();
  const season = useSeasonData();
  const [view, setView] = useState<View>(params.get("view") === "teams" ? "teams" : "athletes");
  const [mode, setMode] = useState<Mode>(params.get("mode") === "builder" ? "builder" : "highlights");
  const [gender, setGender] = useState<GenderFilter>((params.get("gender") as GenderFilter) || "all");
  const [category, setCategory] = useState<Category>((params.get("category") as Category) || "all");
  const [friendlies, setFriendlies] = useState(params.get("friendlies") === "1");
  const [phase, setPhase] = useState<PhaseFilter>(params.get("phase") === "group" || params.get("phase") === "knockout" ? (params.get("phase") as PhaseFilter) : "all");
  const [yearParam, setYear] = useState<number | null>(params.get("year") ? Number(params.get("year")) : null);
  /** Lances de uma causa de "Pontos cedidos", por jogo e placar (Fase 19). */
  const [sheet, setSheet] = useState<{ title: string; occurrences: Occurrence[] } | null>(null);

  const years = useMemo(() => (season ? availableYears(season.matches) : []), [season]);
  const year = yearParam && years.includes(yearParam) ? yearParam : (years.find((y) => y === new Date().getFullYear()) ?? years[0]);

  const computed = useMemo(() => {
    if (!season || year === undefined) return null;
    const matches = filterSeason(season.matches, { year, category, includeFriendlies: friendlies, phase });
    const stats = seasonStats(matches, season.aliases);
    // Lances com contexto (drill-down, construtor e fontes de erro): uma passada pelo recorte.
    const analytics = buildAnalytics(
      matches.map((m) => ({ match: m.match, events: m.events, tournament_id: m.tournament?.id ?? null })),
      season.aliases,
    );
    const facts = analytics.touches;
    return {
      matches,
      stats,
      facts,
      rallies: analytics.rallies,
      athletes: athletesByGender(stats, season.athletes, gender),
      teams: teamsByGender(stats, season.athletes, gender),
      kinds: pointKinds(matches, season.aliases),
    };
  }, [season, year, category, friendlies, gender, phase]);
  const titles = useMemo(() => matchTitles(computed?.matches ?? []), [computed]);

  if (!season) return <p className="p-8 text-center text-zinc-400">Carregando temporada…</p>;
  if (year === undefined || !computed) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <h1 className="mb-4 text-2xl font-bold">Rankings</h1>
        <EmptyState icon="🏆" title="Ainda não temos partidas e por isso não há ranking." primary={{ label: "+ Iniciar nova partida", href: "/new" }}>
          Inicie um jogo para gerar estatísticas. Cada partida scouteada entra aqui automaticamente.
        </EmptyState>
      </div>
    );
  }

  const update = (patch: Record<string, string | undefined>) => replaceQuery(patch);
  const empty = computed.stats.totals.rallies === 0;
  // Partidas do ano que só aparecem com amistosos (o padrão é deixá-los de fora).
  const onlyFriendlies =
    empty && !friendlies && seasonStats(filterSeason(season.matches, { year, category, includeFriendlies: true, phase }), season.aliases).totals.rallies > 0;
  const clearFilters = () => {
    setGender("all");
    setCategory("all");
    setPhase("all");
    setFriendlies(true);
    update({ gender: undefined, category: undefined, phase: undefined, friendlies: "1" });
  };
  const { athleteName, teamName } = season;
  const missing = view === "athletes" ? computed.athletes.missingGender : computed.teams.missingGender;
  const unit = view === "athletes" ? "atletas" : "duplas";
  const missingLabel = view === "athletes" ? (missing === 1 ? "atleta" : "atletas") : missing === 1 ? "dupla" : "duplas";

  async function exportCsv() {
    const label = `Temporada ${year}${gender !== "all" ? ` · ${gender === "F" ? "Feminino" : "Masculino"}` : ""}`;
    const csv = competitionToCsv({
      stats: {
        ...computed!.stats,
        athletes: Object.fromEntries(computed!.athletes.included.map((a) => [a.athlete_id, a])),
        teams: Object.fromEntries(computed!.teams.included.map((t) => [t.pair_key, t])),
      },
      tournament: { id: "season", tenant_id: "", name: label, start_date: `${year}-01-01`, end_date: `${year}-12-31`, modality: "beach", created_at: 0 },
      athleteName,
      athleteNumber: (id) => season!.athletes.get(id)?.jersey_number ?? null,
      teamName,
    });
    await deliverFile(csv, `ranking_${year}${gender !== "all" ? `_${gender}` : ""}.csv`, "text/csv;charset=utf-8");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Rankings {year}</h1>
        </div>
        <div className="flex gap-2" data-print="hide">
          <PrintButton />
          <button type="button" onClick={exportCsv} className="min-h-12 rounded-xl bg-emerald-200 px-4 font-semibold text-emerald-950">
            ⇩ CSV
          </button>
        </div>
      </header>
      <PrintHeader
        subtitle={[mode === "builder" ? "Construtor de relatórios" : "Destaques", view === "teams" ? "Duplas" : "Atletas", GENDERS.find(([g]) => g === gender)?.[1], CATEGORIES.find(([c]) => c === category)?.[1], phase !== "all" ? `fase: ${phase}` : null, friendlies ? "com amistosos" : null]
          .filter(Boolean)
          .join(" · ")}
      />

      <Segmented
        label="Modo"
        value={mode}
        options={[["highlights", "🏆 Destaques"], ["builder", "🧮 Construtor de relatórios"]]}
        onChange={(v) => {
          setMode(v);
          update({ mode: v === "builder" ? "builder" : undefined });
        }}
      />

      <div className="grid gap-2 md:grid-cols-2" data-print="hide">
        <Segmented
          label="Ano"
          value={String(year)}
          options={years.map((y) => [String(y), String(y)])}
          onChange={(v) => {
            setYear(Number(v));
            update({ year: v });
          }}
        />
        <Segmented
          label="Visão"
          value={view}
          options={[["athletes", "Atletas (individual)"], ["teams", "Duplas"]]}
          onChange={(v) => {
            setView(v);
            update({ view: v });
          }}
        />
        <Segmented
          label="Gênero"
          value={gender}
          options={GENDERS}
          onChange={(v) => {
            setGender(v);
            update({ gender: v === "all" ? undefined : v });
          }}
        />
        <Segmented
          label="Fase"
          value={phase}
          options={[["all", "Todas as fases"], ["group", "Grupos"], ["knockout", "Mata-mata"]]}
          onChange={(v) => {
            setPhase(v);
            update({ phase: v === "all" ? undefined : v });
          }}
        />
        <div className="flex gap-2">
          <select
            aria-label="Categoria da etapa"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              update({ category: e.target.value === "all" ? undefined : e.target.value });
            }}
            className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-zinc-800 bg-zinc-900 px-3"
          >
            {CATEGORIES.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-zinc-900 px-3 text-sm">
            <input
              type="checkbox"
              checked={friendlies}
              onChange={(e) => {
                setFriendlies(e.target.checked);
                update({ friendlies: e.target.checked ? "1" : undefined });
              }}
              className="size-5"
            />
            Incluir amistosos
          </label>
        </div>
      </div>

      <p className="text-sm text-zinc-400">
        {computed.stats.totals.matches} jogos · {computed.stats.totals.rallies} ralis
        {missing > 0 && <span className="text-amber-300"> · {missing} {missingLabel} fora do recorte por falta de gênero no cadastro</span>}
      </p>

      {empty && (
        <EmptyState
          icon="🔎"
          title={onlyFriendlies ? "Neste recorte só há amistosos." : "Nenhum lance neste recorte."}
          primary={
            onlyFriendlies
              ? {
                  label: "Incluir amistosos",
                  onClick: () => {
                    setFriendlies(true);
                    update({ friendlies: "1" });
                  },
                }
              : { label: "Ver tudo (limpar filtros)", onClick: clearFilters }
          }
          secondary={{ label: "+ Nova partida", href: "/new" }}
        >
          {onlyFriendlies ? "Por padrão o ranking considera só jogos de torneio." : "Mude o ano ou os filtros acima, ou scouteie uma partida."}
        </EmptyState>
      )}

      {empty ? null : mode === "builder" ? (
        <ReportBuilder
          view={view}
          athletes={computed.athletes.included}
          teams={computed.teams.included}
          facts={computed.facts}
          athleteName={athleteName}
          teamName={teamName}
          matchLabel={(id) => {
            const m = computed.matches.find((x) => x.match.id === id)?.match;
            return m ? `${m.team_a.name} × ${m.team_b.name}` : id.slice(0, 6);
          }}
        />
      ) : view === "athletes" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rankingSpecs("beach")
            // Passe na mão só quando há recepções avaliadas no recorte (o modo rápido não avalia o passe).
            .filter((spec) => spec.metric !== "reception" || computed.athletes.included.some((a) => a.reception.positive.den > 0))
            .map((spec) => {
            const rows = rankAthletes(computed.athletes.included, spec, { nameOf: athleteName });
            return (
              <Card key={spec.metric} title={spec.label} note={spec.min ? `mín. ${spec.min} ${spec.metric === "attack" ? "ataques" : "recepções avaliadas"}` : undefined}>
                <ol className="flex flex-col gap-1">
                  {rows.map((r, i) => {
                    const a = computed.stats.athletes[r.athlete_id];
                    const value = spec.kind === "rate" ? pct(r.value) : r.value;
                    const detail =
                      spec.metric === "attack" ? `${a.attack.kills}-${a.attack.errors}/${a.attack.attempts}`
                      : spec.metric === "reception" ? `${a.reception.positive.num}/${a.reception.positive.den}`
                      : `${a.matches} jogos`;
                    return (
                      <li key={r.athlete_id} className="flex items-baseline gap-2 tabular-nums">
                        <span className="w-5 text-right text-zinc-500">{i + 1}</span>
                        <span className="flex-1 truncate">
                          <EntityLink href={athleteHref(r.athlete_id)}>{athleteName(r.athlete_id)}</EntityLink>
                        </span>
                        <span className="font-bold">{value}</span>
                        <span className="w-20 text-right text-xs text-zinc-500">{detail}</span>
                      </li>
                    );
                  })}
                  {rows.length === 0 && <li className="text-sm text-zinc-500">Ainda sem dados suficientes.</li>}
                </ol>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM_RANKINGS.map((spec) => {
            const rows = rankTeams(computed.teams.included, spec, { nameOf: teamName });
            return (
              <Card key={spec.metric} title={spec.label} note={spec.minLabel}>
                <ol className="flex flex-col gap-1">
                  {rows.map((r, i) => {
                    const t = computed.stats.teams[r.pair_key];
                    const value = spec.kind === "rate" ? pct(r.value) : spec.kind === "diff" && r.value > 0 ? `+${r.value}` : r.value;
                    const detail =
                      spec.metric === "side_out" ? `${t.side_out.num}/${t.side_out.den}`
                      : spec.metric === "break_point" ? `${t.break_point.num}/${t.break_point.den}`
                      : `${t.wins}-${t.losses}`;
                    return (
                      <li key={r.pair_key} className="flex items-baseline gap-2 tabular-nums">
                        <span className="w-5 text-right text-zinc-500">{i + 1}</span>
                        <span className="flex-1 truncate">
                          <EntityLink href={teamHref(r.pair_key)}>{teamName(r.pair_key)}</EntityLink>
                        </span>
                        <span className="font-bold">{value}</span>
                        <span className="w-16 text-right text-xs text-zinc-500">{detail}</span>
                      </li>
                    );
                  })}
                  {rows.length === 0 && <li className="text-sm text-zinc-500">Ainda sem dados suficientes.</li>}
                </ol>
              </Card>
            );
          })}
        </div>
      )}

      {!empty && mode === "highlights" && (
      <div className="grid gap-3 lg:grid-cols-2">
        <ConcededCard
          title="Pontos cedidos no recorte: de onde vieram"
          rallies={computed.rallies}
          nameOf={athleteName}
          onSelectRow={(row) => {
            const rallies = computed.rallies.filter((f) => f.code === row.key);
            setSheet({ title: rallies[0]?.conceded ?? row.label, occurrences: rallyOccurrences(rallies, "conceded") });
          }}
        />
        <Card title={`Distribuição dos pontos — top 10 ${unit}`} note="Ataque, ace e bloqueio (e erro do adversário, para duplas)">
          <PointsMixChart
            data={
              view === "athletes"
                ? [...computed.athletes.included]
                    .sort((a, b) => b.points - a.points)
                    .slice(0, 10)
                    .map((a) => ({ name: athleteName(a.athlete_id), kills: a.attack.kills, aces: a.serve.aces, blocks: a.blocks }))
                : [...computed.teams.included]
                    .sort((a, b) => b.points.total - a.points.total)
                    .slice(0, 10)
                    .map((t) => ({ name: teamName(t.pair_key), kills: t.points.kills, aces: t.points.aces, blocks: t.points.blocks, opponent_errors: t.points.opponent_errors }))
            }
          />
        </Card>
        <Card title="Como os pontos aconteceram" note="Todos os pontos das partidas do recorte (ano, etapa, amistosos)">
          <PointKindsChart data={computed.kinds} />
        </Card>
      </div>
      )}
      {sheet && (
        <OccurrencesSheet
          title={sheet.title}
          subtitle="Pontos cedidos no recorte"
          occurrences={sheet.occurrences}
          matchLabel={titles.label}
          matchRank={titles.rank}
          athleteLabel={athleteName}
          showActor
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
