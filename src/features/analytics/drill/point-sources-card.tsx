import { pointSources, type PointSourceKey } from "@/domain/stats/point-sources";
import { causeRows, type RallyFact } from "@/domain/stats/rally-facts";
import { DrillBars } from "./drill-bars";

/** "Qual fundamento mais pontuou": barras por fonte, com a dominante em destaque. */
export function PointSourcesCard({
  title = "Origem dos pontos",
  points,
  rallies,
}: {
  title?: string;
  points: Partial<Record<PointSourceKey, number>>;
  /** Ralis ganhos: detalha cada fonte pelo mérito ("Explorou o bloqueio", "Largada de segunda"…). */
  rallies?: readonly RallyFact[];
}) {
  const ps = pointSources(points);
  const top = ps.sources.find((s) => s.key === ps.dominant);
  const max = Math.max(1, ...ps.sources.map((s) => s.count));
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 print-card">
      <header>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-zinc-400">
          {ps.total} pontos{top ? <> · mais pontuou com <strong className="text-amber-300 print:text-black">{top.label.toLowerCase()}</strong> ({Math.round(top.share * 100)}%)</> : null}
        </p>
      </header>
      <ul className="flex flex-col gap-1.5">
        {ps.sources.map((s) => (
          <li key={s.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm tabular-nums">
            <span className={s.key === ps.dominant ? "font-bold" : ""}>{s.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-zinc-800 print-track">
              <span className={`block h-full rounded-full ${s.key === ps.dominant ? "bg-amber-400 print-bar-strong" : "bg-zinc-500 print-bar"}`} style={{ width: `${(s.count / max) * 100}%` }} />
            </span>
            <span className="text-right">
              <strong>{s.count}</strong> <span className="text-xs text-zinc-400">{Math.round(s.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      {rallies && rallies.length > 0 && (
        <details className="rounded-xl bg-zinc-950/50 p-2" open>
          <summary className="min-h-10 cursor-pointer content-center text-sm font-semibold">Como cada ponto saiu</summary>
          <DrillBars rows={causeRows(rallies, "merit").map((r) => ({ key: r.code, label: r.label, count: r.count, share: r.share }))} />
        </details>
      )}
    </section>
  );
}
