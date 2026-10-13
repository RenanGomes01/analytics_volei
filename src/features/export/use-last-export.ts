"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDB } from "@/db/client";
import { getLastExport } from "@/services/export/export-service";

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function ago(at: number, now: number): string {
  const minutes = Math.round((at - now) / 60_000);
  if (minutes === 0) return "agora mesmo";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

/** Último backup exportado desta partida, com rótulo relativo que se atualiza sozinho. */
export function useLastExport(matchId: string) {
  const last = useLiveQuery(() => getLastExport(getDB(), matchId), [matchId]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (last === undefined) return { loaded: false, hasBackup: false, label: "" };
  if (!last) return { loaded: true, hasBackup: false, label: "Sem backup ainda" };
  return { loaded: true, hasBackup: true, label: `Último backup: ${ago(last.at, Math.max(now, last.at))}` };
}
