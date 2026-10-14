"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PointKind } from "@/domain/stats/match-insights";
import { Legend, TooltipBox } from "./chart-tooltip";
import { CHART, SERIES } from "./palette";

const WON = SERIES[0];
const ERROR = SERIES[1];

/** "Como os pontos aconteceram": barras horizontais ordenadas, cor = ponto conquistado × erro do adversário. */
export function PointKindsChart({ data }: { data: PointKind[] }) {
  const total = data.reduce((s, k) => s + k.count, 0);
  const height = Math.max(140, data.length * 30 + 30);
  if (total === 0) return <p className="text-sm text-zinc-500">Ainda sem pontos registrados neste recorte.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[{ color: WON, label: "Ponto conquistado" }, { color: ERROR, label: "Erro / falta do adversário" }]} />
      <div className="w-full" style={{ height }} role="img" aria-label="Como os pontos aconteceram">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <YAxis type="category" dataKey="label" width={190} tick={{ fill: CHART.textSecondary, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const k = active ? (payload?.[0]?.payload as PointKind | undefined) : undefined;
                if (!k) return null;
                return (
                  <TooltipBox
                    title={k.label}
                    rows={[{ color: k.group === "won" ? WON : ERROR, label: "Pontos", value: `${k.count} (${Math.round((k.count / total) * 100)}%)` }]}
                  />
                );
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              {data.map((k) => (
                <Cell key={k.label} fill={k.group === "won" ? WON : ERROR} />
              ))}
              <LabelList dataKey="count" position="right" fill={CHART.textSecondary} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
