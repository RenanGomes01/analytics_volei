"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { replayMatch } from "@/domain/rally/replay";
import type { ModalityRules } from "@/domain/rules/modality";
import { scoredBreakdown } from "@/domain/stats/drill";
import { buildAnalytics } from "@/domain/stats/facts";
import { pointsConceded, pointsWon } from "@/domain/stats/rally-facts";
import type { AthleteStats, StatsFilter } from "@/domain/stats/types";
import { ConcededCard } from "@/features/analytics/drill/conceded-card";
import { MirrorCard } from "@/features/analytics/drill/mirror-card";
import { PointSourcesCard } from "@/features/analytics/drill/point-sources-card";
import { PrintButton } from "@/features/print/print-button";
import { PrintHeader } from "@/features/print/print-header";
import type { Athlete, Match, RallyEvent, TeamSide } from "@/domain/types";
import { CsvExportButton } from "@/features/export/csv-export-button";
import { ExportButton } from "@/features/export/export-button";
import { SyncBadge } from "@/features/sync/sync-badge";
import { AthleteTable } from "./athlete-table";
import { SetFilter } from "./set-filter";
import { TeamSummary } from "./team-summary";
import { explainEfficiency } from "./explain";
import { pct } from "./format";
import type { StatsView } from "./match-charts";
import { useBoxScore } from "./use-box-score";

// Recharts só é baixado quando a aba abre (o chunk fica no pré-cache: funciona offline).
const MatchCharts = dynamic(() => import("./match-charts"), {
  ssr: false,
  loading: () => <p className="py-6 text-center text-sm text-zinc-500">Carregando gráficos…</p>,
});

interface Props {
  match: Match;
  rules: ModalityRules;
  events: readonly RallyEvent[];
  athletes: Map<string, Athlete>;
  sides: [TeamSide, TeamSide];
  onClose: () => void;
}

const ALL: StatsFilter = { set: "all" };

