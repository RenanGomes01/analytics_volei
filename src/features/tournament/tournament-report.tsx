"use client";

import { useMemo } from "react";
import { pct } from "@/features/charts/palette";
import { tournamentReport, type Award } from "@/domain/stats/report";
import { athleteHref, EntityLink, teamHref } from "@/features/analytics/ui";
import { DrillBars } from "@/features/analytics/drill/drill-bars";
import { PointSourcesCard } from "@/features/analytics/drill/point-sources-card";
import type { RosterData } from "@/features/roster/use-roster-data";
import type { CompetitionData } from "./use-competition-data";

function AwardCard({ award, nameOf, hrefOf }: { award: Award; nameOf: (id: string) => string; hrefOf: (id: string) => string }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 print-card">
      <header>
        <h4 className="font-bold">{award.label}</h4>
        {award.minLabel && <p className="text-xs text-zinc-500">{award.minLabel}</p>}
      </header>
      <ol className="flex flex-col gap-1">
        {award.podium.map((w, i) => (
          <li key={w.id} className={`flex items-baseline gap-2 tabular-nums ${i === 0 ? "text-lg" : "text-sm"}`}>
            <span className="w-6 shrink-0">{["🥇", "🥈", "🥉"][i]}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              <EntityLink href={hrefOf(w.id)}>{nameOf(w.id)}</EntityLink>
            </span>
            <span className="font-bold">{award.kind === "rate" ? pct(w.value) : w.value}</span>
            <span className="w-24 shrink-0 text-right text-xs text-zinc-500">{w.detail}</span>
          </li>
        ))}
        {award.podium.length === 0 && <li className="text-sm text-zinc-500">Sem volume suficiente.</li>}
      </ol>
    </section>
  );
}

/**
 * Relatório do torneio (Fase 15): todas as atletas e duplas cruzadas, separadas por gênero, com os
 * melhores por fundamento e as maiores fontes de erro (individual e por dupla).
 */
export function TournamentReport({ data, roster }: { data: CompetitionData; roster: RosterData }) {
  const athleteName = (id: string) => roster.athleteById.get(id)?.name ?? id.slice(0, 6);
  const teamName = (key: string) => roster.teamByKey.get(key)?.name ?? data.stats.teams[key]?.name ?? key;
  const report = useMemo(
    () => tournamentReport(data.stats, data.facts, { athletes: roster.athleteById, nameOf: athleteName, teamNameOf: teamName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- os nomes derivam de roster/stats, já nas deps
    [data.stats, data.facts, roster],
  );

  if (report.sections.length === 0) return <p className="text-zinc-400">Ainda não há lances neste torneio.</p>;
  return (
    <div className="flex flex-col gap-6">
      {report.missingGender > 0 && (
        <p className="rounded-xl bg-amber-900/40 px-4 py-3 text-sm text-amber-200">
          {report.missingGender} {report.missingGender === 1 ? "atleta está" : "atletas estão"} sem gênero no cadastro e aparecem em “Sem gênero”. Ajuste em Atletas e duplas.
        </p>
      )}
      {report.sections.map((s) => (
        <section key={s.key} className="flex flex-col gap-3 border-0 print:break-before-auto" style={{ border: 0 }}>
          <h3 className="text-xl font-black">
            {s.label}{" "}
            <span className="text-sm font-normal text-zinc-400">
              {s.athletes.length ? `${s.athletes.length} atletas · ` : ""}
              {s.teams.length} {data.tournament.modality === "beach" ? "duplas" : "times"}
            </span>
          </h3>

          {s.awards.length > 0 && (
            <>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Melhores do campeonato</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.awards.filter((a) => a.key !== "reception" || a.podium.length > 0).map((a) => (
                  <AwardCard key={a.key} award={a} nameOf={athleteName} hrefOf={athleteHref} />
                ))}
              </div>
            </>
          )}
          {s.teams.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.teamAwards.map((a) => (
                <AwardCard key={a.key} award={a} nameOf={teamName} hrefOf={teamHref} />
              ))}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {s.teams.length > 0 && <PointSourcesCard title="Como os pontos aconteceram" points={Object.fromEntries(s.points.sources.map((p) => [p.key, p.count]))} />}
            <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 print-card">
              <header>
                <h4 className="font-bold">Maior fonte de erros</h4>
                <p className="text-sm text-zinc-400">Pontos entregues ao adversário, por tipo — e quem mais cometeu cada um</p>
              </header>
              <DrillBars rows={s.errorSources.slice(0, 8).map((e) => ({ key: e.label, label: e.leader ? `${e.label} · ${athleteName(e.leader.athlete_id)} (${e.leader.count})` : e.label, count: e.count, share: e.share }))} />
            </section>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {s.topGivers.length > 0 && (
              <section className="rounded-2xl bg-zinc-900 p-4 print-card">
                <h4 className="font-bold">Quem mais entregou pontos (individual)</h4>
                <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
                  {s.topGivers.map((g, i) => (
                    <li key={g.athlete_id} className="flex gap-2">
                      <span className="w-5 text-right text-zinc-500">{i + 1}</span>
                      <span className="flex-1"><EntityLink href={athleteHref(g.athlete_id)}>{athleteName(g.athlete_id)}</EntityLink></span>
                      <strong>{g.count}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {s.topTeamGivers.length > 0 && (
              <section className="rounded-2xl bg-zinc-900 p-4 print-card">
                <h4 className="font-bold">Quem mais entregou pontos ({data.tournament.modality === "beach" ? "dupla" : "time"})</h4>
                <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
                  {s.topTeamGivers.map((g, i) => (
                    <li key={g.pair_key} className="flex gap-2">
                      <span className="w-5 text-right text-zinc-500">{i + 1}</span>
                      <span className="flex-1"><EntityLink href={teamHref(g.pair_key)}>{teamName(g.pair_key)}</EntityLink></span>
                      <strong>{g.count}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
