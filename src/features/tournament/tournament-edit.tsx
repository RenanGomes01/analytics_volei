"use client";

import { useState } from "react";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { getDB } from "@/db/client";
import type { Tournament, TournamentCategory } from "@/domain/roster/types";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "@/features/setup/form-styles";
import { toast } from "@/features/toast/toast";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { deleteTournament, updateTournament } from "@/services/tournament-service";

const CATEGORIES: [TournamentCategory, string][] = [["F", "Feminino"], ["M", "Masculino"], ["Mixed", "Misto"], ["Open", "Aberto"]];

/** Editar nome/local/categoria do torneio, ou excluí-lo (as partidas viram amistosos). */
export function TournamentEditSheet({ tournament, matches, onClose }: { tournament: Tournament; matches: number; onClose: () => void }) {
  const [name, setName] = useState(tournament.name);
  const [location, setLocation] = useState(tournament.location ?? "");
  const [category, setCategory] = useState<TournamentCategory | null>(tournament.category ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);
    try {
      await updateTournament(getDB(), LOCAL_TENANT_ID, tournament.id, { name, location, category });
      toast.success("Torneio salvo.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (confirmDelete) {
    return (
      <ConfirmSheet
        title={`Excluir o torneio ${tournament.name}?`}
        confirmLabel="Excluir torneio"
        danger
        onConfirm={async () => {
          const { unlinked } = await deleteTournament(getDB(), LOCAL_TENANT_ID, tournament.id);
          toast.success(
            `Torneio excluído.${unlinked ? ` ${unlinked === 1 ? "A partida virou amistoso" : `As ${unlinked} partidas viraram amistosos`}.` : ""}`,
            { afterNavigation: true },
          );
          window.location.replace("/");
        }}
        onClose={() => setConfirmDelete(false)}
      >
        <p>
          {matches > 0
            ? `As ${matches} partidas continuam salvas, com todos os lances, e passam a aparecer como amistosos.`
            : "O torneio não tem partidas."}{" "}
          A exclusão vai para a nuvem na próxima sincronização.
        </p>
      </ConfirmSheet>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Editar torneio" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Editar torneio</h2>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Nome
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Local
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Categoria">
          {CATEGORIES.map(([c, label]) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(category === c ? null : c)} className={segmentedClass(category === c)}>
              {label}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${secondaryButton} text-red-300`}>
            Excluir torneio
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="button" onClick={save} className={primaryButton}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
