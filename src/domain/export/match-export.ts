import { replayMatch } from "../rally/replay";
import { rulesFor } from "../rules/modality";
import type { Athlete, Match, RallyEvent, TeamSide } from "../types";

export const EXPORT_FORMAT = "volei-scout/match-export";
export const EXPORT_SCHEMA_VERSION = 1;
export const SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";

/** Exatamente o que o hash e a assinatura cobrem. */
export interface MatchExportData {
  match: Match;
  athletes: Athlete[];
  /** Ledger completo, inclusive VoidEvents, em ordem de local_seq. */
  events: RallyEvent[];
}

export interface MatchExportSignature {
  algorithm: typeof SIGNATURE_ALGORITHM;
  public_key: JsonWebKey;
  /** Assinatura (base64) do JSON canônico de `data`. */
  value: string;
}

export interface MatchExportV1 {
  format: typeof EXPORT_FORMAT;
  schema_version: typeof EXPORT_SCHEMA_VERSION;
  exported_at: string;
  app_version: string;
  source: { device_id: string; tenant_id: string };
  data: MatchExportData;
  /** Derivado, para leitura humana. Fica FORA do hash: pode ser recalculado a partir de `data`. */
  summary: { score_by_set: [number, number][]; winner: TeamSide | null; event_count: number };
  integrity: { algorithm: "SHA-256"; content_hash: string; signature: MatchExportSignature };
}

export type UnsignedMatchExport = Omit<MatchExportV1, "integrity">;

export interface BuildMatchExportInput {
  match: Match;
  athletes: Athlete[];
  events: readonly RallyEvent[];
  exported_at: number;
  app_version: string;
  device_id: string;
}

/** Monta o envelope da exportação (sem criptografia). Puro e determinístico. */
export function buildMatchExport(input: BuildMatchExportInput): UnsignedMatchExport {
  const { match } = input;
  const events = [...input.events].sort((a, b) => a.local_seq - b.local_seq || a.id.localeCompare(b.id));
  const order = [...match.team_a.athlete_ids, ...match.team_b.athlete_ids];
  const athletes = [...input.athletes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const state = replayMatch(events, { rules: rulesFor(match.modality), first_server: match.first_server });

  return {
    format: EXPORT_FORMAT,
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date(input.exported_at).toISOString(),
    app_version: input.app_version,
    source: { device_id: input.device_id, tenant_id: match.tenant_id },
    data: { match, athletes, events },
    summary: {
      score_by_set: state.sets.map((s) => [s.score.A, s.score.B]),
      winner: state.winner,
      event_count: events.length,
    },
  };
}

export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "time";

/** scout_dupla-azul-x-dupla-verde_2026-10-13_27eb1e24.json */
export function exportFilename(match: Match, exported_at: number): string {
  const date = new Date(exported_at).toISOString().slice(0, 10);
  return `scout_${slug(match.team_a.name)}-x-${slug(match.team_b.name)}_${date}_${match.id.slice(0, 8)}.json`;
}
