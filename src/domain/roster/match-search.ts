import type { Match } from "../types";
import { normalizeName, resolveAthlete, type AliasMap } from "./identity";

/**
 * Busca de partidas por atleta ou dupla (Fase 17). Puro: o índice é montado uma vez por mudança de
 * dados e a filtragem roda em memória a cada tecla, sem consulta ao banco.
 */

/** Nome atual da atleta (cadastro canônico, mesmo se ela foi unida a outro cadastro); `undefined` se não existe. */
export type AthleteNameOf = (athleteId: string) => string | undefined;

export function athleteNameResolver(athleteById: ReadonlyMap<string, { name: string }>, aliases: AliasMap): AthleteNameOf {
  return (id) => athleteById.get(resolveAthlete(aliases, id))?.name ?? athleteById.get(id)?.name;
}

/** Texto normalizado da partida: nomes das duas duplas (retrato) + nomes atuais das atletas. */
export function matchSearchText(match: Pick<Match, "team_a" | "team_b">, nameOf: AthleteNameOf): string {
  const parts: string[] = [];
  for (const side of [match.team_a, match.team_b]) {
    parts.push(side.name);
    for (const id of side.athlete_ids) {
      const name = nameOf(id);
      if (name) parts.push(name);
    }
  }
  return normalizeName(parts.join(" | "));
}

/** Todas as palavras da busca precisam aparecer (sem acento/maiúsculas). Busca vazia aceita tudo. */
export function matchesQuery(text: string, query: string): boolean {
  const words = normalizeName(query).split(" ").filter(Boolean);
  return words.every((w) => text.includes(w));
}
