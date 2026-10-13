"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Rate } from "@/domain/stats/types";
import { Legend, TooltipBox } from "./chart-tooltip";
import { CHART, pct, SERIES } from "./palette";

export interface RatesRow {
  label: string;
  sideOut: Rate;
  breakPoint: Rate;
}

const K1 = SERIES[0];
const K2 = SERIES[1];

/** Virada de bola (K1) × quebra de saque (K2) por torneio: barras agrupadas, mesma escala (%). */
export function RatesChart({ data }: { data: RatesRow[] }) {
  const rows = data.map((d) => ({ ...d, k1: d.sideOut.pct, k2: d.breakPoint.pct }));
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[{ color: K1, label: "Virada de bola (K1)" }, { color: K2, label: "Quebra de saque (K2)" }]} />
      <div className="h-60 w-full" role="img" aria-label="Virada de bola e quebra de saque por torneio">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <YAxis domain={[0, 1]} tickFormatter={(v: number) => pct(v)} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as RatesRow | undefined) : undefined;
                if (!r) return null;
                return (
                  <TooltipBox
                    title={r.label}
                    rows={[
                      { color: K1, label: "Virada de bola", value: `${pct(r.sideOut.pct)} (${r.sideOut.num}/${r.sideOut.den})` },
                      { color: K2, label: "Quebra de saque", value: `${pct(r.breakPoint.pct)} (${r.breakPoint.num}/${r.breakPoint.den})` },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="k1" name="Virada de bola (K1)" fill={K1} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="k2" name="Quebra de saque (K2)" fill={K2} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
