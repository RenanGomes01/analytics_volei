"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { resolveAthlete } from "@/domain/roster/identity";
import type { PhaseFilter } from "@/domain/roster/types";
import {
  athleteByCompetition,
  athletePartners,
  athleteSeries,
  availableYears,
  filterSeason,
  seasonStats,
} from "@/domain/stats/season";
import { pct } from "@/features/charts/palette";
import { TrendChart } from "@/features/charts/trend-chart";
import {
  athleteHref,
  Card,
  EntityLink,
  Segmented,
  Stat,
  teamHref,
} from "./ui";
import { EmptyState } from "@/components/empty-state";
import { athleteColumns, tableColumns } from "@/domain/stats/stat-columns";
import { formatStat, StatTable } from "@/features/stats/stat-table";
import { DrillPanel } from "./drill/drill-panel";
import type { TrendPoint } from "@/features/charts/trend-chart";
import { replaceQuery, useSeasonData } from "./use-season-data";
import { scoredBreakdown } from "@/domain/stats/drill";
import { buildAnalytics } from "@/domain/stats/facts";
import { explainEfficiency, explainPass } from "@/features/stats/explain";
import { ConcededCard } from "./drill/conceded-card";
import { PointSourcesCard } from "./drill/point-sources-card";
import { PrintButton } from "@/features/print/print-button";
import { PrintHeader } from "@/features/print/print-header";
import { ProfileMatches } from "./profile-matches";
import type { SeasonMatch } from "@/domain/stats/season";

const MIN_ATTACKS = 10;
const MIN_RECEPTIONS = 10;

