"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HardLink } from "@/components/hard-link";
import { useOnline } from "@/features/network/use-network";
import { SYNC_MODE } from "@/features/sync/sync-config";
import { useSyncStatus } from "@/features/sync/use-sync-status";
import { useStaffMode, writeStaffMode } from "@/features/staff/staff-mode";

const LINKS: { href: string; label: string; match: (path: string) => boolean }[] = [
  { href: "/", label: "Partidas", match: (p) => p === "/" || p.startsWith("/tournament") || p.startsWith("/new") },
  { href: "/rankings", label: "Rankings", match: (p) => p.startsWith("/rankings") || p.startsWith("/athlete") || p.startsWith("/team") },
  { href: "/roster", label: "Atletas e duplas", match: (p) => p.startsWith("/roster") },
  { href: "/account", label: "Nuvem", match: (p) => p.startsWith("/account") },
  { href: "/import", label: "Importar", match: (p) => p.startsWith("/import") },
];

/** Modo comissão técnica: só análise (sem scout, cadastro, importação nem nuvem). */
const STAFF_LINKS: typeof LINKS = [
  { href: "/staff", label: "Comissão técnica", match: (p) => p.startsWith("/staff") || p.startsWith("/tournament") },
  { href: "/rankings", label: "Rankings e relatórios", match: (p) => p.startsWith("/rankings") || p.startsWith("/athlete") || p.startsWith("/team") },
];

type Dot = { tone: string; label: string } | null;

/** Ponto de status no item "Nuvem": verde ok, âmbar pendente/sem rede, vermelho com recusa. */
function useCloudDot(): Dot {
  const status = useSyncStatus();
  const online = useOnline();
  if (SYNC_MODE === "off" || !status) return null;
  if (status.conflicts > 0) return { tone: "bg-red-500", label: "itens recusados pela nuvem" };
  if (!online) return { tone: "bg-amber-400", label: "sem internet" };
  if (status.pending > 0 || status.blocked) return { tone: "bg-amber-400", label: `${status.pending} na fila` };
  return { tone: "bg-emerald-400", label: "sincronizado" };
}

function NavLinks({ path, dot, vertical }: { path: string; dot: Dot; vertical?: boolean }) {
  const staff = useStaffMode();
  return (
    <>
      {(staff ? STAFF_LINKS : LINKS).map(({ href, label, match }) => {
        const active = match(path);
        return (
          <HardLink
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-xl px-3 font-semibold ${vertical ? "min-h-14 text-lg" : "min-h-12"} ${
              active ? "bg-zinc-800 text-amber-300" : "text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            {label}
            {href === "/account" && dot && <span className={`size-2.5 rounded-full ${dot.tone}`} aria-label={dot.label} title={dot.label} />}
          </HardLink>
        );
      })}
    </>
  );
}

/** Cabeçalho de todas as telas (menos o scout): navegação sempre à vista e "+ Nova partida". */
export function AppHeader() {
  const path = usePathname();
  const dot = useCloudDot();
  const [open, setOpen] = useState(false);
  const staff = useStaffMode();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header data-print="hide" className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-2">
        <HardLink href={staff ? "/staff" : "/"} className="mr-2 min-h-12 content-center text-xl font-bold tracking-tight">
          🏐 Scout Vôlei
        </HardLink>
        <nav aria-label="Principal" className="hidden flex-1 items-center gap-1 md:flex">
          <NavLinks path={path} dot={dot} />
        </nav>
        <span className="flex-1 md:hidden" />
        {staff ? (
          <button type="button" onClick={() => writeStaffMode(false)} className="min-h-12 rounded-xl bg-zinc-800 px-4 font-semibold text-zinc-200">
            Sair do modo comissão
          </button>
        ) : (
          <HardLink href="/new" className="min-h-12 content-center rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">
            + Nova partida
          </HardLink>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="relative min-h-12 min-w-12 rounded-xl bg-zinc-800 text-2xl md:hidden"
        >
          ☰{dot && <span className={`absolute right-2 top-2 size-2.5 rounded-full ${dot.tone}`} aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <nav aria-label="Principal" className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col gap-1 bg-zinc-950 p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold">Menu</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="min-h-12 min-w-12 rounded-xl bg-zinc-800 text-xl">
                ✕
              </button>
            </div>
            <NavLinks path={path} dot={dot} vertical />
          </nav>
        </div>
      )}
    </header>
  );
}
