"use client";

import { SubmitButton } from "@/components/submit-button";
import { useSubmit } from "@/components/use-submit";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { getDB } from "@/db/client";
import { PHASE_LABEL, TOURNAMENT_PHASES, type TournamentPhase } from "@/domain/roster/types";
import type { Match } from "@/domain/types";
import type { RosterData } from "@/features/roster/use-roster-data";
import { inputClass, primaryButton, secondaryButton, segmentedClass } from "@/features/setup/form-styles";
import { TournamentPicker } from "@/features/setup/tournament-picker";
import { toast } from "@/features/toast/toast";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { countScoutedEvents, deleteMatch, restoreMatch, updateMatchTeams } from "@/services/match-service";
import { setMatchCompetition } from "@/services/tournament-service";

interface Props {
  match: Match;
  roster: RosterData;
  onClose: () => void;
}

const sameTeam = (a: Match["team_a"], b: Match["team_a"]) => a.name === b.name && a.athlete_ids.join() === b.athlete_ids.join();

/**
 * Corrigir a partida marcada errado: torneio e fase a qualquer momento; as duplas só antes do scout
 * (os lances guardam o id de cada atleta). "Excluir" manda para a lixeira, de onde dá para restaurar.
 */
export function EditMatchSheet({ match, roster, onClose }: Props) {
  const scouted = useLiveQuery(() => countScoutedEvents(getDB(), LOCAL_TENANT_ID, match.id), [match.id]);
  const entry = roster.entries.find((e) => e.match_id === match.id) ?? null;
  const teams = roster.teams.filter((t) => t.modality === match.modality);
  const tournaments = roster.tournaments.filter((t) => t.modality === match.modality);
  const teamIdOf = (side: Match["team_a"]) => teams.find((t) => t.athlete_ids.join() === side.athlete_ids.join())?.id ?? "";

  const [teamA, setTeamA] = useState(teamIdOf(match.team_a));
  const [teamB, setTeamB] = useState(teamIdOf(match.team_b));
  const [tournamentId, setTournamentId] = useState(entry?.tournament_id ?? "");
  const [phase, setPhase] = useState<TournamentPhase | null>(entry?.phase ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = (scouted ?? 0) > 0;

  const { busy: saving, error, run } = useSubmit();
  const save = () =>
    run(async () => {
      const snapshot = (id: string, fallback: Match["team_a"]) => {
        const t = teams.find((x) => x.id === id);
        return t ? { name: t.name, athlete_ids: [...t.athlete_ids] } : fallback;
      };
      const team_a = snapshot(teamA, match.team_a);
      const team_b = snapshot(teamB, match.team_b);
      if (!locked && (!sameTeam(team_a, match.team_a) || !sameTeam(team_b, match.team_b))) {
        await updateMatchTeams(getDB(), LOCAL_TENANT_ID, match.id, { team_a, team_b });
      }
      // Torneio e fase numa transação só: nunca fica "meio amistoso" se algo falhar no meio.
      await setMatchCompetition(getDB(), LOCAL_TENANT_ID, match.id, { tournament_id: tournamentId || null, phase: tournamentId ? phase : null });
      toast.success("Partida salva.");
      onClose();
    });

  if (confirmDelete) {
    return (
      <ConfirmSheet
        title={`Excluir ${match.team_a.name} × ${match.team_b.name}?`}
        confirmLabel="Mandar para a lixeira"
        danger
        onConfirm={async () => {
          await deleteMatch(getDB(), LOCAL_TENANT_ID, match.id);
          toast.success("Partida enviada para a lixeira.", {
            action: {
              label: "Desfazer",
              run: () =>
                restoreMatch(getDB(), LOCAL_TENANT_ID, match.id).then(
                  () => toast.success("Partida restaurada."),
                  (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
                ),
            },
          });
        }}
        onClose={() => {
          setConfirmDelete(false);
          onClose();
        }}
      >
        <p>A partida sai das listas, rankings e estatísticas. Os lances continuam guardados: dá para restaurar pela lixeira, no fim da lista.</p>
        <p className="text-sm text-zinc-400">Com a nuvem ligada, a exclusão chega aos outros aparelhos na próxima sincronização.</p>
      </ConfirmSheet>
    );
  }

  const teamSelect = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label}
      <select className={inputClass} value={value} disabled={locked} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">(dupla fora do cadastro)</option>}
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Editar partida" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-5 text-zinc-100">
        <h2 className="text-xl font-bold">Editar partida</h2>
        <p className="text-sm text-zinc-400">Torneio e fase podem ser corrigidos a qualquer momento, sem mexer nos lances.</p>
        {teamSelect("Dupla A", teamA, setTeamA)}
        {teamSelect("Dupla B", teamB, setTeamB)}
        {locked && (
          <p className="rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
            Já tem lances: as duplas não mudam. Nome errado? Corrija no cadastro (Atletas e duplas) ou use “Unir atletas”.
          </p>
        )}
        <TournamentPicker
          tournaments={tournaments}
          value={tournamentId}
          modality={match.modality}
          onChange={(id) => {
            setTournamentId(id);
            setPhase(id ? (phase ?? "group") : null);
          }}
        />
        {tournamentId && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fase">
            {TOURNAMENT_PHASES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={phase === p} onClick={() => setPhase(p)} className={segmentedClass(phase === p)}>
                {PHASE_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-900/70 px-4 py-3 text-red-100">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${secondaryButton} text-red-300`}>
            Excluir partida
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <SubmitButton type="button" busy={saving} disabled={scouted === undefined} onClick={save} className={primaryButton}>
            Salvar
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
