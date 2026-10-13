"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { exportMatch, markExported } from "@/services/export/export-service";
import { deliverFile } from "./deliver-file";
import { useLastExport } from "./use-last-export";

interface Props {
  matchId: string;
  /** Na lista da home: botão menor, sem o rótulo de último backup. */
  compact?: boolean;
}

export function ExportButton({ matchId, compact = false }: Props) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const last = useLastExport(matchId);

  async function run() {
    setState({ busy: true, error: null });
    try {
      const db = getDB();
      const { json, filename, envelope } = await exportMatch(db, { tenant_id: LOCAL_TENANT_ID, match_id: matchId });
      const outcome = await deliverFile(json, filename);
      if (outcome !== "cancelled") {
        await markExported(db, matchId, { at: Date.now(), content_hash: envelope.integrity.content_hash });
      }
      setState({ busy: false, error: null });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-col items-end"}`}>
      <button
        type="button"
        onClick={run}
        disabled={state.busy}
        title="Exportar a partida completa em JSON assinado"
        className={`min-h-12 rounded-xl bg-zinc-100 px-4 font-semibold text-zinc-950 disabled:opacity-50 ${
          compact ? "min-w-12" : ""
        }`}
      >
        {state.busy ? "Exportando…" : compact ? "⇩ JSON" : "⇩ Exportar JSON"}
      </button>
      {!compact && last.loaded && (
        <span className={`text-xs ${last.hasBackup ? "text-zinc-400" : "text-amber-400"}`}>{last.label}</span>
      )}
      {state.error && (
        <span role="alert" className="text-xs text-red-400">
          Falha ao exportar: {state.error}
        </span>
      )}
    </div>
  );
}
