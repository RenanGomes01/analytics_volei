"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { useStaffMode, writeStaffMode } from "./staff-mode";

/** Telas de edição (partidas, cadastro, importação): no modo comissão, levam para a análise. */
export function StaffGuard({ children }: { children: ReactNode }) {
  const staff = useStaffMode();
  if (!staff) return <>{children}</>;
  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <EmptyState
        icon="📊"
        title="Modo comissão técnica: esta tela é de edição."
        primary={{ label: "Ir para a comissão técnica", href: "/staff" }}
        secondary={{ label: "Sair do modo comissão", onClick: () => writeStaffMode(false) }}
      >
        Neste aparelho ficam só as análises (temporada, torneios, atletas e relatórios).
      </EmptyState>
    </div>
  );
}
