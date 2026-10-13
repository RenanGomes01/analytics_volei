/** Identidade de atletas e duplas através de partidas. Puro. */

export type AliasMap = ReadonlyMap<string, string>;

/** Id canônico de um atleta (o próprio id, se não for apelido de outro). */
export const resolveAthlete = (aliases: AliasMap, id: string): string => aliases.get(id) ?? id;

/** Chave de uma dupla/elenco: ids canônicos ordenados. Independe da ordem e de quem é "A" ou "B". */
export function pairKey(athleteIds: readonly string[], aliases: AliasMap = new Map()): string {
  return [...new Set(athleteIds.map((id) => resolveAthlete(aliases, id)))].sort().join("|");
}

/** Para busca: sem acento, minúsculas e espaços normalizados. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const matchesSearch = (query: string, ...texts: string[]): boolean => {
  const q = normalizeName(query);
  return q === "" || texts.some((t) => normalizeName(t).includes(q));
};
