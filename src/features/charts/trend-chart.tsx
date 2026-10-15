"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TooltipBox } from "./chart-tooltip";
import { CHART, LOW_VOLUME_OPACITY, pct, SERIES } from "./palette";

export interface TrendPoint {
  label: string;
  /** Taxa (0–1) ou null quando não há base de cálculo. */
  value: number | null;
  /** Volume que sustenta a taxa (ex.: "61-12/102"). */
  detail: string;
  lowVolume: boolean;
  /** Chave do recorte (ex.: id do torneio), devolvida no clique. */
  key?: string;
}

/**
 * Evolução de UMA taxa por torneio (uma série, um eixo). Duas medidas = dois gráficos, nunca eixo duplo.
 * Pontos com pouco volume ficam esmaecidos; o tooltip sempre mostra o volume.
 */
export function TrendChart({
  data,
  name,
  color = SERIES[0],
  onSelect,
}: {
  data: TrendPoint[];
  name: string;
  color?: string;
  /** Clique/toque no ponto: abre o detalhamento daquele torneio (Fase 16). */
  onSelect?: (point: TrendPoint) => void;
}) {
  const values = data.flatMap((d) => (d.value === null ? [] : [d.value]));
  const min = Math.min(0, ...values);
  return (
    <div className="h-56 w-full" role="img" aria-label={`${name} por torneio`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            domain={[min < 0 ? -1 : 0, 1]}
            tickFormatter={(v: number) => pct(v)}
            tick={{ fill: CHART.muted, fontSize: 12 }}
            stroke={CHART.axis}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { color, label: name, value: pct(p.value) },
                    { label: "Volume", value: `${p.detail}${p.lowVolume ? " (pouco volume)" : ""}` },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) =>
              props.cx === undefined || props.cy === undefined || props.payload?.value === null ? (
                <g key={props.index} />
              ) : (
                <g
                  key={props.index}
                  onClick={onSelect && props.payload ? () => onSelect(props.payload!) : undefined}
                  style={onSelect ? { cursor: "pointer" } : undefined}
                >
                  {/* Alvo de toque maior que o ponto (tablet). */}
                  {onSelect && <circle cx={props.cx} cy={props.cy} r={16} fill="transparent" />}
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={5}
                    fill={color}
                    stroke={CHART.surface}
                    strokeWidth={2}
                    opacity={props.payload?.lowVolume ? LOW_VOLUME_OPACITY : 1}
                  />
                </g>
              )
            }
            activeDot={{ r: 7, stroke: CHART.surface, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
