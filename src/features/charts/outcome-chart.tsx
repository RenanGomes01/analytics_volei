"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Outcome } from "@/domain/stats/match-insights";
import { Legend, TooltipBox } from "./chart-tooltip";
import { CHART, SERIES } from "./palette";

const TONE = { good: SERIES[0], neutral: CHART.muted, bad: SERIES[1] } as const;
const TONE_LABEL = { good: "Ponto", neutral: "Bola em jogo", bad: "Erro" } as const;

/** Desfecho de um fundamento (ataques ou saques): barras horizontais com o número e a % no tooltip. */
export function OutcomeChart({ data, name }: { data: Outcome[]; name: string }) {
  const total = data.reduce((s, o) => s + o.count, 0);
  if (total === 0) return <p className="text-sm text-zinc-500">Nenhum {name.toLowerCase()} registrado neste recorte.</p>;
  const tones = [...new Set(data.map((o) => o.tone))];
  return (
    <div className="flex flex-col gap-2">
      <Legend items={tones.map((t) => ({ color: TONE[t], label: TONE_LABEL[t] }))} />
      <div className="w-full" style={{ height: data.length * 32 + 24 }} role="img" aria-label={`Desfecho: ${name}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fill: CHART.textSecondary, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const o = active ? (payload?.[0]?.payload as Outcome | undefined) : undefined;
                if (!o) return null;
                return <TooltipBox title={`${name}: ${o.label}`} rows={[{ color: TONE[o.tone], label: "Total", value: `${o.count} de ${total} (${Math.round((o.count / total) * 100)}%)` }]} />;
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              {data.map((o) => (
                <Cell key={o.label} fill={TONE[o.tone]} />
              ))}
              <LabelList dataKey="count" position="right" fill={CHART.textSecondary} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
