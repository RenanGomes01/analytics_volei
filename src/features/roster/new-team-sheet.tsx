"use client";

import { SubmitButton } from "@/components/submit-button";
import { useSubmit } from "@/components/use-submit";
import { useState } from "react";
import { getDB } from "@/db/client";
import { pairKey } from "@/domain/roster/identity";
import type { Athlete, Modality } from "@/domain/types";
import { AthletePicker } from "@/features/setup/athlete-picker";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "@/features/setup/form-styles";
import { toast } from "@/features/toast/toast";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { findOrCreateTeam } from "@/services/roster-service";
import type { RosterData } from "./use-roster-data";

/** Cadastro de dupla (ou time indoor) direto na tela de cadastro; cria as atletas na hora se preciso. */
export function NewTeamSheet({ roster, onClose }: { roster: RosterData; onClose: () => void }) {
  const [modality, setModality] = useState<Modality>("beach");
  const [picked, setPicked] = useState<(Athlete | null)[]>([null, null]);
  const [indoorIds, setIndoorIds] = useState<string[]>([]);
  const [name, setName] = useState("");

  const chosen = modality === "beach" ? picked.filter((a): a is Athlete => !!a).map((a) => a.id) : indoorIds;
  const ready = modality === "beach" ? chosen.length === 2 : chosen.length >= 6 && chosen.length <= 14;

  const { busy: saving, error, run } = useSubmit();
  const save = () =>
    run(async () => {
      const existed = roster.teamByKey.has(pairKey(chosen, roster.aliases));
      const team = await findOrCreateTeam(getDB(), LOCAL_TENANT_ID, { athlete_ids: chosen, modality, name });
      toast[existed ? "info" : "success"](existed ? `${team.name} já estava cadastrada.` : `Dupla ${team.name} cadastrada.`);
      onClose();
    });

  return (
    <div role="dialog" aria-modal="true" aria-label="Cadastrar dupla" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">{modality === "beach" ? "Cadastrar dupla" : "Cadastrar time"}</h2>
        <div className="flex gap-2" role="radiogroup" aria-label="Modalidade">
          {(["beach", "indoor"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={modality === m} onClick={() => setModality(m)} className={segmentedClass(modality === m)}>
              {m === "beach" ? "Beach 2×2" : "Indoor 6×6"}
            </button>
          ))}
        </div>

        {modality === "beach" ? (
          [0, 1].map((i) => (
            <AthletePicker
              key={i}
              label={`Atleta ${i + 1}`}
              athletes={roster.canonical}
              exclude={chosen}
              value={picked[i]}
              onChange={(a) => setPicked((p) => p.map((x, j) => (j === i ? a : x)))}
            />
          ))
        ) : (
          <>
            <p className="text-sm text-zinc-400">Marque de 6 a 14 atletas ({indoorIds.length} marcadas). Cadastre as que faltam em “+ Cadastrar atleta”.</p>
            <ul className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
              {roster.canonical.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-12 items-center gap-2 rounded-xl bg-zinc-800 px-3">
                    <input
                      type="checkbox"
                      checked={indoorIds.includes(a.id)}
                      onChange={(e) => setIndoorIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                      className="size-5"
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <input className={inputClass} placeholder="Nome da dupla (opcional: usa os nomes das atletas)" aria-label="Nome da dupla" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-zinc-500">Digite um nome na busca da atleta para cadastrá-la na hora, se ainda não existir.</p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${secondaryButton} flex-1`}>
            Cancelar
          </button>
          <SubmitButton type="button" busy={saving} disabled={!ready} onClick={save} className={`${primaryButton} flex-1`}>
            Salvar
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
