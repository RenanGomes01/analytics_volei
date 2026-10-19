import { causeRows, concededByAthlete, type CauseRow, type RallyFact } from "@/domain/stats/rally-facts";
import type { DrillRow } from "@/domain/stats/drill";
import { DrillBars } from "./drill-bars";

const rowsOf = (rows: CauseRow[], total: number, nameOf?: (id: string) => string) =>
  rows.map((r) => ({
    key: r.code,
    label: nameOf && r.leader ? `${r.label} · ${nameOf(r.leader.athlete_id)}${r.leader.count < r.count ? ` (${r.leader.count})` : ""}` : r.label,
    count: r.count,
    share: total ? r.count / total : 0,
  }));

/**
 * Pontos cedidos: de onde vieram (Fase 16). Lê os MESMOS fatos de rali da origem dos pontos do
 * adversário, pelo lado de quem perdeu — se ele "explorou o bloqueio" 4 vezes, aqui aparece
 * "Bloqueio explorado 4". Separa o que foi erro próprio do que foi mérito do adversário.
 */
export function ConcededCard({
  rallies,
  title = "Pontos cedidos: de onde vieram",
  nameOf,
  athleteView = false,
  limit = 8,
  onSelectRow,
}: {
  /** Ralis perdidos (já recortados: a dupla, o lado da partida ou a atleta culpada). */
  rallies: readonly RallyFact[];
  title?: string;
  nameOf?: (id: string) => string;
  /** Cartão de UMA atleta: os pontos em que ela foi a culpada (não mostra "da dupla"). */
  athleteView?: boolean;
  limit?: number;
  /** Toque numa causa: abre jogo e placar de cada ponto cedido (Fase 19). A chave é o `RallyFact.code`. */
  onSelectRow?: (row: DrillRow) => void;
}) {
  const total = rallies.length;
  const own = rallies.filter((f) => f.fault === "own");
  const merit = rallies.filter((f) => f.fault === "opponent");
  const none = rallies.filter((f) => f.fault === "none").length;
  const { unattributed } = concededByAthlete(rallies);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4 print-card">
      <header>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-zinc-400">
          {total} {total === 1 ? "ponto cedido" : "pontos cedidos"} ao adversário · {own.length} por erro próprio · {merit.length} por mérito do adversário
          {none ? ` · ${none} sem detalhe` : ""}
        </p>
      </header>
      {own.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-red-300 print:text-black">Erros próprios</h4>
          <DrillBars rows={rowsOf(causeRows(own, "conceded"), total, nameOf).slice(0, limit)} onSelect={onSelectRow} />
        </div>
      )}
      {merit.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300 print:text-black">Mérito do adversário</h4>
          <DrillBars rows={rowsOf(causeRows(merit, "conceded"), total, nameOf).slice(0, limit)} onSelect={onSelectRow} />
        </div>
      )}
      {total === 0 && <p className="text-sm text-zinc-500">Nenhum ponto cedido neste recorte.</p>}
      {!athleteView && unattributed > 0 && total > 0 && (
        <p className="text-xs text-zinc-500">
          {unattributed} {unattributed === 1 ? "ponto não aponta" : "pontos não apontam"} uma atleta (ex.: ataque adversário sem toque de defesa registrado): contam só para a dupla.
        </p>
      )}
    </section>
  );
}
