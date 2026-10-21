import { pointSources, type PointSourceKey } from "@/domain/stats/point-sources";
import type { DrillRow } from "@/domain/stats/drill";
import { causeRows, type RallyFact } from "@/domain/stats/rally-facts";
import { scoredTone, sourceTone } from "@/domain/stats/point-tone";
import { TONE } from "@/features/charts/palette";
import { DrillBars, ToneLegend, type ToneRow } from "./drill-bars";

/** "Qual fundamento mais pontuou": barras por fonte, com a dominante em destaque. */
export function PointSourcesCard({
  title = "Origem dos pontos",
  points,
  rallies,
  rows,
  onSelectRow,
}: {
  title?: string;
  points: Partial<Record<PointSourceKey, number>>;
  /** Dupla: ralis ganhos, detalhados pelo mérito (somam o placar). */
  rallies?: readonly RallyFact[];
  /** Atleta: linhas prontas da mesma fonte do total (`scoredBreakdown`), que somam os pontos dela. */
  rows?: readonly DrillRow[];
  /** Toque numa linha de "Como cada ponto saiu": abre jogo e placar de cada ponto (Fase 19). */
  onSelectRow?: (row: DrillRow) => void;
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
              <span className={`block h-full rounded-full ${TONE[sourceTone(s.key)].bar} ${TONE[sourceTone(s.key)].print}`} style={{ width: `${(s.count / max) * 100}%` }} />
            </span>
            <span className="text-right">
              <strong>{s.count}</strong> <span className="text-xs text-zinc-400">{Math.round(s.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <ToneLegend tones={ps.sources.filter((s) => s.count > 0).map((s) => sourceTone(s.key))} />
      {(() => {
        // Atleta: só ataque, ace e bloqueio (tudo mérito). Dupla: o tom sai do grupo do placar.
        const detail: ToneRow[] | null = rows
          ? rows.map((r) => ({ ...r, tone: "merit" }))
          : rallies
            ? causeRows(rallies, "merit").map((r) => ({ key: r.code, label: r.label, count: r.count, share: r.share, tone: scoredTone(r.group, r.fault) }))
            : null;
        if (!detail || detail.length === 0) return null;
        const sum = detail.reduce((n, r) => n + r.count, 0);
        return (
          <details className="rounded-xl bg-zinc-950/50 p-2" open>
            <summary className="min-h-10 cursor-pointer content-center text-sm font-semibold">
              Como cada ponto saiu <span className="font-normal text-zinc-400">({sum} {sum === 1 ? "ponto" : "pontos"})</span>
            </summary>
            <div className="flex flex-col gap-2 pt-1">
              <ToneLegend tones={detail.map((r) => r.tone!)} />
              <DrillBars rows={detail} onSelect={onSelectRow} />
            </div>
          </details>
        );
      })()}
    </section>
  );
}
