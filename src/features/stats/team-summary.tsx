import type { Modality } from "@/domain/types";
import type { TeamStats } from "@/domain/stats/types";
import { fraction, pct } from "./format";

interface Props {
  modality: Modality;
  name: string;
  stats: TeamStats;
  /** Mostra a % de passe só quando há recepções avaliadas (o modo rápido não avalia o passe). */
  showReception: boolean;
}

function Row({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-zinc-800 py-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="flex items-baseline gap-2 tabular-nums">
        <span className="text-xl font-bold">{value}</span>
        <span className="text-sm text-zinc-400">{detail}</span>
      </dd>
    </div>
  );
}

export function TeamSummary({ modality, name, stats, showReception }: Props) {
  const { points, attack, reception, serve } = stats;
  const chips: [string, number, string][] = [
    ["PA", points.kills, "Pontos de ataque (ataques #)"],
    ["Ace", points.aces, "Aces (saque # ou recepção = do adversário logo após o saque)"],
    ["Blq", points.blocks, "Pontos de bloqueio"],
    ["Err. adv", points.opponent_errors, "Erros do adversário (=, 4 toques, faltas)"],
  ];

  return (
    <section className="rounded-3xl bg-zinc-900 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="truncate text-lg font-bold uppercase tracking-wide">{name}</h3>
        <span className="tabular-nums">
          <span className="text-3xl font-black">{points.total}</span> <span className="text-zinc-400">pts</span>
        </span>
      </header>
      <ul className="mt-2 mb-3 flex flex-wrap gap-2">
        {chips.map(([label, n, title]) => (
          <li key={label} title={title} className="rounded-lg bg-zinc-800 px-2 py-1 text-sm tabular-nums">
            {label} <span className="font-bold">{n}</span>
          </li>
        ))}
      </ul>
      <dl>
        <Row label="Virada de bola (K1)" value={pct(stats.side_out)} detail={fraction(stats.side_out)} />
        <Row label="Quebra de saque (K2)" value={pct(stats.break_point)} detail={fraction(stats.break_point)} />
        <Row
          label="Ataque · eficiência"
          value={pct(attack.efficiency)}
          detail={`${attack.kills} pts · ${attack.errors} erros · ${attack.in_play} em jogo / ${attack.attempts}`}
        />
        {showReception && (
          <Row
            label={modality === "beach" ? "Passe na mão" : "Recepção #+"}
            value={pct(reception.positive)}
            detail={`${fraction(reception.positive)} · ${reception.errors} erro${reception.errors === 1 ? "" : "s"}`}
          />
        )}
        <Row
          label="Saque"
          value={`${serve.aces} ace${serve.aces === 1 ? "" : "s"}`}
          detail={`erros: ${serve.errors_net} rede · ${serve.errors_out} fora${serve.errors > serve.errors_net + serve.errors_out ? ` · ${serve.errors - serve.errors_net - serve.errors_out} s/ detalhe` : ""} / ${serve.attempts}`}
        />
      </dl>
    </section>
  );
}
