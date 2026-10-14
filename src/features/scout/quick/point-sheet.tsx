"use client";

import { useState } from "react";
import { BEACH_FAULTS, type QuickChoice, type QuickOutcome } from "@/domain/rally/quick-rally";
import type { Athlete, PointDetail, TeamSide } from "@/domain/types";

interface Props {
  winner: TeamSide;
  options: QuickOutcome[];
  teamName: (t: TeamSide) => string;
  roster: (t: TeamSide) => string[];
  athletes: Map<string, Athlete>;
  saving: boolean;
  onChoose: (choice: QuickChoice) => void;
  onCancel: () => void;
  /** Só no modo rápido (os toques ainda não estão no ledger). */
  onReplay?: () => void;
}

type Step = { kind: "main" } | { kind: "blocker"; option: QuickOutcome } | { kind: "faults" } | { kind: "fault_who"; detail: PointDetail; label: string };

const big = "rounded-2xl font-bold active:scale-[0.98] disabled:opacity-40";
const other = (t: TeamSide): TeamSide => (t === "A" ? "B" : "A");

/**
 * "Ponto X — como foi?": um toque na opção mais comum; "Bloqueado →" pede o bloqueador; "Falta…"
 * abre todas as faltas do vôlei de praia e depois pergunta quem cometeu (ou "não sei quem").
 */
export function PointSheet({ winner, options, teamName, roster, athletes, saving, onChoose, onCancel, onReplay }: Props) {
  const [step, setStep] = useState<Step>({ kind: "main" });
  const loser = other(winner);

  const athleteButtons = (team: TeamSide, pick: (id: string) => void) =>
    roster(team).map((id) => {
      const a = athletes.get(id);
      return (
        <button key={id} type="button" disabled={saving} onClick={() => pick(id)} className={`${big} min-h-20 bg-zinc-200 px-4 text-xl text-zinc-950`}>
          {a?.jersey_number ?? ""} {a?.name ?? id.slice(0, 6)}
        </button>
      );
    });

  let title: string;
  let body: React.ReactNode;
  switch (step.kind) {
    case "main":
      title = `Ponto ${teamName(winner)} — como foi?`;
      body = (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((o, i) => (
              <button
                key={`${o.id}:${o.detail ?? ""}`}
                type="button"
                disabled={saving}
                onClick={() =>
                  o.pick === "blocker" ? setStep({ kind: "blocker", option: o }) : onChoose({ outcome: o.id, detail: o.detail, as_attack: o.as_attack })
                }
                className={`${big} min-h-20 px-4 text-xl ${o.id === "unseen" ? "bg-zinc-700 text-zinc-100" : i === 0 ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-950"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setStep({ kind: "faults" })} className={`${big} min-h-16 bg-red-800 px-4 text-lg text-white`}>
            Falta de {teamName(loser)}… (rede, invasão, dois toques…)
          </button>
        </>
      );
      break;
    case "blocker":
      title = "Quem bloqueou?";
      body = <div className="grid grid-cols-2 gap-2">{athleteButtons(winner, (id) => onChoose({ outcome: "blocked", detail: "blocked", athlete_id: id, as_attack: step.option.as_attack }))}</div>;
      break;
    case "faults":
      title = `Qual falta de ${teamName(loser)}?`;
      body = (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BEACH_FAULTS.map((f) => (
            <button key={f.detail} type="button" onClick={() => setStep({ kind: "fault_who", detail: f.detail, label: f.label })} className={`${big} min-h-16 bg-zinc-200 px-2 text-base text-zinc-950`}>
              {f.label}
            </button>
          ))}
        </div>
      );
      break;
    case "fault_who":
      title = `${step.label}: quem cometeu?`;
      body = (
        <div className="grid grid-cols-2 gap-2">
          {athleteButtons(loser, (id) => onChoose({ outcome: "fault", detail: step.detail, athlete_id: id }))}
          <button type="button" disabled={saving} onClick={() => onChoose({ outcome: "fault", detail: step.detail })} className={`${big} col-span-2 min-h-14 bg-zinc-700 text-lg text-zinc-100`}>
            Não sei quem
          </button>
        </div>
      );
      break;
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-3xl bg-zinc-900 p-4">
        <h2 className="text-center text-2xl font-bold">{title}</h2>
        {body}
        <div className="flex gap-2">
          {step.kind !== "main" && (
            <button type="button" onClick={() => setStep({ kind: "main" })} className="min-h-14 flex-1 rounded-2xl bg-zinc-800 font-semibold">
              ← Voltar
            </button>
          )}
          <button type="button" onClick={onCancel} className="min-h-14 flex-1 rounded-2xl bg-zinc-800 font-semibold">
            Cancelar (o rali continua)
          </button>
        </div>
        {step.kind === "main" && onReplay && (
          <button type="button" onClick={onReplay} className="min-h-12 rounded-2xl text-sm text-zinc-400 underline">
            Rali anulado — repetir o ponto (sem ponto para ninguém)
          </button>
        )}
      </div>
    </div>
  );
}
