import type { Gender } from "../types";

/** Identidade de atletas e duplas através de partidas. Puro. */

export type AliasMap = ReadonlyMap<string, string>;

/** Id canônico de um atleta (o próprio id, se não for apelido de outro). */
export const resolveAthlete = (aliases: AliasMap, id: string): string => aliases.get(id) ?? id;

/** Chave de uma dupla/elenco: ids canônicos ordenados. Independe da ordem e de quem é "A" ou "B". */
export function pairKey(athleteIds: readonly string[], aliases: AliasMap = new Map()): string {
  return [...new Set(athleteIds.map((id) => resolveAthlete(aliases, id)))].sort().join("|");
}

/** Gênero da dupla/time, deduzido das atletas: "M", "F", "Mixed" ou null se faltar o gênero de alguém. */
export function teamGender(genders: readonly (Gender | undefined)[]): Gender | "Mixed" | null {
  if (genders.length === 0 || genders.some((g) => !g)) return null;
  if (genders.every((g) => g === "M")) return "M";
  if (genders.every((g) => g === "F")) return "F";
  return "Mixed";
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
