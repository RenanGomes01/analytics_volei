import type { DrillRow } from "@/domain/stats/drill";

/**
 * Barras horizontais em CSS puro (sem Recharts): contagem, % do total e a barra proporcional.
 * Com `onSelect`, cada linha vira botão (Fase 19): abre os lances com jogo e placar.
 */
export function DrillBars({ rows, unit = "", onSelect }: { rows: readonly DrillRow[]; unit?: string; onSelect?: (row: DrillRow) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-zinc-500">Nenhum lance neste recorte.</p>;
  const body = (r: DrillRow) => (
    <>
      <span className={`truncate ${onSelect ? "underline decoration-amber-400/40 decoration-dotted underline-offset-4 print:no-underline" : ""}`}>{r.label}</span>
      <span className="font-bold">
        {r.count}
        {unit}
        <span className="ml-1 text-xs font-normal text-zinc-400">{Math.round(r.share * 100)}%</span>
      </span>
      <span className="col-span-2 h-2 overflow-hidden rounded-full bg-zinc-800 print-track">
        <span className="block h-full rounded-full bg-amber-400 print-bar" style={{ width: `${(r.count / max) * 100}%` }} />
      </span>
    </>
  );
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) =>
        onSelect ? (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              aria-label={`${r.label}: ${r.count} — ver em quais jogos e placares`}
              className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1 text-left text-sm tabular-nums hover:bg-zinc-800/70"
            >
              {body(r)}
            </button>
          </li>
        ) : (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm tabular-nums">
            {body(r)}
          </li>
        ),
      )}
    </ul>
  );
}
