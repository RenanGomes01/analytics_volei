"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { normalizeName } from "@/domain/roster/identity";
import type { AthleteAggregate, TeamAggregate } from "@/domain/stats/aggregate";
import { ERROR_COLUMNS, factsIn } from "@/domain/stats/drill";
import type { TouchFact } from "@/domain/stats/facts";
import type { SortDir } from "@/domain/stats/sort";
import { athleteColumns, GROUP_LABEL, GROUP_ORDER, tableColumns, teamColumns, type StatColumn, type StatGroup } from "@/domain/stats/stat-columns";
import { StatTable, type StatRow } from "@/features/stats/stat-table";
import { athleteHref, EntityLink, teamHref } from "./ui";
import { replaceQuery } from "./use-season-data";

interface Props {
  view: "athletes" | "teams";
  athletes: readonly AthleteAggregate[];
  teams: readonly TeamAggregate[];
  facts: readonly TouchFact[];
  athleteName: (id: string) => string;
  teamName: (key: string) => string;
  matchLabel: (match_id: string) => string;
}

const MIN_OPTIONS = [0, 1, 3, 5, 10];
const DEFAULT_GROUPS: StatGroup[] = ["geral", "ataque", "saque", "recepcao"];
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

/**
 * Construtor de relatórios (Fase 15): escolha N atletas (ou duplas) para comparar lado a lado, os
 * grupos de métricas e ordene por QUALQUER coluna do dicionário (clique no cabeçalho). Toda célula
 * abre o drill-down. O recorte fica na URL: dá para favoritar e reabrir offline.
 */
