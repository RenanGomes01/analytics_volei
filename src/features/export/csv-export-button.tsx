"use client";

import { useState } from "react";
import { boxScoreCsvFilename, boxScoreToCsv } from "@/domain/export/box-score-csv";
import type { BoxScore, StatsFilter } from "@/domain/stats/types";
import type { Athlete, Match } from "@/domain/types";
import { deliverFile } from "./deliver-file";

interface Props {
  box: BoxScore;
  match: Match;
  athletes: Map<string, Athlete>;
  filter: StatsFilter;
}

/** Baixa o Box Score do filtro atual (Jogo ou Set N) em CSV para Excel. */
export function CsvExportButton({ box, match, athletes, filter }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const csv = boxScoreToCsv({ box, match, athletes, filter });
      await deliverFile(csv, boxScoreCsvFilename(match, filter, Date.now()), "text/csv;charset=utf-8");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        title="Box Score do filtro atual em CSV (Excel)"
        className="min-h-12 rounded-xl bg-emerald-200 px-4 font-semibold text-emerald-950"
      >
        ⇩ CSV
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          Falha ao gerar CSV: {error}
        </span>
      )}
    </div>
  );
}
