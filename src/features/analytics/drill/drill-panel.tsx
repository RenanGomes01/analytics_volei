"use client";

import { useEffect, useMemo, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { DIMENSION_LABEL, drillDown, ERROR_COLUMNS, type DrillDimension } from "@/domain/stats/drill";
import type { TouchFact } from "@/domain/stats/facts";
import type { StatColumn } from "@/domain/stats/stat-columns";
import { DrillBars } from "./drill-bars";

export interface DrillContext {
  /** Lances da linha (atleta, dupla ou lado da partida). */
  facts: readonly TouchFact[];
  matchLabel?: (match_id: string) => string;
  athleteLabel?: (athlete_id: string) => string;
  /** Dimensões oferecidas (padrão: todas menos "Partida" numa partida só). */
  dimensions?: DrillDimension[];
}

interface Props<L> {
  title: string;
  column: StatColumn<L>;
  value: string;
  context: DrillContext;
  onClose: () => void;
}

const DEFAULT_DIMENSIONS: DrillDimension[] = ["type", "outcome", "set", "moment", "phase", "touch", "match"];

/**
 * Drill-down de um número (Fase 15): "15 erros" → onde foram (5 saques na rede, 3 fora, 7 de ataque),
 * em que set, em que momento do set, em K1 ou K2 e em quais lances. Nada de rua sem saída.
 */
export function DrillPanel<L>({ title, column, value, context, onClose }: Props<L>) {
  const multiMatch = useMemo(() => new Set(context.facts.map((f) => f.match_id)).size > 1, [context.facts]);
  const dimensions = (context.dimensions ?? DEFAULT_DIMENSIONS).filter((d) => d !== "match" || multiMatch);
  const [dimension, setDimension] = useState<DrillDimension>("type");
  const result = useMemo(
    () =>
      drillDown(context.facts, column.drill!, dimension, {
        errors: ERROR_COLUMNS.has(column.key),
        matchLabel: context.matchLabel,
        athleteLabel: context.athleteLabel,
      }),
    [context, column, dimension],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isRate = column.format === "pct";
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

        <DrillBars rows={result.rows} />

        {result.occurrences.length > 0 && (
          <details className="rounded-2xl bg-zinc-950/60 p-3">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Em que momento do jogo ({result.total})</summary>
            <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
              {result.occurrences.map((o, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-zinc-500">Set {o.set_number} · {o.score_own}×{o.score_opp}</span>
                  <span className="flex-1">{o.label}</span>
                  {context.athleteLabel && <span className="text-zinc-400">{context.athleteLabel(o.athlete_id)}</span>}
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
