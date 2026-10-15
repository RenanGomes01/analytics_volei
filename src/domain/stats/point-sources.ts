/**
 * Origem dos pontos (Fase 15): qual fundamento mais pontuou. A soma das fontes é sempre o total de
 * pontos (atleta: ataque + ace + bloqueio; equipe: o placar, com o erro do adversário).
 */

export type PointSourceKey = "kills" | "aces" | "blocks" | "opponent_errors";

export const POINT_SOURCE_LABEL: Record<PointSourceKey, string> = {
  kills: "Ataque",
  aces: "Ace (saque)",
  blocks: "Bloqueio",
  opponent_errors: "Erro do adversário",
};

export interface PointSource {
  key: PointSourceKey;
  label: string;
  count: number;
  share: number;
}

export interface PointSources {
  total: number;
  sources: PointSource[];
  /** Fonte que mais pontuou (null sem pontos; empate = a primeira na ordem do vôlei). */
  dominant: PointSourceKey | null;
}

export function pointSources(points: Partial<Record<PointSourceKey, number>>): PointSources {
  const keys = (["kills", "aces", "blocks", "opponent_errors"] as const).filter((k) => points[k] !== undefined);
  const total = keys.reduce((sum, k) => sum + (points[k] ?? 0), 0);
  const sources = keys.map((key) => ({ key, label: POINT_SOURCE_LABEL[key], count: points[key] ?? 0, share: total ? (points[key] ?? 0) / total : 0 }));
  let dominant: PointSourceKey | null = null;
  for (const s of sources) if (s.count > 0 && (dominant === null || s.count > sources.find((x) => x.key === dominant)!.count)) dominant = s.key;
  return { total, sources, dominant };
}
