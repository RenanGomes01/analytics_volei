"use client";

import { SubmitButton } from "@/components/submit-button";
import { useSearchParams } from "next/navigation";
import { toast } from "@/features/toast/toast";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { getDB } from "@/db/client";
import { pairKey } from "@/domain/roster/identity";
import { PHASE_LABEL, TOURNAMENT_PHASES, type Team, type TournamentPhase } from "@/domain/roster/types";
import type { Modality, TeamSide } from "@/domain/types";
import { useRosterData } from "@/features/roster/use-roster-data";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { requestStorageProtection } from "@/services/storage/persistence";
import { createMatchFromTeams } from "@/services/tournament-service";
import { segmentedClass } from "./form-styles";
import { TeamPicker } from "./team-picker";
import { TournamentPicker } from "./tournament-picker";

/**
 * Nova partida a partir do cadastro central (Fase 5): torneio → duplas → primeiro saque.
 * Atletas e duplas são reutilizados entre partidas; nada é recriado.
 */
export function NewMatchForm() {
  const roster = useRosterData();
  // "+ Partida" no dashboard abre /new?tournament=… com a etapa já escolhida.
  const initialTournament = useSearchParams().get("tournament") ?? "";
  const [tournamentId, setTournamentId] = useState(initialTournament);
  const [freeModality, setFreeModality] = useState<Modality>("beach");
  const [teams, setTeams] = useState<Record<TeamSide, Team | null>>({ A: null, B: null });
  const [firstServer, setFirstServer] = useState<TeamSide>("A");
  const [phase, setPhase] = useState<TournamentPhase>("group");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Trava no mesmo toque: dois toques em "Começar scout" não criam duas partidas.
  const submitting = useRef(false);

  const tournament = roster?.tournaments.find((t) => t.id === tournamentId);
  const modality = tournament?.modality ?? freeModality;

  // Duplas que já jogaram neste torneio (pelo par de atletas, inclusive jogos do MVP) aparecem primeiro.
  const preferredTeamIds = useMemo(() => {
    const ids = new Set<string>();
    if (!roster || !tournamentId) return ids;
    const inTournament = new Set(roster.entries.filter((e) => e.tournament_id === tournamentId).map((e) => e.match_id));
    for (const m of roster.matches) {
      if (!inTournament.has(m.id)) continue;
      for (const side of [m.team_a, m.team_b]) {
        const team = roster.teamByKey.get(pairKey(side.athlete_ids, roster.aliases));
        if (team) ids.add(team.id);
      }
    }
    return ids;
  }, [roster, tournamentId]);

  if (!roster) return <p className="p-4 text-center text-zinc-400">Carregando cadastro…</p>;

  const changeTournament = (id: string) => {
    setTournamentId(id);
    const next = roster.tournaments.find((t) => t.id === id);
    if (next && next.modality !== modality) setTeams({ A: null, B: null });
  };
  const changeModality = (m: Modality) => {
    setFreeModality(m);
    setTeams({ A: null, B: null });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!teams.A || !teams.B) {
      setError(`Escolha as duas ${modality === "beach" ? "duplas" : "equipes"}.`);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    // Gesto do usuário: o momento certo para pedir a proteção do armazenamento (o Firefox exige).
    void requestStorageProtection();
    try {
      const match = await createMatchFromTeams(getDB(), {
        tenant_id: LOCAL_TENANT_ID,
        team_a_id: teams.A.id,
        team_b_id: teams.B.id,
        first_server: firstServer,
        tournament_id: tournamentId || undefined,
        ...(tournamentId ? { phase } : {}),
      });
      toast.success(`Partida criada: ${match.team_a.name} × ${match.team_b.name}. Bom jogo!`, { afterNavigation: true });
      // Navegação completa: a tela de scout vem do pré-cache, mesmo offline (ver HardLink).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/match?id=${encodeURIComponent(match.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      submitting.current = false;
    }
  }

  const other = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");
  const unit = modality === "beach" ? "Dupla" : "Time";

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <TournamentPicker tournaments={roster.tournaments} value={tournamentId} onChange={changeTournament} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">Fase</legend>
        {tournament ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Fase da partida">
            {TOURNAMENT_PHASES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={phase === p} className={segmentedClass(phase === p)} onClick={() => setPhase(p)}>
                {PHASE_LABEL[p]}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-zinc-900 px-3 py-3 text-zinc-300">Amistoso (partida sem torneio)</p>
        )}
      </fieldset>

      <fieldset className="flex gap-2">
        <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">
          Modalidade{tournament && " (definida pelo torneio)"}
        </legend>
        {(["beach", "indoor"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!!tournament}
            className={`${segmentedClass(modality === m)} disabled:opacity-60`}
            onClick={() => changeModality(m)}
          >
            {m === "beach" ? "Beach 2×2" : "Indoor 6×6"}
          </button>
        ))}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {(["A", "B"] as const).map((side) => (
          <TeamPicker
            key={`${side}-${modality}`}
            side={side}
            modality={modality}
            roster={roster}
            preferredTeamIds={preferredTeamIds}
            blockedAthleteIds={teams[other(side)]?.athlete_ids ?? []}
            value={teams[side]}
            onChange={(team) => setTeams((t) => ({ ...t, [side]: team }))}
          />
        ))}
      </div>

      <fieldset className="flex gap-2">
        <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">Primeiro saque</legend>
        {(["A", "B"] as const).map((side) => (
          <button key={side} type="button" className={segmentedClass(firstServer === side)} onClick={() => setFirstServer(side)}>
            {teams[side]?.name ?? `${unit} ${side}`}
          </button>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
          {error}
        </p>
      )}

      <SubmitButton type="submit" busy={saving} busyLabel="Criando a partida…" className="min-h-16 rounded-2xl bg-amber-400 text-xl font-bold text-zinc-950 disabled:opacity-60">
        Começar scout
      </SubmitButton>
    </form>
  );
}
