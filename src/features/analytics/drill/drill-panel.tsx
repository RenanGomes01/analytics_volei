"use client";

import { useEffect, useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { athleteLines } from "@/domain/stats/box-score";
import { DIMENSION_LABEL, drillDown, ERROR_COLUMNS, type DrillDimension, type DrillRow } from "@/domain/stats/drill";
import type { TouchFact } from "@/domain/stats/facts";
import { sortValue } from "@/domain/stats/sort";
import type { PlayerLine, StatColumn } from "@/domain/stats/stat-columns";
import type { TouchCounters } from "@/domain/stats/touch-lines";
import { pct } from "@/features/stats/format";
import { DrillBars } from "./drill-bars";

export interface DrillContext {
  /** Lances da linha (atleta, dupla ou lado da partida). */
  facts: readonly TouchFact[];
  matchLabel?: (match_id: string) => string;
  athleteLabel?: (athlete_id: string) => string;
  /** Dimensões oferecidas (padrão: todas menos "Partida" numa partida só). */
  dimensions?: DrillDimension[];
  /** Dimensão inicial (ex.: "match" no perfil, para achar o jogo do pico). */
  defaultDimension?: DrillDimension;
}

/**
 * A mesma coluna dentro de um grupo (ex.: eficiência só da partida 3), a partir dos contadores do grupo.
 * Só para colunas de atleta que leem as linhas/contadores (as de % e as de contagem).
 */
function groupValue<L>(column: StatColumn<L>, counters: TouchCounters): { text: string; sort: number | null } {
  const line = { ...athleteLines(counters), counters } as PlayerLine;
  try {
    const v = (column as unknown as StatColumn<PlayerLine>).value(line);
    const text = v === null || v === undefined ? "–" : column.format === "pct" ? pct(v as never) : String(v);
    return { text, sort: sortValue(v) };
  } catch {
    return { text: "–", sort: null };
  }
}

interface Props<L> {
  title: string;
  column: StatColumn<L>;
  value: string;
  context: DrillContext;
  onClose: () => void;
}

const DEFAULT_DIMENSIONS: DrillDimension[] = ["type", "outcome", "opponent", "set", "moment", "phase", "touch", "match"];

/**
 * Drill-down de um número (Fase 15): "15 erros" → onde foram (5 saques na rede, 3 fora, 7 de ataque),
 * em que set, em que momento do set, em K1 ou K2 e em quais lances. Nada de rua sem saída.
 */
export function DrillPanel<L>({ title, column, value, context, onClose }: Props<L>) {
  const multiMatch = useMemo(() => new Set(context.facts.map((f) => f.match_id)).size > 1, [context.facts]);
  const dimensions = (context.dimensions ?? DEFAULT_DIMENSIONS).filter((d) => d !== "match" || multiMatch);
  const [dimension, setDimension] = useState<DrillDimension>(() =>
    context.defaultDimension && dimensions.includes(context.defaultDimension) ? context.defaultDimension : "type",
  );
  const isRate = column.format === "pct";
  const result = useMemo(
    () =>
      drillDown(context.facts, column.drill!, dimension, {
        errors: ERROR_COLUMNS.has(column.key),
        matchLabel: context.matchLabel,
        athleteLabel: context.athleteLabel,
        withCounters: true,
      }),
    [context, column, dimension],
  );
  // Por partida/set/momento… a MESMA métrica em cada grupo; o maior valor é o pico.
  const valued = useMemo(() => {
    const rows = result.rows.map((r: DrillRow) => ({ ...r, value: r.counters ? groupValue(column, r.counters) : null }));
    // Pico: a taxa em qualquer recorte; em contagens, só por partida/set/momento/fase.
    const comparable = rows.length > 1 && (["match", "set", "moment", "phase"].includes(dimension) || (isRate && dimension === "opponent"));
    let peak: string | null = null;
    if (comparable) {
      let best = -Infinity;
      for (const r of rows) if (r.value?.sort !== null && r.value?.sort !== undefined && r.value.sort > best) {
        best = r.value.sort;
        peak = r.key;
      }
    }
    return { rows, peak, comparable };
  }, [result, column, dimension, isRate]);
  const showActor = useMemo(() => new Set(context.facts.map((f) => f.athlete_id)).size > 1, [context.facts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title}: ${column.full}`} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-2 sm:items-center print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5 text-zinc-100 print:max-h-none print:rounded-none" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-400">{title}</p>
            <h2 className="text-xl font-bold">{column.full}</h2>
            <p className="text-sm text-zinc-400">{column.hint}</p>
          </div>
          <p className="text-4xl font-black tabular-nums">{value}</p>
        </header>
        {isRate && (
          <p className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            Base do cálculo: <strong>{result.total}</strong> lances. O detalhamento mostra de onde eles vieram.
          </p>
        )}

        <div role="tablist" aria-label="Detalhar por" className="flex flex-wrap gap-1" data-print="hide">
          {dimensions.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={dimension === d}
              onClick={() => setDimension(d)}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${dimension === d ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
            >
              {DIMENSION_LABEL[d]}
            </button>
          ))}
        </div>

        {valued.comparable ? (
          <ul className="flex flex-col gap-1.5">
            {valued.rows.map((r) => (
              <li
                key={r.key}
                className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 rounded-lg px-2 py-1 text-sm tabular-nums ${r.key === valued.peak ? "bg-amber-400/15 ring-1 ring-amber-400/60" : ""}`}
              >
                <span className="truncate">
                  {r.key === valued.peak && <span className="mr-1 text-xs font-bold uppercase text-amber-300 print:text-black">pico</span>}
                  {r.label}
                </span>
                <strong className="text-base">{r.value?.text ?? r.count}</strong>
                <span className="w-24 text-right text-xs text-zinc-400">{isRate ? `base ${r.count}` : `${Math.round(r.share * 100)}% do total`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <DrillBars rows={result.rows} />
        )}

        {result.occurrences.length > 0 && (
          <details className="rounded-2xl bg-zinc-950/60 p-3">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Em que momento do jogo ({result.total})</summary>
            <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
              {result.occurrences.map((o, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-zinc-500">Set {o.set_number} · {o.score_own}×{o.score_opp}</span>
                  <span className="flex-1">
                    {o.label}
                    {o.duel && <span className="text-zinc-300"> — {o.duel}</span>}
                  </span>
                  {showActor && context.athleteLabel && <span className="text-zinc-400">{context.athleteLabel(o.athlete_id)}</span>}
                  {multiMatch && (
                    <HardLink href={`/match?id=${encodeURIComponent(o.match_id)}`} className="text-xs text-zinc-400 underline underline-offset-4" data-print="hide">
                      {context.matchLabel?.(o.match_id) ?? "partida"}
                    </HardLink>
                  )}
                </li>
              ))}
            </ol>
            {result.total > result.occurrences.length && <p className="mt-1 text-xs text-zinc-500">Mostrando os primeiros {result.occurrences.length}.</p>}
          </details>
        )}

        <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-zinc-800 font-semibold" data-print="hide">
          Fechar
        </button>
      </div>
    </div>
  );
}
