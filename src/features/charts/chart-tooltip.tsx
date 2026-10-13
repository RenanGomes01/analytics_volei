"use client";

import type { ReactNode } from "react";
import { CHART } from "./palette";

/** Caixa de tooltip comum: texto em tinta neutra, a cor da série só no marcador. */
export function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: ReactNode }[] }) {
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.12)", color: CHART.textPrimary }} className="rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 tabular-nums" style={{ color: CHART.textSecondary }}>
          {r.color && <span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} />}
          <span>{r.label}:</span>
          <span style={{ color: CHART.textPrimary }}>{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Legenda HTML (sempre presente com ≥ 2 séries). */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: CHART.textSecondary }}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
