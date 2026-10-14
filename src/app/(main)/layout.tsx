import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { NetworkBanner } from "@/features/network/network-banner";

/**
 * Telas com navegação global (cabeçalho + faixa de conexão). O scout (/match) fica fora deste grupo:
 * tela cheia, sem scroll e sem avisos de rede. O grupo "(main)" não entra na URL.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      <NetworkBanner />
      {children}
    </div>
  );
}
