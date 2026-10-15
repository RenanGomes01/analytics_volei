"use client";

import { useMemo } from "react";
import { HardLink } from "@/components/hard-link";
import { availableYears, filterSeason, seasonStats } from "@/domain/stats/season";
import { athleteHref, Card, EntityLink } from "@/features/analytics/ui";
import { useSeasonData } from "@/features/analytics/use-season-data";
import { useRosterData } from "@/features/roster/use-roster-data";
import { useStaffMode, writeStaffMode } from "./staff-mode";

const brDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Entrada da comissão técnica (Fase 15): temporada, torneios, atletas e relatórios — só leitura.
 * Os dados são os DESTE aparelho; no aparelho da comissão eles chegam pela nuvem (mesma conta) ou
 * pelo PDF exportado de qualquer tela de análise.
 */
export function StaffScreen() {
  const staff = useStaffMode();
  const season = useSeasonData();
  const roster = useRosterData();
  const year = season ? availableYears(season.matches)[0] : undefined;
  const totals = useMemo(() => {
    if (!season || year === undefined) return null;
    return seasonStats(filterSeason(season.matches, { year, includeFriendlies: true }), season.aliases).totals;
  }, [season, year]);

  const tournaments = [...(roster?.tournaments ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const athletes = [...(roster?.canonical ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Comissão técnica</h1>
          <p className="text-sm text-zinc-400">Análise da temporada, torneios e atletas — sem scout nem edição.</p>
        </div>
        {!staff && (
          <button type="button" onClick={() => writeStaffMode(true)} className="min-h-12 rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">
            Ativar modo comissão neste aparelho
          </button>
        )}
      </header>
      <p className="rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
        {staff ? "Modo comissão ativo: as telas mostram só análise. " : ""}
        Os números vêm deste aparelho. Num aparelho da comissão, entre na mesma conta da nuvem para receber as partidas,
        ou envie o PDF (botão “Exportar PDF” nas telas de análise). O modo comissão organiza a tela; não é uma senha.{" "}
        <HardLink href="/account" className="underline underline-offset-4">
          Conectar à nuvem
        </HardLink>
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <HardLink href="/rankings" className="rounded-2xl bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="text-lg font-bold">🏆 Destaques da temporada</p>
          <p className="text-sm text-zinc-400">{totals ? `${year}: ${totals.matches} jogos · ${totals.rallies} ralis` : "Rankings por fundamento"}</p>
        </HardLink>
        <HardLink href="/rankings?mode=builder" className="rounded-2xl bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="text-lg font-bold">🧮 Construtor de relatórios</p>
          <p className="text-sm text-zinc-400">Compare atletas lado a lado e ordene por qualquer métrica</p>
        </HardLink>
        <HardLink href="/rankings?view=teams" className="rounded-2xl bg-zinc-900 p-4 hover:bg-zinc-800">
          <p className="text-lg font-bold">👥 Duplas</p>
          <p className="text-sm text-zinc-400">K1, K2, saldo e confrontos</p>
        </HardLink>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Torneios" note="Relatório completo: destaques por gênero e fontes de erro">
          <ul className="flex flex-col gap-1">
            {tournaments.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-2">
                <EntityLink href={`/tournament?id=${encodeURIComponent(t.id)}&tab=report`}>{t.name}</EntityLink>
                <span className="text-xs text-zinc-500">{brDate(t.start_date)}</span>
              </li>
            ))}
            {roster && tournaments.length === 0 && <li className="text-sm text-zinc-500">Nenhum torneio neste aparelho.</li>}
          </ul>
        </Card>
        <Card title="Atletas" note="Perfil, evolução por torneio e histórico com cada parceira">
          <ul className="grid grid-cols-2 gap-1">
            {athletes.map((a) => (
              <li key={a.id} className="truncate">
                <EntityLink href={athleteHref(a.id)}>{a.name}</EntityLink>
              </li>
            ))}
            {roster && athletes.length === 0 && <li className="text-sm text-zinc-500">Nenhuma atleta cadastrada.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
