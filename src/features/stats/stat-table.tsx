"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { sortByColumn, type SortDir } from "@/domain/stats/sort";
import { GROUP_LABEL, groupSpans, type StatColumn } from "@/domain/stats/stat-columns";
import type { Rate } from "@/domain/stats/types";
import { DrillPanel, type DrillContext } from "@/features/analytics/drill/drill-panel";
import { pct } from "./format";

export interface StatRow<L> {
  key: string;
  label: ReactNode;
  /** Linha secundária sob o nome (ex.: a dupla daquele torneio). */
  sub?: ReactNode;
  /** Nome em texto (título do drill-down e desempate da ordenação). */
  name?: string;
  line: L;
}

interface Props<L> {
  columns: readonly StatColumn<L>[];
  rows: readonly StatRow<L>[];
  /** Linha de total (ex.: a equipe, ou a temporada). */
  total?: StatRow<L>;
  firstHeader: string;
  caption?: ReactNode;
  minWidth?: number;
  /** Drill-down (Fase 15): os lances da linha. Sem isto, as células não abrem. */
  drill?: (row: StatRow<L>) => DrillContext | null;
  /** Ordenação por coluna (construtor de relatórios). O clique no cabeçalho ordena. */
  sort?: { key: string; dir: SortDir };
  onSort?: (key: string) => void;
}

export function formatStat<L>(col: StatColumn<L>, line: L): string {
  const v = col.value(line);
  if (v === null || v === undefined) return "–";
  if (col.format === "pct") return pct(v as Rate | number);
  return String(v);
}

type Tip = { key: string; full: string; hint: string; x: number; y: number; pinned: boolean };

/**
 * Tabela de estatísticas com cabeçalho por fundamento, colunas de total destacadas e o significado
 * de cada sigla no mouse (dica) ou no toque (abre/fecha). Siglas e textos vêm de stat-columns.ts.
 */
