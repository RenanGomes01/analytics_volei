import type { AthleteDashboard } from "@/domain/stats/athlete-dashboard";
import type { Rate } from "@/domain/stats/types";
import { LOW_VOLUME_OPACITY, pct, SERIES } from "@/features/charts/palette";
import { Card } from "./ui";

/**
 * Widgets do painel da atleta (Fase 18), nativos (Tailwind, sem biblioteca: leves e bons no PDF).
 * Proporção = barra 100% (nunca pizza); % sempre com o volume; pouco volume esmaecido, nunca escondido.
 * Cor só na marca; números e rótulos em tinta de texto.
 */

/** Abaixo disto a taxa aparece esmaecida (pouca base). */
export const MIN_VOLUME = 5;

interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Barra 100% empilhada, com 2px de folga entre fatias e legenda com valores. */
function StackBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-800" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.label}
                title={`${s.label}: ${s.value} (${pct(s.value / total)})`}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              />
            ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="font-semibold tabular-nums text-zinc-100">{s.value}</span>
            {total > 0 && <span className="tabular-nums text-zinc-500">({pct(s.value / total)})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Medidor de uma proporção (0–100%) com o volume ao lado. */
function Meter({ value, color = SERIES[0], label }: { value: Rate; color?: string; label: string }) {
  const low = value.den < MIN_VOLUME;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800" role="img" aria-label={`${label}: ${pct(value.pct)} (${value.num} de ${value.den})`}>
      {value.pct !== null && (
        <span className="block h-full rounded-full" style={{ width: `${value.pct * 100}%`, background: color, opacity: low ? LOW_VOLUME_OPACITY : 1 }} />
      )}
    </div>
  );
}

function BigRate({ value, of }: { value: Rate; of: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className={`text-3xl font-black tabular-nums ${value.den < MIN_VOLUME ? "text-zinc-500" : ""}`}>{pct(value.pct)}</span>
      <span className="text-sm text-zinc-400">
        {value.num} de {value.den} {of}
        {value.den > 0 && value.den < MIN_VOLUME && " · pouco volume"}
      </span>
    </p>
  );
}

export function BalanceWidget({ balance }: { balance: AthleteDashboard["balance"] }) {
  const { hits, errors, net, kills, aces, blocks } = balance;
  return (
    <Card title="Balanço: acertos × erros" note="Acertos = pontos dela (ataque, ace, bloqueio) · erros = pontos que ela entregou">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-black tabular-nums">
          {net > 0 ? "+" : ""}
          {net}
        </span>
        <span className="text-sm text-zinc-400">saldo ({hits} acertos − {errors} erros)</span>
      </p>
      <StackBar
        label="Acertos e erros"
        segments={[
          { label: "Acertos", value: hits, color: SERIES[0] },
          { label: "Erros", value: errors, color: SERIES[1] },
        ]}
      />
      <p className="text-xs text-zinc-500">
        {kills} de ataque · {aces} de saque · {blocks} de bloqueio
      </p>
    </Card>
  );
}

export function ServeTargetWidget({ target, name }: { target: Rate; name: string }) {
  return (
    <Card title="Alvo do saque" note="Recepções dela ÷ saques que chegaram à dupla (erros de saque fora)">
      <BigRate value={target} of="saques" />
      <Meter value={target} label="Alvo do saque" />
      <p className="text-sm text-zinc-300">
        {target.pct === null
          ? "Nenhum saque chegou à dupla neste recorte."
          : target.pct >= 0.6
            ? `${name} foi o principal alvo: recebeu a maior parte dos saques.`
            : target.pct <= 0.4
              ? `O adversário evitou sacar em ${name}.`
              : "Saques divididos entre as duas."}
      </p>
    </Card>
  );
}

export function AttackIdentityWidget({ attack }: { attack: AthleteDashboard["attack"] }) {
  return (
    <Card title="Identidade ofensiva" note="Em que toque da posse ela ataca e quanto do ataque da dupla é dela">
      <StackBar
        label="Ataques por toque"
        segments={[
          { label: "3º toque", value: attack.third, color: SERIES[0] },
          { label: "Bola de 2ª", value: attack.second, color: SERIES[1] },
          { label: "De 1ª", value: attack.first, color: SERIES[2] },
        ]}
      />
      {attack.second > 0 && (
        <p className="text-xs text-zinc-500">
          Bola de segunda: {attack.secondKills} {attack.secondKills === 1 ? "ponto" : "pontos"} em {attack.second}
        </p>
      )}
      <div className="mt-1 flex flex-col gap-1">
        <p className="text-sm text-zinc-300">Volume na dupla</p>
        <BigRate value={attack.share} of="ataques da dupla" />
        <Meter value={attack.share} color={SERIES[0]} label="Participação no ataque" />
      </div>
    </Card>
  );
}

export function WallWidget({ wall }: { wall: AthleteDashboard["wall"] }) {
  const tiles: [string, number, string][] = [
    ["Pontos de bloqueio", wall.points, "Bloqueio # que virou ponto"],
    ["Toques de bloqueio", wall.touches, "Todas as vezes que subiu no bloqueio"],
    ["Explorada", wall.exploited, "Atacante usou o bloqueio dela (block-out) para ponto"],
    ["Erros de bloqueio", wall.errors, "Rede ou bola pra fora no bloqueio"],
  ];
  return (
    <Card title="Paredão" note="“Explorada” só conta quando o toque de bloqueio dela foi registrado">
      <dl className="grid grid-cols-2 gap-2">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl bg-zinc-950/50 px-3 py-2" title={hint}>
            <dt className="text-xs text-zinc-400">{label}</dt>
            <dd className="text-2xl font-black tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function SideOutWidget({ sideOut }: { sideOut: AthleteDashboard["sideOut"] }) {
  const rows: [string, Rate, string][] = [
    ["Virada de bola (K1)", sideOut.total, "recepções dela"],
    ["Virada de primeira", sideOut.firstBall, "recepções dela"],
    ["No rali longo", sideOut.longRally, "ralis que voltaram"],
    ["Sob pressão (após 2+ perdidos)", sideOut.pressure, "recepções sob pressão"],
  ];
  return (
    <Card title="Virada de bola em detalhe" note={`Quando ela recebe · % esmaecida = menos de ${MIN_VOLUME} lances`}>
      <ul className="flex flex-col gap-3">
        {rows.map(([label, value, of]) => (
          <li key={label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-zinc-300">{label}</span>
              <span className="tabular-nums">
                <span className={`font-bold ${value.den < MIN_VOLUME ? "text-zinc-500" : ""}`}>{pct(value.pct)}</span>
                <span className="text-zinc-500">
                  {" "}
                  ({value.num}/{value.den} {of})
                </span>
              </span>
            </div>
            <Meter value={value} label={label} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
