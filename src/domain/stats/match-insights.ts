import type { RallyResult } from "../rally/replay";
import type { TeamSide } from "../types";
import { classifyRally } from "./rally-facts";

/**
 * Leituras de uma partida para os gráficos in-game (e "como os pontos aconteceram" da temporada).
 * Puro: parte dos ralis já reconstruídos por `replayMatch`.
 */

export interface PointKind {
  label: string;
  /** "won" = ponto conquistado (ataque, ace, bloqueio); "error" = erro/falta do adversário. */
  group: "won" | "error";
  count: number;
}

/**
 * Rótulo de como o ponto aconteceu, do ponto de vista de quem ganhou o rali. Vem do mesmo
 * classificador do espelho tático (rally-facts.ts): o mérito daqui é o "cedido" do outro lado.
 */
export function pointKindLabel(r: RallyResult): { label: string; group: PointKind["group"] } {
  const cause = classifyRally(r);
  if (!cause) return { label: "Ponto marcado (sem detalhe)", group: "error" };
  return { label: cause.merit, group: cause.group === "opponent_errors" ? "error" : "won" };
}

/** Conta como os pontos aconteceram nos ralis; `wonBy` limita aos pontos de uma equipe. */
export function rallyPointKinds(rallies: Iterable<RallyResult>, wonBy?: (r: RallyResult) => boolean): PointKind[] {
  const counts = new Map<string, PointKind>();
  for (const r of rallies) {
    if (!r.point_to || (wonBy && !wonBy(r))) continue;
    const { label, group } = pointKindLabel(r);
    const k = counts.get(label) ?? { label, group, count: 0 };
    k.count += 1;
    counts.set(label, k);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

export interface ProgressionPoint {
  /** Número do rali no set (0 = início, 0×0). */
  rally: number;
  A: number;
  B: number;
}

/** Placar rali a rali de cada set (começa em 0×0), para o gráfico de evolução do placar. */
export function scoreProgression(rallies: readonly RallyResult[]): Map<number, ProgressionPoint[]> {
  const sets = new Map<number, ProgressionPoint[]>();
  for (const r of rallies) {
    if (!r.point_to) continue;
    const line = sets.get(r.set_number) ?? [{ rally: 0, A: 0, B: 0 }];
    const last = line[line.length - 1];
    line.push({ rally: line.length, A: last.A + (r.point_to === "A" ? 1 : 0), B: last.B + (r.point_to === "B" ? 1 : 0) });
    sets.set(r.set_number, line);
  }
  return sets;
}

/** Maior sequência de pontos seguidos de cada equipe (no recorte de ralis dado). */
export function longestRuns(rallies: readonly RallyResult[]): Record<TeamSide, number> {
  const best: Record<TeamSide, number> = { A: 0, B: 0 };
  let current: TeamSide | null = null;
  let run = 0;
  let set = 0;
  for (const r of rallies) {
    if (!r.point_to) continue;
    if (r.set_number !== set || r.point_to !== current) {
      set = r.set_number;
      current = r.point_to;
      run = 0;
    }
    run += 1;
    best[current] = Math.max(best[current], run);
  }
  return best;
}

export interface Outcome {
  label: string;
  count: number;
  tone: "good" | "neutral" | "bad";
}

/** Desfecho dos ataques de uma atleta: ponto, erro, bloqueado ou seguiu em jogo. */
export function attackOutcomes(rallies: readonly RallyResult[], athlete_id: string): Outcome[] {
  let kills = 0, errors = 0, stuffed = 0, inPlay = 0;
  for (const r of rallies) {
    r.touches.forEach((t, i) => {
      if (t.athlete_id !== athlete_id || t.skill !== "attack") return;
      const next = r.touches[i + 1];
      if (next && next.team !== t.team && next.skill === "block" && next.quality === "#") stuffed++;
      else if (t.quality === "=") errors++;
      else if (t.quality === "#" && r.point_to === t.team) kills++;
      else inPlay++;
    });
  }
  return [
    { label: "Ponto", count: kills, tone: "good" },
    { label: "Em jogo", count: inPlay, tone: "neutral" },
    { label: "Erro", count: errors, tone: "bad" },
    { label: "Bloqueado", count: stuffed, tone: "bad" },
  ];
}

/** Desfecho dos saques de uma atleta: ace, em jogo, erro na rede, erro fora (e erro sem detalhe, se houver). */
export function serveOutcomes(rallies: readonly RallyResult[], athlete_id: string): Outcome[] {
  let aces = 0, inPlay = 0, net = 0, out = 0, unknown = 0;
  for (const r of rallies) {
    const t = r.touches[0];
    if (!t || t.skill !== "serve" || t.athlete_id !== athlete_id) continue;
    if (r.reason === "ace" && r.point_to === t.team) aces++;
    else if (t.quality === "=") {
      if (t.detail === "net") net++;
      else if (t.detail === "out") out++;
      else unknown++;
    } else inPlay++;
  }
  return [
    { label: "Ace", count: aces, tone: "good" as const },
    { label: "Em jogo", count: inPlay, tone: "neutral" as const },
    { label: "Erro na rede", count: net, tone: "bad" as const },
    { label: "Erro fora", count: out, tone: "bad" as const },
    ...(unknown ? [{ label: "Erro (sem detalhe)", count: unknown, tone: "bad" as const }] : []),
  ];
}
