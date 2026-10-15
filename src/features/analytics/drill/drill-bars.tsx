import type { DrillRow } from "@/domain/stats/drill";

/** Barras horizontais em CSS puro (sem Recharts): contagem, % do total e a barra proporcional. */
export function DrillBars({ rows, unit = "" }: { rows: readonly DrillRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-zinc-500">Nenhum lance neste recorte.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm tabular-nums">
          <span className="truncate">{r.label}</span>
          <span className="font-bold">
            {r.count}
            {unit}
            <span className="ml-1 text-xs font-normal text-zinc-400">{Math.round(r.share * 100)}%</span>
          </span>
          <span className="col-span-2 h-2 overflow-hidden rounded-full bg-zinc-800 print-track">
            <span className="block h-full rounded-full bg-amber-400 print-bar" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
