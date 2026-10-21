import type { DrillRow } from "@/domain/stats/drill";
import type { PointTone } from "@/domain/stats/point-tone";
import { TONE } from "@/features/charts/palette";

/** Linha com o tom semântico do ponto (Fase 21); sem tom, a barra fica na cor principal. */
export type ToneRow = DrillRow & { tone?: PointTone };

/** Legenda dos tons presentes (a cor nunca fica sozinha). */
export function ToneLegend({ tones }: { tones: readonly PointTone[] }) {
  const unique = [...new Set(tones)];
  if (unique.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400" aria-label="Legenda das cores">
      {unique.map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-sm ${TONE[t].bar} ${TONE[t].print}`} />
          {TONE[t].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Barras horizontais em CSS puro (sem Recharts): contagem, % do total e a barra proporcional.
 * Com `onSelect`, cada linha vira botão (Fase 19): abre os lances com jogo e placar.
 */
export function DrillBars({ rows, unit = "", onSelect }: { rows: readonly ToneRow[]; unit?: string; onSelect?: (row: DrillRow) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-zinc-500">Nenhum lance neste recorte.</p>;
  const body = (r: ToneRow) => (
    <>
      <span className={`truncate ${onSelect ? "underline decoration-amber-400/40 decoration-dotted underline-offset-4 print:no-underline" : ""}`}>{r.label}</span>
      <span className="font-bold">
        {r.count}
        {unit}
        <span className="ml-1 text-xs font-normal text-zinc-400">{Math.round(r.share * 100)}%</span>
      </span>
      <span className="col-span-2 h-2 overflow-hidden rounded-full bg-zinc-800 print-track">
        <span className={`block h-full rounded-full ${r.tone ? `${TONE[r.tone].bar} ${TONE[r.tone].print}` : "bg-amber-400 print-bar"}`} style={{ width: `${(r.count / max) * 100}%` }} />
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
