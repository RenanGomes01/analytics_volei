"use client";

import { EmptyState } from "@/components/empty-state";

interface Props {
  query: string;
  onChange: (query: string) => void;
  shown: number;
  total: number;
}

/** Campo "Pesquisar atleta ou dupla…" das listas de partidas, com limpar e contador. */
export function MatchSearchInput({ query, onChange, shown, total }: Props) {
  return (
    <div className="flex flex-col gap-1" data-print="hide">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Pesquisar atleta ou dupla…"
          aria-label="Pesquisar partidas por atleta ou dupla"
          autoComplete="off"
          className="min-h-12 w-full rounded-xl border-2 border-zinc-700 bg-zinc-900 px-4 pr-14 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpar busca"
            className="absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-lg text-xl text-zinc-400"
          >
            ✕
          </button>
        )}
      </div>
      {query.trim() && (
        <p className="text-xs text-zinc-500" aria-live="polite">
          {shown} de {total} {total === 1 ? "partida" : "partidas"}
        </p>
      )}
    </div>
  );
}

/** Busca sem resultado: diz o que foi buscado e oferece limpar. */
export function NoMatchFound({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState icon="🔎" title={`Nenhuma partida com “${query.trim()}”.`} primary={{ label: "Limpar busca", onClick: onClear }}>
      Confira a grafia ou busque só parte do nome (ex.: “vini”).
    </EmptyState>
  );
}
