"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressionPoint } from "@/domain/stats/match-insights";
import { TooltipBox } from "./chart-tooltip";
import { CHART, SERIES } from "./palette";

/** Evolução do placar de um set, rali a rali: uma linha por equipe, um eixo (pontos). */
export function ScoreProgressionChart({ data, names }: { data: ProgressionPoint[]; names: { A: string; B: string } }) {
  const colors = { A: SERIES[0], B: SERIES[1] };
  return (
    <div className="h-48 w-full" role="img" aria-label="Evolução do placar no set">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="rally" tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} allowDecimals={false} />
          <YAxis allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} width={32} />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as ProgressionPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.rally === 0 ? "Início do set" : `Rali ${p.rally}`}
                  rows={[
                    { color: colors.A, label: names.A, value: p.A },
                    { color: colors.B, label: names.B, value: p.B },
                  ]}
                />
              );
            }}
          />
          {(["A", "B"] as const).map((t) => (
            <Line key={t} type="stepAfter" dataKey={t} stroke={colors[t]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
