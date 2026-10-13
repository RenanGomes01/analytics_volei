"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import { matchesSearch } from "@/domain/roster/identity";
import type { Athlete, Gender } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { createAthlete } from "@/services/roster-service";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "./form-styles";

interface Props {
  label: string;
  athletes: Athlete[];
  /** Ids que não podem ser escolhidos (já estão na outra vaga ou na outra dupla). */
  exclude: string[];
  value: Athlete | null;
  onChange: (athlete: Athlete | null) => void;
}

const label = (a: Athlete) => `${a.jersey_number ?? "–"} · ${a.name}`;

/** Escolhe uma atleta do cadastro (busca sem acento) ou cria uma na hora. */
export function AthletePicker({ label: title, athletes, exclude, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [number, setNumber] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (value) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-zinc-800 px-3">
        <span className="truncate">
          <span className="text-xs text-zinc-400">{title}: </span>
          {label(value)}
        </span>
        <button type="button" onClick={() => onChange(null)} className="min-h-10 rounded-lg px-2 text-sm text-zinc-300">
          Trocar
        </button>
      </div>
    );
  }

  const options = athletes.filter((a) => !exclude.includes(a.id) && matchesSearch(query, a.name, String(a.jersey_number ?? "")));

  async function create() {
    setError(null);
    try {
      const athlete = await createAthlete(getDB(), {
        tenant_id: LOCAL_TENANT_ID,
        name: query.trim(),
        jersey_number: number ? Number(number) : undefined,
        ...(gender ? { gender } : {}),
      });
      onChange(athlete);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        className={inputClass}
        placeholder={`${title}: buscar ou digitar nome`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={`${title}: buscar atleta`}
      />
      {query.trim() && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {options.slice(0, 8).map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onChange(a)} className={`${secondaryButton} w-full text-left`}>
                {label(a)}
              </button>
            </li>
          ))}
          {!creating ? (
            <li>
              <button type="button" onClick={() => setCreating(true)} className="min-h-12 w-full rounded-xl border-2 border-dashed border-zinc-700 text-zinc-300">
                + Nova atleta “{query.trim()}”
              </button>
            </li>
          ) : (
            <li className="flex gap-2">
              <input
                className={`${inputClass} w-24 text-center`}
                inputMode="numeric"
                placeholder="nº"
                aria-label="Número da nova atleta"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
              {(["F", "M"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gender === g}
                  aria-label={g === "F" ? "Feminino" : "Masculino"}
                  onClick={() => setGender(gender === g ? null : g)}
                  className={`${segmentedClass(gender === g)} w-14 flex-none`}
                >
                  {g}
                </button>
              ))}
              <button type="button" onClick={create} className={`${primaryButton} flex-1`}>
                Criar atleta
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
