"use client";

import { useState } from "react";
import { toast } from "@/features/toast/toast";
import { getDB } from "@/db/client";
import type { Tournament, TournamentCategory } from "@/domain/roster/types";
import type { Modality } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { createTournament } from "@/services/tournament-service";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "./form-styles";

const today = () => new Date().toISOString().slice(0, 10);

const CATEGORIES: [TournamentCategory, string][] = [["F", "Feminino"], ["M", "Masculino"], ["Mixed", "Misto"], ["Open", "Aberto"]];

interface Props {
  tournaments: Tournament[];
  value: string;
  onChange: (tournamentId: string) => void;
}

/** Escolhe o torneio da partida ("" = sem torneio) ou cria um novo na hora. */
export function TournamentPicker({ tournaments, value, onChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", start_date: today(), modality: "beach" as Modality, category: undefined as TournamentCategory | undefined });
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const t = await createTournament(getDB(), LOCAL_TENANT_ID, form);
      toast.success(`Torneio ${t.name} criado.`);
      onChange(t.id);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">Torneio</legend>
      {!creating ? (
        <div className="flex flex-wrap gap-2">
          <select
            className={`${inputClass} min-w-0 flex-1`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Torneio da partida"
          >
            <option value="">Sem torneio (amistoso / treino)</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.start_date.split("-").reverse().join("/")} · {t.modality === "beach" ? "Beach" : "Indoor"}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCreating(true)} className={secondaryButton}>
            + Novo torneio
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-zinc-800 p-3">
          <input className={inputClass} placeholder="Nome (ex.: Etapa Saquarema)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nome do torneio" />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} aria-label="Local do torneio" />
            <input className={inputClass} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} aria-label="Data de início" />
          </div>
          <div className="flex gap-2">
            {(["beach", "indoor"] as const).map((m) => (
              <button key={m} type="button" className={segmentedClass(form.modality === m)} onClick={() => setForm({ ...form, modality: m })}>
                {m === "beach" ? "Beach 2×2" : "Indoor 6×6"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Categoria do torneio">
            {CATEGORIES.map(([c, text]) => (
              <button
                key={c}
                type="button"
                aria-pressed={form.category === c}
                className={segmentedClass(form.category === c)}
                onClick={() => setForm({ ...form, category: form.category === c ? undefined : c })}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreating(false)} className={`${secondaryButton} flex-1`}>
              Cancelar
            </button>
            <button type="button" onClick={create} className={`${primaryButton} flex-1`}>
              Criar torneio
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </fieldset>
  );
}
