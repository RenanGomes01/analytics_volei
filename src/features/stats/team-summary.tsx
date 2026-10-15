import type { ReactNode } from "react";
import type { Modality } from "@/domain/types";
import type { TeamStats } from "@/domain/stats/types";
import { explainBreakPoint, explainEfficiency, explainPass, explainSideOut } from "./explain";
import { pct } from "./format";

interface Props {
  modality: Modality;
  name: string;
  stats: TeamStats;
  /** Mostra a % de passe só quando há recepções avaliadas (o modo rápido não avalia o passe). */
  showReception: boolean;
}

type Tone = "good" | "bad" | "neutral";
const TONE: Record<Tone, string> = {
  good: "bg-emerald-900/60 text-emerald-100",
  bad: "bg-red-900/50 text-red-100",
  neutral: "bg-zinc-800 text-zinc-200",
};

/** Pílula "Pontos 11": um número com nome, nunca uma equação corrida. */
export function Pill({ label, value, tone = "neutral", title }: { label: string; value: ReactNode; tone?: Tone; title?: string }) {
  return (
    <li title={title} className={`flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 text-sm tabular-nums print:border print:border-zinc-400 ${TONE[tone]}`}>
      <span>{label}</span>
      <strong className="text-base">{value}</strong>
    </li>
  );
}

/** Barra fina empilhada (ex.: ponto | em jogo | erro), proporcional ao total. */
function SplitBar({ parts }: { parts: { value: number; className: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800 print-track" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {parts.map((p) => (p.value > 0 ? <span key={p.label} className={`${p.className} print-bar`} style={{ width: `${(p.value / total) * 100}%` }} /> : null))}
    </div>
  );
}

/** Bloco de uma métrica: nome, número grande, frase em português e (opcional) as partes. */
function Metric({ label, value, explain, children }: { label: string; value: string; explain: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-800 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-zinc-300">{label}</dt>
        <dd className="text-2xl font-black tabular-nums">{value}</dd>
      </div>
      <p className="text-sm text-zinc-400">{explain}</p>
      {children}
    </div>
  );
}

/**
 * Resumo da equipe (Fase 16): cada número vem com a tradução ("14 viradas de bola em 16 saques
 * recebidos") e o ataque/saque são separados em pílulas — nada de "53% 11 pts · 1 erros · 7 em jogo / 19".
 */
export function TeamSummary({ modality, name, stats, showReception }: Props) {
  const { points, attack, reception, serve } = stats;
  const serveUnknown = serve.errors - serve.errors_net - serve.errors_out;
  const serveInPlay = Math.max(0, serve.attempts - serve.aces - serve.errors);

  return (
    <section className="rounded-3xl bg-zinc-900 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="truncate text-lg font-bold uppercase tracking-wide">{name}</h3>
        <span className="tabular-nums">
          <span className="text-3xl font-black">{points.total}</span> <span className="text-zinc-400">pts</span>
        </span>
      </header>
      <ul className="mt-2 mb-1 flex flex-wrap gap-2" aria-label="Como os pontos saíram">
        <Pill label="Ataque" value={points.kills} title="Pontos de ataque (ataques #)" />
        <Pill label="Ace" value={points.aces} title="Saque # ou recepção = do adversário logo após o saque" />
        <Pill label="Bloqueio" value={points.blocks} title="Pontos de bloqueio" />
        <Pill label="Erro do adversário" value={points.opponent_errors} title="Erros (=), 4 toques e faltas do adversário" />
      </ul>
      <dl>
        <Metric label="Virada de bola (K1)" value={pct(stats.side_out)} explain={explainSideOut(stats.side_out)} />
        <Metric label="Quebra de saque (K2)" value={pct(stats.break_point)} explain={explainBreakPoint(stats.break_point)} />
        <Metric label="Eficiência de ataque" value={pct(attack.efficiency)} explain={explainEfficiency(attack)}>
          <ul className="flex flex-wrap gap-1.5">
            <Pill label="Pontos" value={attack.kills} tone="good" />
            <Pill label="Erros" value={attack.errors} tone="bad" />
            <Pill label="Em jogo" value={attack.in_play} />
            <Pill label="Total" value={attack.attempts} />
          </ul>
          <SplitBar
            parts={[
              { label: "pontos", value: attack.kills, className: "bg-emerald-500" },
              { label: "em jogo", value: attack.in_play, className: "bg-zinc-500" },
              { label: "erros", value: attack.errors, className: "bg-red-500" },
            ]}
          />
        </Metric>
        {showReception && (
          <Metric label={modality === "beach" ? "Passe na mão" : "Recepção #+"} value={pct(reception.positive)} explain={explainPass(reception.positive, modality === "beach")}>
            {reception.errors > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                <Pill label="Aces sofridos" value={reception.errors} tone="bad" />
              </ul>
            )}
          </Metric>
        )}
        <Metric
          label="Saque"
          value={`${serve.aces} ${serve.aces === 1 ? "ace" : "aces"}`}
          explain={serve.attempts ? `${serve.attempts} ${serve.attempts === 1 ? "saque" : "saques"}: ${serveInPlay} em jogo, ${serve.errors} ${serve.errors === 1 ? "erro" : "erros"}` : "nenhum saque ainda"}
        >
          <ul className="flex flex-wrap gap-1.5">
            <Pill label="Aces" value={serve.aces} tone="good" />
            <Pill label="Em jogo" value={serveInPlay} />
            <Pill label="Na rede" value={serve.errors_net} tone="bad" />
            <Pill label="Fora" value={serve.errors_out} tone="bad" />
            {serveUnknown > 0 && <Pill label="Erro s/ detalhe" value={serveUnknown} tone="bad" />}
          </ul>
        </Metric>
      </dl>
    </section>
  );
}
