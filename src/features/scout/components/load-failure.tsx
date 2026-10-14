"use client";

import { useEffect, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { reopenDB } from "@/db/client";
import { collectLoadDiagnostics, type DiagnosticLine } from "../load-diagnostics";

interface Props {
  matchId: string;
  title: string;
  /** Mensagem real do erro, quando houve um. */
  error?: string | null;
  elapsedMs: number;
}

/**
 * A partida não abriu (erro ou demora): mostra o motivo real e um diagnóstico do banco local, em vez
 * de "Carregando…" para sempre. "Recarregar banco de dados local" só reabre a conexão: não apaga nada.
 */
export function LoadFailure({ matchId, title, error, elapsedMs }: Props) {
  const [lines, setLines] = useState<DiagnosticLine[] | null>(null);

  useEffect(() => {
    let alive = true;
    void collectLoadDiagnostics(matchId, elapsedMs).then((l) => alive && setLines(l));
    return () => {
      alive = false;
    };
  }, [matchId, elapsedMs]);

  return (
    <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-4 overflow-y-auto bg-zinc-950 p-6 text-center text-zinc-100">
      <h1 className="text-2xl font-bold">{title}</h1>
      {error && <p className="max-w-xl rounded-xl bg-red-900/70 px-4 py-3 font-mono text-sm text-red-100">{error}</p>}
      <dl className="grid w-full max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-zinc-900 p-4 text-left text-sm">
        {lines === null ? (
          <dd className="col-span-2 text-zinc-400">Verificando o banco local…</dd>
        ) : (
          lines.map((l) => (
            <div key={l.label} className="contents">
              <dt className="text-zinc-400">{l.label}</dt>
              <dd className="break-words">{l.value}</dd>
            </div>
          ))
        )}
      </dl>
      <p className="max-w-xl text-sm text-zinc-400">
        Seus lances ficam salvos neste aparelho. Recarregar o banco só reabre a conexão: nada é apagado. Se continuar,
        feche as outras abas ou janelas do Scout e tente de novo.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reopenDB} className="min-h-14 rounded-2xl bg-amber-400 px-5 font-bold text-zinc-950">
          Recarregar banco de dados local
        </button>
        <HardLink href="/" className="min-h-14 content-center rounded-2xl bg-zinc-800 px-5 font-semibold">
          Voltar às partidas
        </HardLink>
      </div>
    </div>
  );
}
