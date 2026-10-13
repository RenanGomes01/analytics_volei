"use client";

import { useState, type ChangeEvent } from "react";
import { HardLink } from "@/components/hard-link";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import type { DeviceOrigin } from "@/services/export/device-fingerprint";
import { importMatchExport, inspectMatchExport, type ImportPreview } from "@/services/export/import-service";

type State =
  | { step: "idle" }
  | { step: "reading"; fileName: string }
  | { step: "preview"; fileName: string; text: string; preview: ImportPreview }
  | { step: "importing"; fileName: string; preview: ImportPreview }
  | { step: "error"; message: string };

const ORIGIN_LABEL: Record<DeviceOrigin, string> = {
  this_device: "este aparelho",
  known: "já visto antes",
  new: "novo",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
      {children}
    </li>
  );
}

function Report({ preview }: { preview: ImportPreview }) {
  if (!preview.ok || !preview.envelope) {
    return (
      <section className="rounded-2xl border-2 border-red-700 bg-red-950/40 p-4">
        <h2 className="text-lg font-bold text-red-200">Arquivo recusado</h2>
        <p className="mb-2 text-sm text-red-200/80">Nada foi gravado. Problemas encontrados:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {preview.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
    );
  }

  const { envelope, fingerprint, origin, situation, reason, pending } = preview;
  const { match, events, athletes } = envelope.data;
  const score = envelope.summary.score_by_set.map(([a, b]) => `${a}×${b}`).join(" · ");
  const situationText = {
    new: `Partida nova neste aparelho: ${pending?.events ?? 0} eventos e ${pending?.athletes ?? 0} atletas serão importados.`,
    append: `Backup mais novo desta partida: ${pending?.events ?? 0} eventos novos serão importados.`,
    up_to_date: reason,
    diverged: reason,
    conflict: reason,
  }[situation ?? "new"];
  const blocked = situation === "diverged" || situation === "conflict";

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-zinc-900 p-4">
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        <Check ok>Formato volei-scout v{envelope.schema_version}</Check>
        <Check ok>Estrutura dos dados válida</Check>
        <Check ok>Hash íntegro (não foi alterado)</Check>
        <Check ok>Assinatura válida</Check>
      </ul>
      <p className="text-sm">
        Aparelho de origem: <strong className="font-mono">{fingerprint}</strong> ({origin ? ORIGIN_LABEL[origin] : "?"})
        {origin === "new" && (
          <span className="block text-amber-300">
            Primeira vez que este aparelho aparece aqui. Confira se o arquivo veio de quem você espera.
          </span>
        )}
      </p>
      <div>
        <p className="text-xl font-bold">
          {match.team_a.name} × {match.team_b.name}
        </p>
        <p className="text-sm text-zinc-400">
          {match.modality === "beach" ? "Beach" : "Indoor"} · {dateFormat.format(match.created_at)}
          {score && ` · ${score}`} · {events.length} eventos · {athletes.length} atletas
        </p>
        <p className="text-xs text-zinc-500">Exportado em {dateFormat.format(new Date(envelope.exported_at))}</p>
      </div>
      <p
        className={`rounded-xl px-3 py-2 text-sm ${
          blocked ? "bg-red-950/60 text-red-200" : situation === "up_to_date" ? "bg-zinc-800" : "bg-emerald-950/60 text-emerald-100"
        }`}
      >
        {situationText}
      </p>
    </section>
  );
}

/** Importação de uma partida exportada em JSON (Fase 4b). Funciona offline. */
export function ImportScreen() {
  const [state, setState] = useState<State>({ step: "idle" });

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setState({ step: "reading", fileName: file.name });
    try {
      const text = await file.text();
      const preview = await inspectMatchExport(getDB(), text, LOCAL_TENANT_ID);
      setState({ step: "preview", fileName: file.name, text, preview });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function confirm() {
    if (state.step !== "preview") return;
    const { fileName, text, preview } = state;
    setState({ step: "importing", fileName, preview });
    try {
      const result = await importMatchExport(getDB(), text, LOCAL_TENANT_ID);
      if (result.imported && result.match_id) {
        // Navegação completa: a tela de scout vem do pré-cache, mesmo offline (ver HardLink).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/match?id=${encodeURIComponent(result.match_id)}`);
        return;
      }
      setState({ step: "preview", fileName, text, preview: result.preview });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const preview = state.step === "preview" || state.step === "importing" ? state.preview : null;
  const canImport = state.step === "preview" && preview?.ok && (preview.situation === "new" || preview.situation === "append");
  const matchId = preview?.envelope?.data.match.id;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-zinc-600 bg-zinc-900 px-4 text-lg font-semibold active:bg-zinc-800">
        <input type="file" accept=".json,application/json" onChange={onFile} className="sr-only" />
        {state.step === "reading" ? "Lendo arquivo…" : "Escolher arquivo .json"}
      </label>
      {"fileName" in state && <p className="text-center text-sm text-zinc-400">{state.fileName}</p>}

      {state.step === "error" && (
        <p role="alert" className="rounded-xl bg-red-800 px-4 py-3 text-white">
          Não foi possível ler o arquivo: {state.message}
        </p>
      )}

      {preview && <Report preview={preview} />}

      {canImport && (
        <button type="button" onClick={confirm} className="min-h-16 rounded-2xl bg-amber-400 text-xl font-bold text-zinc-950">
          Importar partida
        </button>
      )}
      {state.step === "importing" && <p className="text-center">Importando…</p>}
      {preview?.situation === "up_to_date" && matchId && (
        <HardLink
          href={`/match?id=${encodeURIComponent(matchId)}`}
          className="min-h-14 rounded-2xl bg-zinc-800 px-4 py-4 text-center font-semibold"
        >
          Abrir partida
        </HardLink>
      )}
    </div>
  );
}
