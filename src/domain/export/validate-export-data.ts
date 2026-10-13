import { replayMatch } from "../rally/replay";
import { rulesFor } from "../rules/modality";
import type { RallyEndReason, Quality, Skill } from "../types";

const SKILLS: readonly Skill[] = ["serve", "reception", "set", "attack", "block", "dig", "freeball", "fault"];
const QUALITIES: readonly Quality[] = ["#", "+", "!", "-", "/", "=", "?"];
const REASONS: readonly RallyEndReason[] = ["kill", "ace", "error", "four_touches", "manual"];
const MAX_REPORTED = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isInt = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
const isTeam = (v: unknown) => v === "A" || v === "B";

/**
 * Valida a ESTRUTURA do bloco `data` de uma exportação. Complementa hash e assinatura: um arquivo
 * assinado com outra chave pode ser íntegro e ainda assim malformado. Puro; devolve a lista de erros.
 */
export function validateExportData(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(data)) return ["Bloco `data` não é um objeto."];
  const { match, athletes, events } = data;

  if (!isObj(match) || !isStr(match.id)) return ["Partida sem id."];
  if (match.modality !== "beach" && match.modality !== "indoor") errors.push("Modalidade desconhecida.");
  if (!isTeam(match.first_server)) errors.push("Primeiro sacador inválido.");
  const roster: string[] = [];
  for (const key of ["team_a", "team_b"] as const) {
    const team = match[key];
    if (!isObj(team) || !isStr(team.name) || !Array.isArray(team.athlete_ids) || !team.athlete_ids.every(isStr)) {
      errors.push(`Time ${key === "team_a" ? "A" : "B"} inválido.`);
    } else {
      roster.push(...(team.athlete_ids as string[]));
    }
  }

  if (!Array.isArray(athletes)) return [...errors, "Lista de atletas ausente."];
  const athleteIds = new Set(athletes.filter((a) => isObj(a) && isStr(a.id) && isStr(a.name)).map((a) => (a as Obj).id));
  if (athleteIds.size !== athletes.length) errors.push("Há atletas sem id ou sem nome.");
  for (const id of roster) if (!athleteIds.has(id)) errors.push(`Atleta ${id.slice(0, 8)} do elenco não está no arquivo.`);

  if (!Array.isArray(events)) return [...errors, "Lista de eventos ausente."];
  const ids = new Set<string>();
  const seqs = new Set<number>();
  for (const [i, e] of events.entries()) {
    const at = `Evento ${i + 1}`;
    if (!isObj(e) || !isStr(e.id)) {
      errors.push(`${at}: sem id.`);
      continue;
    }
    if (ids.has(e.id)) errors.push(`${at}: id repetido.`);
    ids.add(e.id);
    if (e.match_id !== match.id) errors.push(`${at}: pertence a outra partida.`);
    if (!isInt(e.local_seq, 1)) errors.push(`${at}: local_seq inválido.`);
    else if (seqs.has(e.local_seq as number)) errors.push(`${at}: local_seq repetido.`);
    else seqs.add(e.local_seq as number);
    if (!isInt(e.set_number, 1) || !isStr(e.rally_id) || typeof e.timestamp !== "number") {
      errors.push(`${at}: set, rali ou horário inválido.`);
    }
    if (e.kind === "touch") {
      if (!isTeam(e.team) || !isStr(e.athlete_id)) errors.push(`${at}: equipe ou atleta inválido.`);
      if (!SKILLS.includes(e.skill as Skill)) errors.push(`${at}: fundamento desconhecido.`);
      if (!QUALITIES.includes(e.quality as Quality)) errors.push(`${at}: qualidade fora da escala.`);
    } else if (e.kind === "rally_end") {
      if (!isTeam(e.point_to) || !REASONS.includes(e.reason as RallyEndReason)) errors.push(`${at}: fim de rali inválido.`);
    } else if (e.kind === "void") {
      if (!isStr(e.voids_event_id)) errors.push(`${at}: anulação sem alvo.`);
    } else {
      errors.push(`${at}: tipo desconhecido.`);
    }
  }
  for (const [i, e] of events.entries()) {
    if (isObj(e) && e.kind === "void" && isStr(e.voids_event_id) && !ids.has(e.voids_event_id)) {
      errors.push(`Evento ${i + 1}: anula um evento que não está no arquivo.`);
    }
  }

  if (errors.length === 0) {
    try {
      replayMatch(events as never, { rules: rulesFor(match.modality as "beach" | "indoor"), first_server: match.first_server as "A" | "B" });
    } catch (e) {
      errors.push(`Não foi possível reconstruir a partida: ${e instanceof Error ? e.message : String(e)}.`);
    }
  }

  return errors.length > MAX_REPORTED
    ? [...errors.slice(0, MAX_REPORTED), `… e mais ${errors.length - MAX_REPORTED} problemas.`]
    : errors;
}
