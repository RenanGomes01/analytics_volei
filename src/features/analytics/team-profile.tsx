"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { pairKey, teamGender } from "@/domain/roster/identity";
import { availableYears, filterSeason, pointKinds, seasonStats, teamSeries, type SeasonMatch } from "@/domain/stats/season";
import { PointKindsChart } from "@/features/charts/point-kinds-chart";
import { pct } from "@/features/charts/palette";
import { RatesChart } from "@/features/charts/rates-chart";
import { athleteHref, Card, EntityLink, Segmented, Stat, teamHref } from "./ui";
import { EmptyState } from "@/components/empty-state";
import { replaceQuery, useSeasonData } from "./use-season-data";
import { buildAnalytics } from "@/domain/stats/facts";
import { explainBreakPoint, explainSideOut } from "@/features/stats/explain";
import { pointsConceded, pointsWon } from "@/domain/stats/rally-facts";
import { ConcededCard } from "./drill/conceded-card";
import { PointSourcesCard } from "./drill/point-sources-card";
import { matchTitles, OccurrencesSheet } from "./drill/occurrences-sheet";
import { rallyOccurrences, touchOccurrences, type Occurrence } from "@/domain/stats/occurrences";
import { attackDrill, lethalLabel, pointsDrill, weaknesses, weapon } from "@/domain/stats/athlete-insights";
import { scoredLabel } from "@/domain/stats/drill";
import { WeaknessWidget, WeaponWidget } from "./athlete-widgets";
import { PrintButton } from "@/features/print/print-button";
import { PrintHeader } from "@/features/print/print-header";
import { ProfileMatches } from "./profile-matches";

const GENDER_LABEL = { M: "Masculino", F: "Feminino", Mixed: "Misto" } as const;

