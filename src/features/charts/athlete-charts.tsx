"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MatchEvolutionPoint } from "@/domain/stats/athlete-dashboard";
import type { Rate } from "@/domain/stats/types";
import { Legend, TooltipBox } from "./chart-tooltip";
import { CHART, LOW_VOLUME_OPACITY, pct, SERIES } from "./palette";

const HITS = SERIES[0];
const ERRORS = SERIES[1];

type BalanceSeries = "hits" | "errors";

/**
 * Barra com alvo de toque na coluna inteira (Fase 19): no tablet, uma barra de 1 erro é fina demais
 * para o dedo. O retângulo transparente cobre a faixa da barra (a `background` do Recharts).
 */
type Box = { x?: number | null; y?: number | null; width?: number | null; height?: number | null };

function TapBar(props: Box & { fill?: string; background?: Box }) {
  const { fill, background: bg } = props;
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const width = props.width ?? 0;
  const height = props.height ?? 0;
  const background = bg && bg.x != null && bg.y != null && bg.width != null && bg.height != null ? { x: bg.x, y: bg.y, width: bg.width, height: bg.height } : null;
  const r = Math.max(0, Math.min(4, width / 2, height));
  return (
    <g style={{ cursor: "pointer" }}>
      {background && <rect x={background.x} y={background.y} width={background.width} height={background.height} fill="transparent" />}
      {height > 0 && width > 0 && (
        <path d={`M${x},${y + height} v${-(height - r)} a${r},${r} 0 0 1 ${r},${-r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - r} z`} fill={fill} />
      )}
    </g>
  );
}

/**
 * Acertos × erros jogo a jogo: barras agrupadas, uma escala (contagem). Eficiência fica em outro gráfico.
 * Com `onSelect`, cada barra abre os lances daquele jogo (Fase 19).
 */
export function MatchBalanceChart({ data, onSelect }: { data: MatchEvolutionPoint[]; onSelect?: (match_id: string, series: BalanceSeries) => void }) {
  const click = (series: BalanceSeries) =>
    onSelect ? (item: { payload?: MatchEvolutionPoint }) => item.payload && onSelect(item.payload.match_id, series) : undefined;
  const tap = onSelect ? { shape: TapBar, background: { fill: "transparent" } } : {};
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[{ color: HITS, label: "Acertos" }, { color: ERRORS, label: "Erros" }]} />
      <div className="h-60 w-full" role="img" aria-label="Acertos e erros por partida">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART.muted, fontSize: 11 }} stroke={CHART.axis} tickLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} width={32} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as MatchEvolutionPoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <TooltipBox
                    title={`${p.label}${p.won === null ? "" : p.won ? " · vitória" : " · derrota"}`}
                    rows={[
                      { color: HITS, label: "Acertos", value: p.hits },
                      { color: ERRORS, label: "Erros", value: p.errors },
                      { label: "Saldo", value: `${p.hits - p.errors > 0 ? "+" : ""}${p.hits - p.errors}` },
                      ...(p.tournament ? [{ label: "Torneio", value: p.tournament }] : []),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="hits" name="Acertos" fill={HITS} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} onClick={click("hits")} {...tap} />
            <Bar dataKey="errors" name="Erros" fill={ERRORS} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} onClick={click("errors")} {...tap} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface CompareRow {
  label: string;
  scope: Rate;
  season: Rate;
}

const SCOPE = SERIES[0];
const SEASON = SERIES[2];
const MIN = 5;

/** Recorte (torneio) × temporada inteira, métrica a métrica: barras horizontais, mesma escala (%). */
export function CompareRatesChart({ data, scopeLabel }: { data: CompareRow[]; scopeLabel: string }) {
  const rows = data.map((d) => ({ ...d, a: d.scope.pct, b: d.season.pct }));
  return (
    <div className="flex flex-col gap-2">
      <Legend items={[{ color: SCOPE, label: scopeLabel }, { color: SEASON, label: "Temporada inteira" }]} />
      <div className="w-full" style={{ height: 56 * rows.length + 24 }} role="img" aria-label={`${scopeLabel} comparado com a temporada`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }} barGap={2}>
            <CartesianGrid stroke={CHART.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => pct(v)} tick={{ fill: CHART.muted, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fill: CHART.textSecondary, fontSize: 12 }} stroke={CHART.axis} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as CompareRow | undefined) : undefined;
                if (!r) return null;
                const fmt = (x: Rate) => `${pct(x.pct)} (${x.num}/${x.den})${x.den < MIN ? " · pouco volume" : ""}`;
                return (
                  <TooltipBox
                    title={r.label}
                    rows={[
                      { color: SCOPE, label: scopeLabel, value: fmt(r.scope) },
                      { color: SEASON, label: "Temporada", value: fmt(r.season) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="a" fill={SCOPE} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} shape={dimmed("scope")} />
            <Bar dataKey="b" fill={SEASON} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} shape={dimmed("season")} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Barra com pouco volume esmaecida (nunca escondida). */
function dimmed(key: "scope" | "season") {
  function DimmedBar(props: { x?: number; y?: number; width?: number; height?: number; fill?: string; payload?: CompareRow }) {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
    if (width <= 0) return <g />;
    const r = Math.min(4, height / 2, width);
    const low = (payload?.[key].den ?? 0) < MIN;
    return (
      <path
        d={`M${x},${y} h${width - r} a${r},${r} 0 0 1 ${r},${r} v${height - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(width - r)} z`}
        fill={fill}
        opacity={low ? LOW_VOLUME_OPACITY : 1}
      />
    );
  }
  return DimmedBar;
}
