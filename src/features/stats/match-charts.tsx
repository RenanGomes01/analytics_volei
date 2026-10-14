"use client";

import type { ReactNode } from "react";
import type { RallyResult } from "@/domain/rally/replay";
import { tallyRallies, type Roster } from "@/domain/stats/box-score";
import { attackOutcomes, longestRuns, rallyPointKinds, scoreProgression, serveOutcomes } from "@/domain/stats/match-insights";
import type { TeamSide } from "@/domain/types";
import { Legend } from "@/features/charts/chart-tooltip";
import { OutcomeChart } from "@/features/charts/outcome-chart";
import { SERIES } from "@/features/charts/palette";
import { PointKindsChart } from "@/features/charts/point-kinds-chart";
import { PointsMixChart } from "@/features/charts/points-mix-chart";
import { ScoreProgressionChart } from "@/features/charts/score-progression-chart";

/** O que a aba de estatísticas está mostrando. */
export type StatsView = { kind: "all" } | { kind: "team"; team: TeamSide } | { kind: "athlete"; athlete_id: string; team: TeamSide };

interface Props {
  view: StatsView;
  /** Ralis do recorte (set escolhido ou jogo inteiro), já reconstruídos pelo replay. */
  rallies: readonly RallyResult[];
  roster: Roster;
  teamName: (t: TeamSide) => string;
  athleteName: (id: string) => string;
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
      <header>
        <h3 className="font-bold">{title}</h3>
        {note && <p className="text-xs text-zinc-500">{note}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * Gráficos da partida em andamento. Carregado sob demanda (next/dynamic) só quando a aba de estatísticas
 * abre: o Recharts não entra no carregamento inicial da tela de scout.
 */
export default function MatchCharts({ view, rallies, roster, teamName, athleteName }: Props) {
  if (view.kind === "all") {
    const sets = [...scoreProgression(rallies)];
    const runs = longestRuns(rallies);
    const names = { A: teamName("A"), B: teamName("B") };
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Evolução do placar" note={`Maior sequência: ${names.A} ${runs.A} · ${names.B} ${runs.B} pontos seguidos`}>
          <Legend items={[{ color: SERIES[0], label: names.A }, { color: SERIES[1], label: names.B }]} />
          {sets.length === 0 && <p className="text-sm text-zinc-500">Ainda sem pontos.</p>}
          {sets.map(([set, line]) => (
            <div key={set}>
              <p className="text-xs uppercase tracking-wide text-zinc-400">Set {set}</p>
              <ScoreProgressionChart data={line} names={names} />
            </div>
          ))}
        </Panel>
        <div className="flex flex-col gap-3">
          {(["A", "B"] as const).map((t) => (
            <Panel key={t} title={`Como ${teamName(t)} fez os pontos`}>
              <PointKindsChart data={rallyPointKinds(rallies, (r) => r.point_to === t)} />
            </Panel>
          ))}
        </div>
      </div>
    );
  }

  if (view.kind === "team") {
    const tally = tallyRallies(rallies, roster);
    const rows = roster[view.team].map((id) => {
      const c = tally.athletes.get(id)?.counters;
      return { name: athleteName(id), kills: c?.kills ?? 0, aces: c?.aces ?? 0, blocks: c?.blocks ?? 0 };
    });
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`Como ${teamName(view.team)} fez os pontos`}>
          <PointKindsChart data={rallyPointKinds(rallies, (r) => r.point_to === view.team)} />
        </Panel>
        <Panel title="Pontos de cada atleta" note="Ataque, ace e bloqueio">
          <PointsMixChart data={rows} />
        </Panel>
      </div>
    );
  }

  const bySet = [...new Set(rallies.map((r) => r.set_number))].sort((a, b) => a - b).map((set) => {
    const c = tallyRallies(rallies, roster, { set }).athletes.get(view.athlete_id)?.counters;
    return { name: `Set ${set}`, kills: c?.kills ?? 0, aces: c?.aces ?? 0, blocks: c?.blocks ?? 0 };
  });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Ataques" note="Bloqueado = o próximo toque foi bloqueio # do adversário">
        <OutcomeChart name="Ataque" data={attackOutcomes(rallies, view.athlete_id)} />
      </Panel>
      <Panel title="Saques">
        <OutcomeChart name="Saque" data={serveOutcomes(rallies, view.athlete_id)} />
      </Panel>
      <Panel title="Pontos por set" note="Ataque, ace e bloqueio">
        {bySet.length === 0 ? <p className="text-sm text-zinc-500">Ainda sem pontos.</p> : <PointsMixChart data={bySet} />}
      </Panel>
    </div>
  );
}