/** Box Score em tela cheia sobre o scout. Só aqui dentro pode haver rolagem. */
export function StatsSheet({ match, rules, events, athletes, sides, onClose }: Props) {
  const [filter, setFilter] = useState<StatsFilter>(ALL);
  const [view, setView] = useState<StatsView>({ kind: "all" });
  const [detailed, setDetailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = useBoxScore(events, match, rules, filter);

  // Um Desfazer pode remover o set escolhido: volta para o jogo inteiro (ajuste de estado no render).
  if (filter.set !== "all" && !box.sets_available.includes(filter.set)) setFilter(ALL);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);
  const roster = (t: TeamSide) => (t === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids);
  const athleteName = (id: string) => athletes.get(id)?.name ?? id.slice(0, 6);
  const rallies = useMemo(() => {
    const all = replayMatch(events, { rules, first_server: match.first_server }).rallies;
    return filter.set === "all" ? all : all.filter((r) => r.set_number === filter.set);
  }, [events, rules, match.first_server, filter]);
  // Lances com contexto (drill-down): mesmos ralis e mesma contribuição do Box Score.
  const { facts, rallyFacts } = useMemo(() => {
    const all = buildAnalytics([{ match, events }]);
    const inSet = <T extends { set_number: number }>(xs: T[]) => (filter.set === "all" ? xs : xs.filter((f) => f.set_number === filter.set));
    return { facts: inSet(all.touches), rallyFacts: inSet(all.rallies) };
  }, [match, events, filter]);
  // Passe na mão só aparece quando alguém avaliou recepções (o modo rápido não avalia).
  const showReception = box.teams.A.reception.positive.den + box.teams.B.reception.positive.den > 0;
  const teamsShown = view.kind === "all" ? sides : [view.team];
  const viewKey = view.kind === "all" ? "all" : view.kind === "team" ? `team:${view.team}` : `athlete:${view.athlete_id}`;
  const chip = (key: string, label: string, next: StatsView) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={viewKey === key}
      onClick={() => setView(next)}
      className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold ${viewKey === key ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-zinc-100"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <h2 id="stats-title" className="text-xl font-bold">
          Estatísticas
        </h2>
        <span className="mr-auto">
          <SyncBadge />
        </span>
        <SetFilter sets={box.sets_available} value={filter} onChange={setFilter} />
        <PrintButton />
        <CsvExportButton box={box} match={match} athletes={athletes} filter={filter} />
        <ExportButton matchId={match.id} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar estatísticas"
          className="min-h-12 min-w-12 rounded-xl bg-zinc-800 text-2xl"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <PrintHeader
          title={`${teamName("A")} × ${teamName("B")}`}
          subtitle={`Estatísticas da partida${filter.set === "all" ? "" : ` · set ${filter.set}`}${view.kind === "athlete" ? ` · ${athleteName(view.athlete_id)}` : view.kind === "team" ? ` · ${teamName(view.team)}` : ""}`}
        />
        <div role="radiogroup" data-print="hide" aria-label="Visão das estatísticas" className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {chip("all", "Geral", { kind: "all" })}
          {sides.map((t) => chip(`team:${t}`, teamName(t), { kind: "team", team: t }))}
          <span aria-hidden className="mx-1 w-px shrink-0 bg-zinc-700" />
          {sides.flatMap((t) => roster(t).map((id) => chip(`athlete:${id}`, athleteName(id), { kind: "athlete", athlete_id: id, team: t })))}
        </div>

        {view.kind === "athlete" ? (
          <>
            <AthleteHeader stats={box.athletes[view.athlete_id]} name={athleteName(view.athlete_id)} team={teamName(view.team)} />
            {box.athletes[view.athlete_id] && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <PointSourcesCard
                  points={{ kills: box.athletes[view.athlete_id].attack.kills, aces: box.athletes[view.athlete_id].serve.aces, blocks: box.athletes[view.athlete_id].blocks }}
                  rows={scoredBreakdown(facts.filter((f) => f.athlete_id === view.athlete_id)).rows}
                />
                <ConcededCard
                  title={`Pontos que ${athleteName(view.athlete_id)} cedeu`}
                  rallies={rallyFacts.filter((f) => f.culprit === view.athlete_id)}
                  athleteView
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`grid gap-3 ${teamsShown.length > 1 ? "md:grid-cols-2" : ""}`}>
              {teamsShown.map((t) => (
                <TeamSummary key={t} modality={match.modality} name={teamName(t)} stats={box.teams[t]} showReception={showReception} />
              ))}
            </div>
            <div className={`mt-3 grid gap-3 ${teamsShown.length > 1 ? "md:grid-cols-2" : ""}`}>
              {teamsShown.map((t) => (
                <PointSourcesCard key={t} title={`Origem dos pontos — ${teamName(t)}`} points={box.teams[t].points} rallies={pointsWon(rallyFacts, { match_id: match.id, team: t })} />
              ))}
              {teamsShown.map((t) => (
                <ConcededCard
                  key={`c${t}`}
                  title={`Pontos cedidos por ${teamName(t)}: de onde vieram`}
                  rallies={pointsConceded(rallyFacts, { match_id: match.id, team: t })}
                  nameOf={athleteName}
                />
              ))}
            </div>
            {view.kind === "all" && (
              <div className="mt-3">
                <MirrorCard rallies={rallyFacts} match_id={match.id} teamName={teamName} />
              </div>
            )}
          </>
        )}

        <div className="mt-4">
          <MatchCharts view={view} rallies={rallies} roster={{ A: roster("A"), B: roster("B") }} teamName={teamName} athleteName={athleteName} />
        </div>

        {view.kind !== "athlete" && (
          <div className="mt-6 flex flex-col gap-6">
            <label className="flex min-h-11 items-center gap-2 self-start text-sm text-zinc-300" data-print="hide">
              <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} className="size-5" />
              Ver todas as métricas (toque num número para detalhar)
            </label>
            {teamsShown.map((t) => (
              <AthleteTable
                key={t}
                modality={match.modality}
                side={t}
                teamName={teamName(t)}
                athleteIds={roster(t)}
                athletes={athletes}
                stats={box.athletes}
                team={box.teams[t]}
                showReception={showReception}
                facts={facts}
                detailed={detailed}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl bg-zinc-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs tabular-nums text-zinc-500">{detail}</p>
    </div>
  );
}

/** Números-chave de uma atleta na partida (o volume sempre ao lado da %). */
function AthleteHeader({ stats, name, team }: { stats: AthleteStats | undefined; name: string; team: string }) {
  if (!stats) return <p className="text-zinc-400">{name} ainda não tem lances nesta partida.</p>;
  const { attack, serve } = stats;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-bold">
        {name} <span className="text-sm font-normal text-zinc-400">· {team}</span>
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Pontos" value={stats.points} detail={`${attack.kills} ataque · ${serve.aces} ace · ${stats.blocks} bloq.`} />
        <Tile label="Eficiência de ataque" value={pct(attack.efficiency)} detail={explainEfficiency(attack)} />
        <Tile label="Bola de segunda" value={`${attack.second_ball.kills}/${attack.second_ball.attempts}`} detail="pontos / tentativas" />
        <Tile
          label="Saque"
          value={`${serve.aces} ace${serve.aces === 1 ? "" : "s"}`}
          detail={serve.attempts ? `${serve.attempts} saques · ${serve.errors_net} na rede · ${serve.errors_out} fora` : "nenhum saque ainda"}
        />
      </div>
    </div>
  );
}