/** Perfil do atleta: atravessa parcerias (no vôlei de praia a dupla muda; o atleta não). */
export function AthleteProfile() {
  const params = useSearchParams();
  const season = useSeasonData();
  const requested = params.get("id") ?? "";
  const id = season ? resolveAthlete(season.aliases, requested) : requested;
  const [yearParam, setYear] = useState<string>(params.get("year") ?? "all");
  const [phase, setPhase] = useState<PhaseFilter>(
    params.get("phase") === "group" || params.get("phase") === "knockout" ? (params.get("phase") as PhaseFilter) : "all",
  );

  // Um cadastro antigo (alias) abre o perfil do atleta canônico.
  useEffect(() => {
    if (season && id !== requested) replaceQuery({ id });
  }, [season, id, requested]);

  const years = useMemo(
    () => (season ? availableYears(season.matches) : []),
    [season],
  );
  const computed = useMemo(() => {
    if (!season) return null;
    const scope = filterSeason(season.matches, {
      year: yearParam === "all" ? undefined : Number(yearParam),
      includeFriendlies: true,
      phase,
    });
    const mine = scope.filter(({ match }) =>
      [...match.team_a.athlete_ids, ...match.team_b.athlete_ids].some(
        (a) => resolveAthlete(season.aliases, a) === id,
      ),
    );
    // Lances dela com contexto: drill-down e fontes de erro (o mesmo cálculo da tabela).
    const analytics = buildAnalytics(
      mine.map((m) => ({ match: m.match, events: m.events, tournament_id: m.tournament?.id ?? null })),
      season.aliases,
    );
    const facts = analytics.touches.filter((f) => f.athlete_id === id);
    const conceded = analytics.rallies.filter((f) => f.culprit === id);
    return {
      mine,
      facts,
      conceded,
      me: seasonStats(mine, season.aliases).athletes[id],
      series: athleteSeries(mine, id, season.aliases),
      partners: athletePartners(mine, id, season.aliases),
      byCompetition: athleteByCompetition(mine, id, season.aliases),
    };
  }, [season, id, yearParam, phase]);
  const sideOf = useCallback(
    ({ match }: SeasonMatch) =>
      season && match.team_a.athlete_ids.some((a) => resolveAthlete(season.aliases, a) === id)
        ? ("A" as const)
        : season && match.team_b.athlete_ids.some((a) => resolveAthlete(season.aliases, a) === id)
          ? ("B" as const)
          : null,
    [season, id],
  );
  const [detailed, setDetailed] = useState(false);
  /** Ponto do gráfico por torneio aberto no detalhamento por partida. */
  const [trendDrill, setTrendDrill] = useState<{ point: TrendPoint; column: "atk_eff" | "rec_positive" } | null>(null);

  if (!season || !computed)
    return <p className="p-8 text-center text-zinc-400">Carregando atleta…</p>;
  const athlete = season.athletes.get(id);
  if (!athlete)
    return (
      <p className="p-8 text-center">Atleta não encontrada neste aparelho.</p>
    );

  const { me, series, partners, mine } = computed;
  const matchLabel = (mid: string) => {
    const m = mine.find((x) => x.match.id === mid);
    return m ? `${m.match.team_a.name} × ${m.match.team_b.name}${m.tournament ? "" : " (amistoso)"}` : mid.slice(0, 6);
  };
  /** Lances de um ponto da série: o torneio, ou os amistosos daquele mês. */
  const factsOfBucket = (key: string) => {
    if (!key.startsWith("amistosos:")) return computed.facts.filter((f) => f.tournament_id === key);
    const month = key.slice("amistosos:".length);
    const ids = new Set(mine.filter((m) => !m.tournament && new Date(m.match.created_at).toISOString().slice(0, 7) === month).map((m) => m.match.id));
    return computed.facts.filter((f) => ids.has(f.match_id));
  };
  const columnsAll = athleteColumns({ modality: mine[0]?.match.modality ?? "beach", aggregated: true, showReception: true });
  const wins = partners.reduce((s, p) => s + p.wins, 0);
  const losses = partners.reduce((s, p) => s + p.losses, 0);
  // Passe na mão só com recepções avaliadas (o modo rápido não avalia o passe).
  const showReception = !!me && me.reception.positive.den > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {athlete.jersey_number !== undefined && (
            <span className="mr-2 text-zinc-500">{athlete.jersey_number}</span>
          )}
          {athlete.name}
        </h1>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">
          {athlete.gender === "F"
            ? "Feminino"
            : athlete.gender === "M"
              ? "Masculino"
              : "Gênero não informado"}
        </span>
        <span className="ml-auto flex items-center gap-3" data-print="hide">
          <HardLink href="/rankings" className="text-sm text-zinc-400 underline">
            Rankings
          </HardLink>
          <PrintButton />
        </span>
      </header>
      <PrintHeader
        subtitle={`Perfil da atleta · ${yearParam === "all" ? "todas as temporadas" : `temporada ${yearParam}`}${phase !== "all" ? ` · fase: ${phase}` : ""}`}
      />
      <div className="flex flex-col gap-4" data-print="hide">

      <Segmented
        label="Temporada"
        value={yearParam}
        options={[
          ["all", "Todas"],
          ...years.map((y): [string, string] => [String(y), String(y)]),
        ]}
        onChange={(v) => {
          setYear(v);
          replaceQuery({ year: v === "all" ? undefined : v });
        }}
      />
      <Segmented
        label="Fase"
        value={phase}
        options={[
          ["all", "Todos os jogos"],
          ["group", "Grupos"],
          ["knockout", "Mata-mata"],
        ]}
        onChange={(v) => {
          setPhase(v);
          replaceQuery({ phase: v === "all" ? undefined : v });
        }}
      />
      </div>

      {!me ? (
        <EmptyState
          icon="🔎"
          title="Nenhuma partida neste recorte."
          primary={{ label: "+ Nova partida", href: "/new" }}
          secondary={
            yearParam !== "all" || phase !== "all"
              ? {
                  label: "Ver todos os jogos",
                  onClick: () => {
                    setYear("all");
                    setPhase("all");
                    replaceQuery({ year: undefined, phase: undefined });
                  },
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Jogos"
              value={me.matches}
              detail={`${wins} V · ${losses} D`}
            />
            <Stat
              label="Pontos"
              value={me.points}
              detail={`${me.attack.kills} ataque · ${me.serve.aces} ace · ${me.blocks} bloq.`}
            />
            <Stat
              label="Eficiência de ataque"
              value={pct(me.attack.efficiency)}
              detail={explainEfficiency(me.attack)}
            />
            {showReception ? (
              <Stat
                label="Passe na mão"
                value={pct(me.reception.positive.pct)}
                detail={explainPass(me.reception.positive, true)}
              />
            ) : (
              <Stat
                label="Bola de segunda"
                value={`${me.attack.second_ball.kills}/${me.attack.second_ball.attempts}`}
                detail="pontos / tentativas"
              />
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <PointSourcesCard points={{ kills: me.attack.kills, aces: me.serve.aces, blocks: me.blocks }} rows={scoredBreakdown(computed.facts).rows} />
            <ConcededCard title={`Pontos que ${athlete.name} cedeu`} rallies={computed.conceded} athleteView />
          </div>

          <div className={`grid gap-3 ${showReception ? "lg:grid-cols-2" : ""}`}>
            <Card
              title="Eficiência de ataque por torneio"
              note={`(PA − E) / TA somando cada torneio · pontos claros = menos de ${MIN_ATTACKS} ataques`}
            >
              <TrendChart
                name="Eficiência de ataque"
                onSelect={(point) => setTrendDrill({ point, column: "atk_eff" })}
                data={series.map((p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.attack.efficiency,
                  detail: `${p.attack.kills}-${p.attack.errors}/${p.attack.attempts}`,
                  lowVolume: p.attack.attempts < MIN_ATTACKS,
                }))}
              />
            </Card>
            {showReception && (
              <Card
                title="Passe na mão por torneio"
                note={`Só recepções avaliadas (modo detalhado) · pontos claros = menos de ${MIN_RECEPTIONS}`}
              >
                <TrendChart
                  name="Passe na mão"
                  color="#d95926"
                  onSelect={(point) => setTrendDrill({ point, column: "rec_positive" })}
                  data={series.map((p) => ({
                    key: p.key,
                    label: p.label,
                    value: p.reception.positive.pct,
                    detail: `${p.reception.positive.num}/${p.reception.positive.den}`,
                    lowVolume: p.reception.positive.den < MIN_RECEPTIONS,
                  }))}
                />
              </Card>
            )}
          </div>

          <p className="-mt-1 text-sm text-zinc-400" data-print="hide">
            Toque num ponto do gráfico para ver o torneio separado por partida (e em qual jogo foi o pico).
          </p>
          {series.length > 0 && (
            <div className="flex flex-wrap gap-2" data-print="hide">
              {series.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTrendDrill({ point: { key: p.key, label: p.label, value: p.attack.efficiency, detail: "", lowVolume: false }, column: "atk_eff" })}
                  className="min-h-11 rounded-xl bg-zinc-800 px-3 text-sm font-semibold"
                >
                  {p.label}: por partida
                </button>
              ))}
            </div>
          )}
          {trendDrill && (() => {
            const col = columnsAll.find((c) => c.key === trendDrill.column)!;
            const facts = factsOfBucket(trendDrill.point.key ?? "");
            const bucket = computed.byCompetition.find((c) => c.key === trendDrill.point.key)?.stats;
            return (
              <DrillPanel
                title={`${athlete.name} · ${trendDrill.point.label}`}
                column={col}
                value={bucket ? formatStat(col, bucket) : (trendDrill.point.value === null ? "–" : pct(trendDrill.point.value))}
                context={{ facts, matchLabel, athleteLabel: season.athleteName, defaultDimension: "match", dimensions: ["match", "type", "outcome", "opponent", "set", "moment", "phase"] }}
                onClose={() => setTrendDrill(null)}
              />
            );
          })()}

          <Card
            title="Números por torneio"
            note="O histórico segue a atleta: cada linha soma os jogos dela naquele torneio, com a dupla que for; a última é o total do recorte"
          >
            <label className="flex min-h-11 items-center gap-2 self-start text-sm text-zinc-300" data-print="hide">
              <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} className="size-5" />
              Ver todas as métricas (toque num número para detalhar)
            </label>
            <StatTable
              firstHeader="Torneio"
              columns={tableColumns(athleteColumns({ modality: computed.mine[0]?.match.modality ?? "beach", aggregated: true, showReception }), { detailed })}
              drill={(row) => ({
                facts: row.key === "total" ? computed.facts : computed.facts.filter((f) => (f.tournament_id ?? "friendly") === row.key),
                matchLabel,
                athleteLabel: season.athleteName,
                defaultDimension: "match",
              })}
              rows={computed.byCompetition.map((c) => ({
                key: c.key,
                name: c.label,
                label: c.label,
                sub: c.stats.team_keys.map((k) => season.teamName(k)).join(" · "),
                line: c.stats,
              }))}
              total={{ key: "total", label: yearParam === "all" ? "Todas as temporadas" : `Temporada ${yearParam}`, line: me }}
              minWidth={detailed ? 2400 : 1000}
            />
          </Card>

          <Card
            title="Parceiros"
            note="Números desta atleta jogando com cada parceiro"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-right tabular-nums">
                <thead>
                  <tr className="text-xs uppercase text-zinc-400">
                    <th className="py-2 text-left">Parceiro(a)</th>
                    <th className="px-2">Jogos</th>
                    <th className="px-2">V-D</th>
                    <th className="px-2" title="Pontos desta atleta">
                      Pts
                    </th>
                    <th
                      className="px-2"
                      title="Eficiência de ataque desta atleta"
                    >
                      Efic.
                    </th>
                    <th className="px-2">Dupla</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.pair_key} className="odd:bg-zinc-950/40">
                      <th scope="row" className="py-2.5 text-left font-medium">
                        {p.partner_ids.map((pid, i) => (
                          <span key={pid}>
                            {i > 0 && ", "}
                            <EntityLink href={athleteHref(pid)}>
                              {season.athleteName(pid)}
                            </EntityLink>
                          </span>
                        ))}
                      </th>
                      <td className="px-2">{p.matches}</td>
                      <td className="px-2">
                        {p.wins}-{p.losses}
                      </td>
                      <td className="px-2">{p.points}</td>
                      <td className="px-2">{pct(p.attack.efficiency)}</td>
                      <td className="px-2">
                        <EntityLink href={teamHref(p.pair_key)}>ver</EntityLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <ProfileMatches matches={mine} season={season} sideOf={sideOf} />
        </>
      )}
    </div>
  );
}