export function ReportBuilder({ view, athletes, teams, facts, athleteName, teamName, matchLabel }: Props) {
  const params = useSearchParams();
  const [ids, setIds] = useState<string[]>(() => list(params.get("ids")));
  const [groups, setGroups] = useState<StatGroup[]>(() => {
    const g = list(params.get("cols")).filter((x): x is StatGroup => (GROUP_ORDER as string[]).includes(x));
    return g.length ? g : DEFAULT_GROUPS;
  });
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>(() => ({
    key: params.get("sort") ?? "points",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
  }));
  const [min, setMin] = useState(() => Number(params.get("min") ?? 0) || 0);
  const [search, setSearch] = useState("");

  const isTeams = view === "teams";
  const showReception = (isTeams ? teams : athletes).some((x) => x.reception.positive.den > 0);
  const allColumns: StatColumn<never>[] = (
    isTeams
      ? tableColumns(teamColumns({ modality: "beach", showReception: showReception }), { detailed: true })
      : tableColumns(athleteColumns({ modality: "beach", aggregated: true, showReception: showReception }), { detailed: true })
  ) as StatColumn<never>[];
  /** A coluna em foco vem logo depois do nome. */
  const focusFirst = <T,>(cols: StatColumn<T>[], key: string) => {
    const i = cols.findIndex((c) => c.key === key);
    return i <= 0 ? cols : [cols[i], ...cols.slice(0, i), ...cols.slice(i + 1)];
  };
  // "Pts" não existe na tabela de duplas: lá o padrão é vitórias.
  const effectiveSort = isTeams && sort.key === "points" ? { ...sort, key: "wins" } : sort;
  const nameOf = isTeams ? teamName : athleteName;
  const pool = useMemo(
    () => (isTeams ? teams.map((t) => ({ id: t.pair_key, matches: t.matches })) : athletes.map((a) => ({ id: a.athlete_id, matches: a.matches }))),
    [isTeams, athletes, teams],
  );

  const update = (patch: Record<string, string | undefined>) => replaceQuery(patch);
  const setSelection = (next: string[]) => {
    setIds(next);
    update({ ids: next.length ? next.join(",") : undefined });
  };
  const setSortTo = (next: { key: string; dir: SortDir }) => {
    setSort(next);
    update({ sort: next.key, dir: next.dir });
  };
  const toggleGroup = (g: StatGroup) => {
    const adding = !groups.includes(g);
    const next = adding ? GROUP_ORDER.filter((x) => x === g || groups.includes(x)) : groups.filter((x) => x !== g);
    setGroups(next);
    update({ cols: next.join(",") });
    // Marcar um grupo põe a métrica-foco dele em ordem decrescente (Fase 16): "Saque" → mais aces primeiro.
    const focus = allColumns.find((c) => c.group === g && c.focus);
    if (adding && focus) setSortTo({ key: focus.key, dir: "desc" });
  };
  const onSort = (key: string) =>
    setSortTo({ key, dir: effectiveSort.key === key && effectiveSort.dir === "desc" ? "asc" : "desc" });

  const suggestions = useMemo(() => {
    const q = normalizeName(search);
    if (!q) return [];
    return pool.filter((p) => !ids.includes(p.id) && normalizeName(nameOf(p.id)).includes(q)).slice(0, 8);
  }, [search, pool, ids, nameOf]);

  const selected = new Set(ids);
  const keep = (id: string, matches: number) => (selected.size === 0 || selected.has(id)) && matches >= min;
  const header = isTeams ? "Dupla" : "Atleta";
  const known = new Set(pool.map((p) => p.id));

  const table = isTeams ? (
    <StatTable<TeamAggregate>
      firstHeader={header}
      columns={focusFirst(tableColumns(teamColumns({ modality: "beach", showReception }), { detailed: true }).filter((c) => groups.includes(c.group)), effectiveSort.key)}
      rows={teams
        .filter((t) => keep(t.pair_key, t.matches))
        .map((t): StatRow<TeamAggregate> => ({ key: t.pair_key, name: teamName(t.pair_key), line: t, label: <EntityLink href={teamHref(t.pair_key)}>{teamName(t.pair_key)}</EntityLink> }))}
      sort={effectiveSort}
      onSort={onSort}
      minWidth={900}
      drill={(row) => ({ facts: factsIn(facts, { pair_key: row.key }), matchLabel, athleteLabel: athleteName })}
    />
  ) : (
    <StatTable<AthleteAggregate>
      firstHeader={header}
      columns={focusFirst(tableColumns(athleteColumns({ modality: "beach", aggregated: true, showReception }), { detailed: true }).filter((c) => groups.includes(c.group)), effectiveSort.key)}
      rows={athletes
        .filter((a) => keep(a.athlete_id, a.matches))
        .map((a): StatRow<AthleteAggregate> => ({ key: a.athlete_id, name: athleteName(a.athlete_id), line: a, label: <EntityLink href={athleteHref(a.athlete_id)}>{athleteName(a.athlete_id)}</EntityLink> }))}
      sort={sort}
      onSort={onSort}
      minWidth={900}
      drill={(row) => ({ facts: factsIn(facts, { athlete_id: row.key }), matchLabel, athleteLabel: athleteName })}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4" data-print="hide">
        <div className="flex flex-col gap-2">
          <label htmlFor="builder-search" className="text-sm font-semibold text-zinc-300">
            Comparar {isTeams ? "duplas" : "atletas"} (sem seleção = todas do recorte)
          </label>
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelection(ids.filter((x) => x !== id))}
                className={`min-h-11 rounded-full px-3 text-sm font-semibold ${known.has(id) ? "bg-amber-400 text-zinc-950" : "bg-zinc-700 text-zinc-300"}`}
                aria-label={`Tirar ${nameOf(id)} da comparação`}
              >
                {nameOf(id)} ✕
              </button>
            ))}
            {ids.length > 0 && (
              <button type="button" onClick={() => setSelection([])} className="min-h-11 rounded-full px-3 text-sm text-zinc-400 underline underline-offset-4">
                Limpar seleção
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="builder-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar ${isTeams ? "dupla" : "atleta"} para adicionar…`}
              className="min-h-12 w-full rounded-xl border-2 border-zinc-700 bg-zinc-950 px-3"
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelection([...ids, p.id]);
                        setSearch("");
                      }}
                      className="flex min-h-12 w-full items-center justify-between px-3 text-left hover:bg-zinc-800"
                    >
                      <span>{nameOf(p.id)}</span>
                      <span className="text-xs text-zinc-500">{p.matches} jogos</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-zinc-300">Métricas</span>
          <div className="flex flex-wrap gap-1">
            {GROUP_ORDER.filter((g) => (isTeams ? g !== "levantamento" : g !== "resultado")).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={groups.includes(g)}
                onClick={() => toggleGroup(g)}
                className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${groups.includes(g) ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
              >
                {GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
          Mínimo de jogos:
          <select
            value={min}
            onChange={(e) => {
              setMin(Number(e.target.value));
              update({ min: e.target.value === "0" ? undefined : e.target.value });
            }}
            className="min-h-11 rounded-xl border-2 border-zinc-700 bg-zinc-950 px-2"
          >
            {MIN_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "sem mínimo" : `${m}+`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
          Ordenar por:
          <select
            value={effectiveSort.key}
            onChange={(e) => setSortTo({ key: e.target.value, dir: "desc" })}
            className="min-h-11 max-w-full rounded-xl border-2 border-zinc-700 bg-zinc-950 px-2"
          >
            {allColumns
              .filter((c) => groups.includes(c.group) && c.format !== "text")
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {GROUP_LABEL[c.group]} · {c.full}
                </option>
              ))}
          </select>
          <button type="button" onClick={() => onSort(effectiveSort.key)} className="min-h-11 rounded-xl bg-zinc-800 px-3 font-semibold">
            {effectiveSort.dir === "desc" ? "↓ maior primeiro" : "↑ menor primeiro"}
          </button>
        </label>
        <p className="text-xs text-zinc-500">
          {ERROR_COLUMNS.has(effectiveSort.key) && effectiveSort.dir === "desc"
            ? "Métrica de erro: decrescente mostra quem MAIS errou primeiro (mais → menos). "
            : ""}
          Marcar um grupo ordena pela métrica principal dele. Toque no cabeçalho para ordenar por outra coluna. “–” (sem base) vai sempre para o fim.
        </p>
      </section>
      {groups.length === 0 ? <p className="text-zinc-400">Escolha ao menos um grupo de métricas.</p> : table}
    </div>
  );
}
