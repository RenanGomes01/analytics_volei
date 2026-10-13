"use client";

import { useState } from "react";
import { useStorageProtection } from "./use-storage-protection";

const size = (bytes?: number) =>
  bytes === undefined
    ? "?"
    : new Intl.NumberFormat("pt-BR", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(
        bytes / 1024 / 1024,
      );

/** Selo de proteção dos dados locais, com botão para pedir a proteção. Fica na home. */
export function StorageStatus() {
  const { status, protect } = useStorageProtection();
  const [asked, setAsked] = useState(false);
  if (!status) return null;

  const usage = `Espaço usado: ${size(status.usage)} de ${size(status.quota)}`;
  if (status.persisted) {
    return (
      <span title={usage} className="rounded-full bg-emerald-900/70 px-3 py-1 text-xs font-semibold text-emerald-100">
        🛡 Dados protegidos
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        title={usage}
        onClick={async () => {
          setAsked(true);
          await protect();
        }}
        className="min-h-10 rounded-full bg-amber-900/70 px-3 text-xs font-semibold text-amber-100"
      >
        ⚠ Dados não protegidos · Proteger
      </button>
      {asked && (
        <span className="text-xs text-zinc-400">
          {status.supported
            ? "O navegador não concedeu. No tablet, instale o app na tela de início e exporte backups."
            : "Este navegador não permite proteger. Exporte backups em JSON."}
        </span>
      )}
    </span>
  );
}