/** Perfil da dupla (pair_key): só existe enquanto o par existe. K1 × K2 por torneio e confrontos. */
export function TeamProfile() {
  const params = useSearchParams();
  const season = useSeasonData();
  const key = params.get("key") ?? "";
  const [yearParam, setYear] = useState<string>(params.get("year") ?? "all");

  const years = useMemo(() => (season ? availableYears(season.matches) : []), [season]);
  const computed = useMemo(() => {
    if (!season) return null;
    const scope = filterSeason(season.matches, { year: yearParam === "all" ? undefined : Number(yearParam), includeFriendlies: true });
    const { series, opponents } = teamSeries(scope, key, season.aliases);
    const { rallies, touches } = buildAnalytics(scope.map((m) => ({ match: m.match, events: m.events, tournament_id: m.tournament?.id ?? null })), season.aliases);
    const mine = scope.filter(({ match }) => [match.team_a, match.team_b].some((t) => pairKey(t.athlete_ids, season.aliases) === key));
    const team = seasonStats(scope, season.aliases).teams[key];
    const conceded = pointsConceded(rallies, { pair_key: key });
    // Raio-X da dupla (Fase 21): as MESMAS contas do perfil da atleta, sobre os lances das duas na dupla.
    const facts = touches.filter((f) => f.pair_key === key);
    return { mine, series, opponents, won: pointsWon(rallies, { pair_key: key }), conceded, facts, weak: weaknesses(conceded, team?.matches ?? 0), arm: weapon(facts), team, kinds: pointKinds(scope, season.aliases, key) };
  }, [season, key, yearParam]);

  /** Lances de uma barra (Raio-X, arma, origem, cedidos), por jogo e placar (Fases 19 e 21). */
  const [sheet, setSheet] = useState<{ title: string; occurrences: Occurrence[] } | null>(null);
  const titles = useMemo(() => matchTitles(computed?.mine ?? []), [computed]);

  const sideOf = useCallback(
    ({ match }: SeasonMatch) =>
      !season ? null : pairKey(match.team_a.athlete_ids, season.aliases) === key ? ("A" as const) : pairKey(match.team_b.athlete_ids, season.aliases) === key ? ("B" as const) : null,
    [season, key],
  );

  if (!season || !computed) return <p className="p-8 text-center text-zinc-400">Carregando dupla…</p>;
  const ids = key.split("|").filter(Boolean);
  if (ids.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <EmptyState icon="🤝" title="Dupla não informada." primary={{ label: "Ver ranking de duplas", href: "/rankings?view=teams" }} />
      </div>
    );
  }

  const { team, series, opponents, kinds } = computed;
  const gender = teamGender(ids.map((id) => season.athletes.get(id)?.gender));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{season.teamName(key)}</h1>
        {gender && <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">{GENDER_LABEL[gender]}</span>}
        <span className="ml-auto flex items-center gap-3" data-print="hide">
          <HardLink href="/rankings?view=teams" className="text-sm text-zinc-400 underline">
            Rankings
          </HardLink>
          <PrintButton />
        </span>
      </header>
      <PrintHeader subtitle={`Perfil da dupla · ${yearParam === "all" ? "todas as temporadas" : `temporada ${yearParam}`}`} />
      <p className="text-sm">
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && " · "}
            <EntityLink href={athleteHref(id)}>{season.athleteName(id)}</EntityLink>
          </span>
        ))}
      </p>

      <Segmented
        label="Temporada"
        value={yearParam}
        options={[["all", "Todas"], ...years.map((y): [string, string] => [String(y), String(y)])]}
        onChange={(v) => {
          setYear(v);
          replaceQuery({ year: v === "all" ? undefined : v });
        }}
      />

      {!team ? (
        <EmptyState
          icon="🔎"
          title="Esta dupla não jogou neste recorte."
          primary={{ label: "+ Nova partida", href: "/new" }}
          secondary={
            yearParam !== "all"
              ? {
                  label: "Ver todas as temporadas",
                  onClick: () => {
                    setYear("all");
                    replaceQuery({ year: undefined });
                  },
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Jogos" value={team.matches} detail={`${team.wins} V · ${team.losses} D`} />
            <Stat label="Sets" value={`${team.sets_won}-${team.sets_lost}`} detail={`saldo de pontos ${team.points_for - team.points_against > 0 ? "+" : ""}${team.points_for - team.points_against}`} />
            <Stat label="Virada de bola (K1)" value={pct(team.side_out.pct)} detail={explainSideOut(team.side_out)} />
            <Stat label="Quebra de saque (K2)" value={pct(team.break_point.pct)} detail={explainBreakPoint(team.break_point)} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <WeaknessWidget
              subject="team"
              data={computed.weak}
              onSelect={(row) => setSheet({ title: row.label, occurrences: rallyOccurrences(computed.conceded.filter((f) => f.code === row.key), "conceded") })}
            />
            <WeaponWidget
              subject="team"
              data={computed.arm}
              onSelect={(label) =>
                setSheet({ title: label, occurrences: touchOccurrences(computed.facts, pointsDrill, { label: scoredLabel, athleteLabel: season.athleteName }).filter((o) => o.label === label) })
              }
              onSelectLethal={() => {
                const label = computed.arm.lethal!.label;
                setSheet({ title: `${label}: todos os ataques`, occurrences: touchOccurrences(computed.facts.filter((f) => lethalLabel(f) === label), attackDrill, { athleteLabel: season.athleteName }) });
              }}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <PointSourcesCard
              points={team.points}
              rallies={computed.won}
              onSelectRow={(row) => {
                const rallies = computed.won.filter((f) => f.code === row.key);
                setSheet({ title: rallies[0]?.merit ?? row.label, occurrences: rallyOccurrences(rallies, "merit") });
              }}
            />
            <ConcededCard
              rallies={computed.conceded}
              nameOf={season.athleteName}
              onSelectRow={(row) => {
                const rallies = computed.conceded.filter((f) => f.code === row.key);
                setSheet({ title: rallies[0]?.conceded ?? row.label, occurrences: rallyOccurrences(rallies, "conceded") });
              }}
            />
          </div>
          {sheet && (
            <OccurrencesSheet
              title={sheet.title}
              subtitle={season.teamName(key)}
              occurrences={sheet.occurrences}
              matchLabel={titles.label}
              matchRank={titles.rank}
              athleteLabel={season.athleteName}
              showActor
              onClose={() => setSheet(null)}
            />
          )}

          <Card title="Virada de bola × quebra de saque por torneio" note="Soma dos ralis de cada torneio · passe o dedo/mouse para ver ganhos/total">
            <RatesChart data={series.map((s) => ({ label: s.label, sideOut: s.side_out, breakPoint: s.break_point }))} />
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Como a dupla fez os pontos">
              <PointKindsChart data={kinds} />
            </Card>
            <Card title="Confrontos">
              <ul className="flex flex-col gap-1 tabular-nums">
                {opponents.map((o) => (
                  <li key={o.pair_key} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 odd:bg-zinc-950/40">
                    <EntityLink href={teamHref(o.pair_key)}>{season.teamName(o.pair_key)}</EntityLink>
                    <span className="text-sm text-zinc-300">
                      {o.matches} {o.matches === 1 ? "jogo" : "jogos"} · {o.wins}-{o.losses}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <ProfileMatches matches={computed.mine} season={season} sideOf={sideOf} />
        </>
      )}
    </div>
  );
}
