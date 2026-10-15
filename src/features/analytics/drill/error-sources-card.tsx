import { drillDown } from "@/domain/stats/drill";
import type { TouchFact } from "@/domain/stats/facts";
import { DrillBars } from "./drill-bars";

const GIVEN = (d: TouchFact["delta"]) => d.points_given ?? 0;

/** Maiores fontes de erro (pontos entregues), já detalhadas: o drill-down aberto, também no PDF. */
export function ErrorSourcesCard({ facts, title = "De onde vieram os erros", limit = 8 }: { facts: readonly TouchFact[]; title?: string; limit?: number }) {
  const result = drillDown(facts, GIVEN, "type", { errors: true, limit: 0 });
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4 print-card">
      <header>
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm text-zinc-400">{result.total} pontos entregues ao adversário (lance = ou ataque bloqueado)</p>
      </header>
      <DrillBars rows={result.rows.slice(0, limit)} />
    </section>
  );
}