export function StatTable<L>({ columns, rows, total, firstHeader, caption, minWidth = 720, drill, sort, onSort }: Props<L>) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [legend, setLegend] = useState(false);
  const [open, setOpen] = useState<{ row: StatRow<L>; col: StatColumn<L> } | null>(null);
  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const shown = useMemo(() => {
    if (!sort || !sortCol) return rows;
    const byLine = sortByColumn(rows.map((r) => r.line), sortCol, sort.dir);
    const order = new Map(byLine.map((l, i) => [l, i]));
    return [...rows].sort((a, b) => order.get(a.line)! - order.get(b.line)! || (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
  }, [rows, sort, sortCol]);
  const openContext = open ? drill?.(open.row) : null;

  // Toque fora (ou rolar a tabela) fecha a dica fixada.
  useEffect(() => {
    if (!tip?.pinned) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-stat-key]")) setTip(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [tip?.pinned]);

  const show = (col: StatColumn<L>, el: HTMLElement, pinned: boolean) => {
    const r = el.getBoundingClientRect();
    setTip({ key: col.key, full: col.full, hint: col.hint, x: Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140), y: r.bottom + 6, pinned });
  };

  const cell = (col: StatColumn<L>) =>
    sort?.key === col.key && onSort ? "bg-sky-400/15 font-bold text-zinc-50" : col.total ? "bg-amber-400/10 font-bold text-zinc-50" : "";

  const bodyRow = (row: StatRow<L>, isTotal = false) => (
    <tr key={row.key} className={isTotal ? "border-t-2 border-zinc-700 font-semibold" : "odd:bg-zinc-900/60"}>
      <th scope="row" className="sticky left-0 z-10 bg-zinc-950 py-2.5 pr-3 text-left font-medium">
        {row.label}
        {row.sub && <span className="block text-xs font-normal text-zinc-400">{row.sub}</span>}
      </th>
      {columns.map((c) => {
        const text = formatStat(c, row.line);
        const canDrill = !!drill && !!c.drill && text !== "–" && text !== "0";
        return (
          <td key={c.key} className={`px-1 py-1 ${cell(c)}`}>
            {canDrill ? (
              <button
                type="button"
                onClick={() => setOpen({ row, col: c })}
                aria-label={`${text} — detalhar ${c.full}`}
                className="min-h-11 min-w-11 rounded-lg px-1 underline decoration-amber-400/40 decoration-dotted underline-offset-4 hover:bg-zinc-800 print:no-underline"
              >
                {text}
              </button>
            ) : (
              <span className="inline-block min-h-11 content-center px-1">{text}</span>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-right tabular-nums" style={{ minWidth }}>
          {caption && <caption className="pb-2 text-left text-sm font-semibold uppercase tracking-wide text-zinc-400">{caption}</caption>}
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="sticky left-0 z-10 bg-zinc-950" />
              {groupSpans(columns).map((g, i) => (
                <th key={`${g.group}-${i}`} colSpan={g.span} scope="colgroup" className="border-b border-zinc-800 px-2 pb-1 text-center font-semibold">
                  {GROUP_LABEL[g.group]}
                </th>
              ))}
            </tr>
            <tr className="text-xs uppercase text-zinc-400">
              <th scope="col" className="sticky left-0 z-10 bg-zinc-950 py-2 pr-3 text-left">
                {firstHeader}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-1 py-1 ${c.total ? "bg-amber-400/10 text-amber-200" : ""}`}>
                  <button
                    type="button"
                    data-stat-key={c.key}
                    aria-expanded={tip?.key === c.key && tip.pinned}
                    aria-label={`${c.short}: ${c.full}`}
                    onMouseEnter={(e) => !tip?.pinned && show(c, e.currentTarget, false)}
                    onMouseLeave={() => !tip?.pinned && setTip(null)}
                    onClick={(e) => (onSort ? onSort(c.key) : tip?.key === c.key && tip.pinned ? setTip(null) : show(c, e.currentTarget, true))}
                    aria-sort={sort?.key === c.key ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
                    className="min-h-11 min-w-11 cursor-help rounded-lg px-1 underline decoration-dotted decoration-zinc-600 underline-offset-4 hover:text-zinc-100"
                  >
                    <abbr title={c.full} className="no-underline">
                      {c.short}
                    </abbr>
                    {sort?.key === c.key && <span aria-hidden="true">{sort.dir === "desc" ? " ↓" : " ↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => bodyRow(r))}
            {total && bodyRow(total, true)}
          </tbody>
        </table>
      </div>

      {open && openContext && (
        <DrillPanel
          title={open.row.name ?? ""}
          column={open.col}
          value={formatStat(open.col, open.row.line)}
          context={openContext}
          onClose={() => setOpen(null)}
        />
      )}

      <button type="button" aria-expanded={legend} onClick={() => setLegend(!legend)} data-print="hide" className="min-h-11 self-start rounded-xl px-2 text-sm text-zinc-400 underline-offset-4 hover:underline">
        📖 {legend ? "Ocultar legenda" : "Legenda das siglas"}
      </button>
      {legend && (
        <dl className="grid gap-x-4 gap-y-1 rounded-2xl bg-zinc-900 p-3 text-sm sm:grid-cols-2">
          {columns.map((c) => (
            <div key={c.key} className="flex gap-2">
              <dt className={`w-14 shrink-0 font-bold ${c.total ? "text-amber-200" : ""}`}>{c.short}</dt>
              <dd className="text-zinc-300">
                <span className="font-semibold text-zinc-100">{c.full}</span> — {c.hint}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[60] w-64 -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-left text-sm shadow-xl"
          style={{ left: tip.x, top: tip.y }}
        >
          <p className="font-bold text-zinc-50">{tip.full}</p>
          <p className="text-zinc-300">{tip.hint}</p>
        </div>
      )}
    </div>
  );
}
