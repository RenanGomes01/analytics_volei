"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { replayMatch } from "@/domain/rally/replay";
import { resolveAthlete } from "@/domain/roster/identity";
import { rulesFor } from "@/domain/rules/modality";
import {
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
  BackHome,
  Card,
  EntityLink,
  Segmented,
  Stat,
  teamHref,
} from "./ui";
import { replaceQuery, useSeasonData } from "./use-season-data";

const MIN_ATTACKS = 10;
const MIN_RECEPTIONS = 10;

/** Perfil do atleta: atravessa parcerias (no vôlei de praia a dupla muda; o atleta não). */
export function AthleteProfile() {
  const params = useSearchParams();
  const season = useSeasonData();
  const requested = params.get("id") ?? "";
  const id = season ? resolveAthlete(season.aliases, requested) : requested;
  const [yearParam, setYear] = useState<string>(params.get("year") ?? "all");

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
    });
    const mine = scope.filter(({ match }) =>
      [...match.team_a.athlete_ids, ...match.team_b.athlete_ids].some(
        (a) => resolveAthlete(season.aliases, a) === id,
      ),
    );
    return {
      mine,
      me: seasonStats(mine, season.aliases).athletes[id],
      series: athleteSeries(mine, id, season.aliases),
      partners: athletePartners(mine, id, season.aliases),
    };
  }, [season, id, yearParam]);

  if (!season || !computed)
    return <p className="p-8 text-center text-zinc-400">Carregando atleta…</p>;
  const athlete = season.athletes.get(id);
  if (!athlete)
    return (
      <p className="p-8 text-center">Atleta não encontrada neste aparelho.</p>
    );

  const { me, series, partners, mine } = computed;
  const wins = partners.reduce((s, p) => s + p.wins, 0);
  const losses = partners.reduce((s, p) => s + p.losses, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <BackHome />
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
        <HardLink
          href="/rankings"
          className="ml-auto text-sm text-zinc-400 underline"
        >
          Rankings
        </HardLink>
      </header>

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

      {!me ? (
        <p className="text-zinc-400">Nenhuma partida neste recorte.</p>
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
              detail={`${me.attack.kills}-${me.attack.errors}/${me.attack.attempts}`}
            />
            <Stat
              label="Passe na mão"
              value={pct(me.reception.positive.pct)}
              detail={`${me.reception.positive.num}/${me.reception.positive.den} avaliados`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card
              title="Eficiência de ataque por torneio"
              note={`(PA − E) / TA somando cada torneio · pontos claros = menos de ${MIN_ATTACKS} ataques`}
            >
              <TrendChart
                name="Eficiência de ataque"
                data={series.map((p) => ({
                  label: p.label,
                  value: p.attack.efficiency,
                  detail: `${p.attack.kills}-${p.attack.errors}/${p.attack.attempts}`,
                  lowVolume: p.attack.attempts < MIN_ATTACKS,
                }))}
              />
            </Card>
            <Card
              title="Passe na mão por torneio"
              note={`Só recepções avaliadas (modo detalhado) · pontos claros = menos de ${MIN_RECEPTIONS}`}
            >
              {series.every((p) => p.reception.positive.den === 0) ? (
                <p className="text-sm text-zinc-500">
                  Nenhuma recepção avaliada. O modo rápido não avalia o passe;
                  use o modo detalhado para ter este gráfico.
                </p>
              ) : (
                <TrendChart
                  name="Passe na mão"
                  color="#d95926"
                  data={series.map((p) => ({
                    label: p.label,
                    value: p.reception.positive.pct,
                    detail: `${p.reception.positive.num}/${p.reception.positive.den}`,
                    lowVolume: p.reception.positive.den < MIN_RECEPTIONS,
                  }))}
                />
              )}
            </Card>
          </div>

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

          <Card title="Partidas">
            <ul className="flex flex-col gap-1">
              {[...mine].reverse().map(({ match, events, tournament }) => {
                const state = replayMatch(events, {
                  rules: rulesFor(match.modality),
                  first_server: match.first_server,
                });
                const score = state.sets
                  .filter((s) => s.score.A + s.score.B > 0)
                  .map((s) => `${s.score.A}×${s.score.B}`)
                  .join(" · ");
                return (
                  <li key={match.id}>
                    <HardLink
                      href={`/match?id=${encodeURIComponent(match.id)}`}
                      className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-2 hover:bg-zinc-800"
                    >
                      <span className="truncate">
                        {match.team_a.name} × {match.team_b.name}
                      </span>
                      <span className="shrink-0 text-sm text-zinc-400">
                        {score || "sem pontos"} ·{" "}
                        {tournament?.name ?? "Amistoso"}
                      </span>
                    </HardLink>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
