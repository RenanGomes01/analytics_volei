import { mirrorRows, type RallyFact } from "@/domain/stats/rally-facts";
import type { TeamSide } from "@/domain/types";

/**
 * Espelho tático da partida (Fase 16): cada ponto de uma dupla na mesma linha de como a outra o
 * cedeu ("Explorou o bloqueio 4 ↔ Bloqueio explorado"). Ação e reação, lado a lado.
 */
export function MirrorCard({ rallies, match_id, teamName }: { rallies: readonly RallyFact[]; match_id: string; teamName: (t: TeamSide) => string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4 print-card">
      <header>
        <h3 className="font-bold">Espelho tático</h3>
        <p className="text-sm text-zinc-400">Cada ponto de uma dupla é um ponto cedido pela outra: o mérito de um lado aparece como vulnerabilidade do outro.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as const).map((w) => {
          const l: TeamSide = w === "A" ? "B" : "A";
          const rows = mirrorRows(rallies, { match_id, team: w });
          return (
            <div key={w} className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold">
                Pontos de {teamName(w)} <span className="text-zinc-400">→ cedidos por {teamName(l)}</span>
              </h4>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs uppercase text-zinc-500">
                    <th className="py-1 font-semibold">{teamName(w)} fez</th>
                    <th className="w-10 text-center font-semibold">Qtd</th>
                    <th className="py-1 font-semibold">{teamName(l)} cedeu</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code} className="border-t border-zinc-800">
                      <td className="py-1.5 pr-2">{r.merit}</td>
                      <td className="text-center font-bold">{r.count}</td>
                      <td className={`py-1.5 pl-2 ${r.fault === "own" ? "text-red-300" : "text-sky-300"} print:text-black`}>
                        {r.conceded} <span className="text-xs text-zinc-500">{r.fault === "own" ? "(erro próprio)" : r.fault === "opponent" ? "(mérito do adversário)" : ""}</span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-zinc-500">Nenhum ponto ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
