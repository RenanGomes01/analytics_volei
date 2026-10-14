"use client";

import { toast } from "@/features/toast/toast";
import { useSubmit } from "@/components/use-submit";
import { SubmitButton } from "@/components/submit-button";
import { useState } from "react";
import { getDB } from "@/db/client";
import { matchesSearch, pairKey } from "@/domain/roster/identity";
import type { Team } from "@/domain/roster/types";
import type { Athlete, Modality } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { findOrCreateTeam } from "@/services/roster-service";
import type { RosterData } from "@/features/roster/use-roster-data";
import { AthletePicker } from "./athlete-picker";
import { inputClass, primaryButton, secondaryButton } from "./form-styles";

interface Props {
  side: "A" | "B";
  modality: Modality;
  roster: RosterData;
  /** Duplas que já jogaram neste torneio aparecem primeiro. */
  preferredTeamIds: Set<string>;
  /** Atletas da outra dupla: não podem estar nesta. */
  blockedAthleteIds: string[];
  value: Team | null;
  onChange: (team: Team | null) => void;
}

const teamLabel = (team: Team, roster: RosterData) =>
  team.athlete_ids.map((id) => roster.athleteById.get(id)?.name ?? "?").join(" / ");

/** Escolhe uma dupla (ou time) do cadastro, ou monta uma nova a partir das atletas. */
export function TeamPicker({ side, modality, roster, preferredTeamIds, blockedAthleteIds, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<(Athlete | null)[]>([null, null]);
  const [indoorIds, setIndoorIds] = useState<string[]>([]);
  const { busy, error, run } = useSubmit();
  const title = modality === "beach" ? `Dupla ${side}` : `Time ${side}`;

  if (value) {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border-2 border-amber-400 bg-amber-400/5 p-3">
        <span className="text-xs uppercase tracking-wide text-zinc-400">{title}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-bold">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className={secondaryButton}>
            Trocar
          </button>
        </div>
        {value.name !== teamLabel(value, roster) && <span className="text-sm text-zinc-400">{teamLabel(value, roster)}</span>}
      </div>
    );
  }

  const teams = roster.teams
    .filter((t) => t.modality === modality && !t.athlete_ids.some((id) => blockedAthleteIds.includes(id)))
    .filter((t) => matchesSearch(query, t.name, ...t.athlete_ids.map((id) => roster.athleteById.get(id)?.name ?? "")))
    .sort((a, b) => Number(preferredTeamIds.has(b.id)) - Number(preferredTeamIds.has(a.id)));

  // Trava no mesmo toque: tocar várias vezes em "Usar esta dupla" grava uma vez só.
  const create = (athleteIds: string[]) =>
    run(async () => {
      const existed = roster.teamByKey.has(pairKey(athleteIds, roster.aliases));
      const team = await findOrCreateTeam(getDB(), LOCAL_TENANT_ID, { athlete_ids: athleteIds, modality });
      toast[existed ? "info" : "success"](existed ? `${team.name} já estava cadastrada.` : `Dupla ${team.name} cadastrada.`);
      onChange(team);
      setBuilding(false);
      setPicked([null, null]);
      setIndoorIds([]);
    });

  const chosen = picked.filter((a): a is Athlete => !!a).map((a) => a.id);

  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border-2 border-zinc-800 p-3">
      <legend className="px-1 text-sm uppercase tracking-wide text-zinc-400">{title}</legend>
      {!building && (
        <>
          <input
            className={inputClass}
            placeholder={`Buscar ${modality === "beach" ? "dupla" : "time"} ou atleta`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`${title}: buscar`}
          />
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {teams.slice(0, 12).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onChange(t)} className={`${secondaryButton} flex w-full items-center justify-between text-left`}>
                  <span className="truncate">{t.name}</span>
                  {preferredTeamIds.has(t.id) && <span className="text-xs text-amber-300">neste torneio</span>}
                </button>
              </li>
            ))}
            {teams.length === 0 && <li className="px-1 text-sm text-zinc-500">Nenhuma {modality === "beach" ? "dupla" : "equipe"} encontrada.</li>}
          </ul>
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="min-h-12 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-300"
          >
            + Nova {modality === "beach" ? "dupla" : "equipe"}
          </button>
        </>
      )}

      {building && modality === "beach" && (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <AthletePicker
              key={i}
              label={`Atleta ${i + 1}`}
              athletes={roster.canonical}
              exclude={[...blockedAthleteIds, ...chosen]}
              value={picked[i]}
              onChange={(a) => setPicked((p) => p.map((x, j) => (j === i ? a : x)))}
            />
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBuilding(false)} className={`${secondaryButton} flex-1`}>
              Cancelar
            </button>
            <SubmitButton type="button" busy={busy} busyLabel="Criando…" disabled={chosen.length !== 2} onClick={() => create(chosen)} className={`${primaryButton} flex-1`}>
              Usar esta dupla
            </SubmitButton>
          </div>
        </div>
      )}

      {building && modality === "indoor" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-400">Marque de 6 a 14 atletas ({indoorIds.length} marcadas).</p>
          <ul className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
            {roster.canonical
              .filter((a) => !blockedAthleteIds.includes(a.id))
              .map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-12 items-center gap-2 rounded-xl bg-zinc-800 px-3">
                    <input
                      type="checkbox"
                      checked={indoorIds.includes(a.id)}
                      onChange={(e) => setIndoorIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                    />
                    <span className="truncate">{a.name}</span>
                  </label>
                </li>
              ))}
          </ul>
          <AthletePicker label="Nova atleta" athletes={[]} exclude={[]} value={null} onChange={(a) => a && setIndoorIds((ids) => [...ids, a.id])} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setBuilding(false)} className={`${secondaryButton} flex-1`}>
              Cancelar
            </button>
            <SubmitButton type="button" busy={busy} busyLabel="Criando…" disabled={indoorIds.length < 6 || indoorIds.length > 14} onClick={() => create(indoorIds)} className={`${primaryButton} flex-1`}>
              Usar este time
            </SubmitButton>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </fieldset>
  );
}
