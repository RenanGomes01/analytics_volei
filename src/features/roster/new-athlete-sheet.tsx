"use client";

import { useState } from "react";
import { getDB } from "@/db/client";
import { sameNameAthletes } from "@/domain/roster/identity";
import type { Athlete, Gender } from "@/domain/types";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "@/features/setup/form-styles";
import { toast } from "@/features/toast/toast";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { createAthlete } from "@/services/roster-service";

/** Cadastro de atleta direto na tela de cadastro (sem precisar começar um jogo). */
export function NewAthleteSheet({ athletes, onClose }: { athletes: Athlete[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const twins = sameNameAthletes(athletes, name);

  async function save(another: boolean) {
    setSaving(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error("Digite o nome da atleta.");
      const athlete = await createAthlete(getDB(), {
        tenant_id: LOCAL_TENANT_ID,
        name: name.trim(),
        ...(number ? { jersey_number: Number(number) } : {}),
        ...(gender ? { gender } : {}),
      });
      toast.success(`${athlete.name} cadastrada.`);
      if (another) {
        setName("");
        setNumber("");
      } else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Cadastrar atleta" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5"
      >
        <h2 className="text-xl font-bold">Cadastrar atleta</h2>
        <div className="flex gap-2">
          <input
            className={`${inputClass} w-20 flex-none text-center`}
            inputMode="numeric"
            placeholder="nº"
            aria-label="Número"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
          <input className={inputClass} placeholder="Nome da atleta" aria-label="Nome" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Gênero">
          {(["F", "M"] as const).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={gender === g} onClick={() => setGender(gender === g ? null : g)} className={segmentedClass(gender === g)}>
              {g === "F" ? "Feminino" : "Masculino"}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">O gênero é usado nos rankings masculino e feminino.</p>
        {twins.length > 0 && (
          <p role="status" className="rounded-xl bg-amber-900/50 px-3 py-2 text-sm text-amber-100">
            Já existe {twins.map((a) => `${a.jersey_number ?? "–"} · ${a.name}`).join(", ")} no cadastro. Se for a mesma pessoa, não cadastre de novo
            (cadastro duplicado separa as estatísticas; dá para unir depois em “Unir”).
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <span className="flex-1" />
          <button type="button" disabled={saving} onClick={() => save(true)} className={secondaryButton}>
            Salvar e cadastrar outra
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
