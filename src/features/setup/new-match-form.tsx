"use client";

import { useState, type FormEvent } from "react";
import { getDB } from "@/db/client";
import type { Modality, TeamSide } from "@/domain/types";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { createMatchWithRoster } from "@/services/match-service";
import { requestStorageProtection } from "@/services/storage/persistence";

interface AthleteRow {
  name: string;
  number: string;
}

const ROSTER_SIZE: Record<Modality, number> = { beach: 2, indoor: 6 };
const MAX_INDOOR = 14;

const emptyRows = (n: number): AthleteRow[] => Array.from({ length: n }, () => ({ name: "", number: "" }));

function resize(rows: AthleteRow[], size: number): AthleteRow[] {
  return rows.length >= size ? rows.slice(0, size) : [...rows, ...emptyRows(size - rows.length)];
}

const input =
  "min-h-12 w-full rounded-xl border-2 border-zinc-700 bg-zinc-900 px-3 text-lg text-zinc-100 outline-none focus:border-amber-400";

export function NewMatchForm() {
  const [modality, setModality] = useState<Modality>("beach");
  const [names, setNames] = useState({ A: "", B: "" });
  const [rosters, setRosters] = useState({ A: emptyRows(2), B: emptyRows(2) });
  const [firstServer, setFirstServer] = useState<TeamSide>("A");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chooseModality = (m: Modality) => {
    setModality(m);
    setRosters((r) => ({ A: resize(r.A, ROSTER_SIZE[m]), B: resize(r.B, ROSTER_SIZE[m]) }));
  };

  const updateRow = (team: TeamSide, index: number, patch: Partial<AthleteRow>) =>
    setRosters((r) => ({ ...r, [team]: r[team].map((row, i) => (i === index ? { ...row, ...patch } : row)) }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const roster = (team: TeamSide) => ({
      name: names[team].trim() || `Time ${team}`,
      athletes: rosters[team]
        .filter((row) => row.name.trim())
        .map((row) => ({ name: row.name.trim(), jersey_number: row.number ? Number(row.number) : undefined })),
    });
    const team_a = roster("A");
    const team_b = roster("B");
    if (team_a.athletes.length < ROSTER_SIZE[modality] || team_b.athletes.length < ROSTER_SIZE[modality]) {
      setError(`Preencha pelo menos ${ROSTER_SIZE[modality]} atletas por time.`);
      return;
    }

    setSaving(true);
    // Gesto do usuário: o momento certo para pedir a proteção do armazenamento (o Firefox exige).
    void requestStorageProtection();
    try {
      const match = await createMatchWithRoster(getDB(), {
        tenant_id: LOCAL_TENANT_ID,
        modality,
        first_server: firstServer,
        team_a,
        team_b,
      });
      // Navegação completa: a tela de scout vem do pré-cache, mesmo offline (ver HardLink).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/match?id=${encodeURIComponent(match.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const segmented = (active: boolean) =>
    `min-h-14 flex-1 rounded-xl text-lg font-semibold ${active ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`;

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <fieldset className="flex gap-2">
        <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">Modalidade</legend>
        <button type="button" className={segmented(modality === "beach")} onClick={() => chooseModality("beach")}>
          Beach 2×2
        </button>
        <button type="button" className={segmented(modality === "indoor")} onClick={() => chooseModality("indoor")}>
          Indoor 6×6
        </button>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as const).map((team) => (
          <fieldset key={team} className="flex flex-col gap-2 rounded-2xl border-2 border-zinc-800 p-3">
            <legend className="px-1 text-sm uppercase tracking-wide text-zinc-400">Time {team}</legend>
            <input
              className={input}
              placeholder={`Nome do time ${team}`}
              value={names[team]}
              onChange={(e) => setNames((n) => ({ ...n, [team]: e.target.value }))}
            />
            {rosters[team].map((row, i) => (
              <div key={i} className="grid grid-cols-[5rem_1fr] gap-2">
                <input
                  className={`${input} text-center`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="nº"
                  aria-label={`Número da atleta ${i + 1} do time ${team}`}
                  value={row.number}
                  onChange={(e) => updateRow(team, i, { number: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                />
                <input
                  className={input}
                  placeholder={`Atleta ${i + 1}`}
                  aria-label={`Nome da atleta ${i + 1} do time ${team}`}
                  value={row.name}
                  onChange={(e) => updateRow(team, i, { name: e.target.value })}
                />
              </div>
            ))}
            {modality === "indoor" && rosters[team].length < MAX_INDOOR && (
              <button
                type="button"
                className="min-h-12 rounded-xl border-2 border-dashed border-zinc-700 text-zinc-400"
                onClick={() => setRosters((r) => ({ ...r, [team]: [...r[team], ...emptyRows(1)] }))}
              >
                + atleta
              </button>
            )}
          </fieldset>
        ))}
      </div>

      <fieldset className="flex gap-2">
        <legend className="mb-2 text-sm uppercase tracking-wide text-zinc-400">Primeiro saque</legend>
        {(["A", "B"] as const).map((team) => (
          <button key={team} type="button" className={segmented(firstServer === team)} onClick={() => setFirstServer(team)}>
            {names[team].trim() || `Time ${team}`}
          </button>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="min-h-16 rounded-2xl bg-amber-400 text-xl font-bold text-zinc-950 disabled:opacity-50"
      >
        {saving ? "Criando…" : "Começar scout"}
      </button>
    </form>
  );
}
