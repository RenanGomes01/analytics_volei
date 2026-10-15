"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressionPoint } from "@/domain/stats/match-insights";
import type { SetStory } from "@/domain/stats/match-story";
import type { TeamSide } from "@/domain/types";
import { TooltipBox } from "./chart-tooltip";
import { CHART, SERIES } from "./palette";

type Marker = "lead" | "run" | "set";

interface ShapeProps {
  cx?: number;
  cy?: number;
}

/** Formas dos marcadores (também na legenda): ▲ virada, ● fim da maior sequência, ◆ ponto de set. */
function MarkerShape({ kind, color, cx = 0, cy = 0, size = 7 }: { kind: Marker; color: string; size?: number } & ShapeProps) {
  const stroke = { stroke: CHART.surface, strokeWidth: 1.5 };
  if (kind === "lead") return <path d={`M${cx},${cy - size} L${cx + size},${cy + size * 0.8} L${cx - size},${cy + size * 0.8} Z`} fill={color} {...stroke} />;
  if (kind === "set") return <path d={`M${cx},${cy - size} L${cx + size},${cy} L${cx},${cy + size} L${cx - size},${cy} Z`} fill={color} {...stroke} />;
  return <circle cx={cx} cy={cy} r={size * 0.75} fill={color} {...stroke} />;
}

export function MarkerLegend({ color = CHART.textSecondary }: { color?: string }) {
  const item = (kind: Marker, label: string) => (
    <li className="flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
        <MarkerShape kind={kind} color={color} size={6} />
      </svg>
      {label}
    </li>
  );
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: CHART.textSecondary }}>
      {item("lead", "virada de placar")}
      {item("run", "fim da maior sequência")}
      {item("set", "ponto final do set")}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm" style={{ background: "rgba(195,194,183,0.18)" }} aria-hidden="true" />
        faixa = maior sequência (cor da dupla) ou trocação de side-out (cinza)
      </li>
    </ul>
  );
}

/**
 * Evolução do placar de um set, rali a rali (Fase 16: contada). Uma linha por dupla e um eixo; por
 * cima, os momentos do `setStory`: faixa na maior sequência de cada dupla e na trocação, marcador nas
 * viradas de placar, no fim da maior sequência e no ponto final. O tooltip explica o evento do rali.
 */
export function ScoreProgressionChart({ data, names, story }: { data: ProgressionPoint[]; names: { A: string; B: string }; story?: SetStory }) {
  const colors = { A: SERIES[0], B: SERIES[1] };
  const at = (x: number) => data[x] ?? data[data.length - 1];
  const events = new Map<number, string[]>();
  const note = (x: number, text: string) => events.set(x, [...(events.get(x) ?? []), text]);
  if (story) {
    for (const c of story.leadChanges) note(c.at, `Virada: ${names[c.leader]} passa à frente (${c.score.A}×${c.score.B})`);
    for (const t of ["A", "B"] as const) {
      const r = story.runs[t];
      if (r && r.length >= 3) note(r.to, `Fim da maior sequência de ${names[t]}: ${r.length} pontos seguidos`);
    }
    if (story.trade) note(story.trade.to, `Trocação de side-out: ${story.trade.length} pontos de quem recebia`);
  }
  const lastLeader: TeamSide | null = data.length > 1 ? (at(data.length - 1).A > at(data.length - 1).B ? "A" : "B") : null;

  return (
    <div className="h-56 w-full" role="img" aria-label="Evolução do placar no set, com sequências e viradas marcadas">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="rally" type="number" domain={[0, "dataMax"]} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} allowDecimals={false} />
          <YAxis allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} width={32} />
          {story?.trade && <ReferenceArea x1={story.trade.from - 1} x2={story.trade.to} fill={CHART.textSecondary} fillOpacity={0.12} stroke="none" ifOverflow="hidden" />}
          {story &&
            (["A", "B"] as const).map((t) => {
              const r = story.runs[t];
              return r && r.length >= 3 ? <ReferenceArea key={t} x1={r.from - 1} x2={r.to} fill={colors[t]} fillOpacity={0.14} stroke="none" ifOverflow="hidden" /> : null;
            })}
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as ProgressionPoint | undefined) : undefined;
              if (!p) return null;
              const why = events.get(p.rally);
              return (
                <div>
                  <TooltipBox
                    title={p.rally === 0 ? "Início do set" : `Ponto ${p.rally} do set`}
                    rows={[
                      { color: colors.A, label: names.A, value: p.A },
                      { color: colors.B, label: names.B, value: p.B },
                    ]}
                  />
                  {why && (
                    <div className="mt-1 max-w-64 rounded-lg px-3 py-2 text-xs" style={{ background: "#0d0d0d", color: CHART.textPrimary, border: "1px solid rgba(255,255,255,0.12)" }}>
                      {why.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {(["A", "B"] as const).map((t) => (
            <Line key={t} type="stepAfter" dataKey={t} stroke={colors[t]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }} />
          ))}
          {story?.leadChanges.map((c) => (
            <ReferenceDot key={`lead${c.at}`} x={c.at} y={c.score[c.leader]} ifOverflow="extendDomain" shape={(p: ShapeProps) => <MarkerShape kind="lead" color={colors[c.leader]} {...p} />} />
          ))}
          {story &&
            (["A", "B"] as const).map((t) => {
              const r = story.runs[t];
              return r && r.length >= 3 ? (
                <ReferenceDot key={`run${t}`} x={r.to} y={r.scoreTo[t]} ifOverflow="extendDomain" shape={(p: ShapeProps) => <MarkerShape kind="run" color={colors[t]} {...p} />} />
              ) : null;
            })}
          {lastLeader && story && story.lastPoint > 0 && (
            <ReferenceDot
              x={story.lastPoint}
              y={at(story.lastPoint)[lastLeader]}
              ifOverflow="extendDomain"
              shape={(p: ShapeProps) => <MarkerShape kind="set" color={colors[lastLeader]} {...p} />}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
