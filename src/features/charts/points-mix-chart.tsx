"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Legend, TooltipBox } from "./chart-tooltip";
import { CHART, SERIES } from "./palette";

export interface PointsMixRow {
  name: string;
  kills: number;
  aces: number;
  blocks: number;
  /** Só faz sentido para duplas (pontos por erro do adversário); ausente para atletas. */
  opponent_errors?: number;
}

const SEGMENTS = [
  { key: "kills", label: "Ataque", color: SERIES[0] },
  { key: "aces", label: "Ace", color: SERIES[1] },
  { key: "blocks", label: "Bloqueio", color: SERIES[2] },
  { key: "opponent_errors", label: "Erro do adversário", color: SERIES[3] },
] as const;

/** Distribuição dos pontos por tipo (barras horizontais empilhadas, top N). Cor fixa por tipo. */
export function PointsMixChart({ data }: { data: PointsMixRow[] }) {
  const segments = SEGMENTS.filter((s) => data.some((d) => d[s.key] !== undefined));
  const height = Math.max(160, data.length * 34 + 40);
  return (
    <div className="flex flex-col gap-2">
      <Legend items={segments.map((s) => ({ color: s.color, label: s.label }))} />
      <div className="w-full" style={{ height }} role="img" aria-label="Distribuição dos pontos por tipo">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: CHART.textSecondary, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as PointsMixRow | undefined) : undefined;
                if (!r) return null;
                return <TooltipBox title={r.name} rows={segments.map((s) => ({ color: s.color, label: s.label, value: r[s.key] ?? 0 }))} />;
              }}
            />
            {segments.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="pts"
                fill={s.color}
                stroke={CHART.surface}
                strokeWidth={2}
                radius={i === segments.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
