import { canonicalJson } from "@/domain/export/canonical-json";
import type { MatchExportV1 } from "@/domain/export/match-export";
import type { Athlete, Match, RallyEvent } from "@/domain/types";
import type { ScoutDB } from "@/db/schema";
import { enqueue } from "../outbox-service";
import { listMatchEvents } from "../rally-ledger-service";
import { classifyOrigin, keyFingerprint, rememberDevice, type DeviceOrigin } from "./device-fingerprint";
import { verifyMatchExport } from "./verify-export";

/**
 * Importação de um JSON exportado (Fase 4b). Regra append-only: nunca sobrescreve nada local.
 *  - new         partida não existe aqui → importa tudo
 *  - up_to_date  mesmos dados → nada a fazer (reimportar é inofensivo)
 *  - append      arquivo é superconjunto do que há aqui → importa só o que falta
 *  - diverged    este aparelho tem eventos que o arquivo não tem → recusa (não mescla ledgers)
 *  - conflict    mesmo id com conteúdo diferente → recusa
 */
export type ImportSituation = "new" | "up_to_date" | "append" | "diverged" | "conflict";

interface Plan {
  situation: ImportSituation;
  reason: string | null;
  match: Match | null;
  athletes: Athlete[];
  events: RallyEvent[];
}

export interface ImportPreview {
  ok: boolean;
  errors: string[];
  envelope?: MatchExportV1;
  fingerprint?: string;
  origin?: DeviceOrigin;
  situation?: ImportSituation;
  reason?: string | null;
  /** O que seria gravado. */
  pending?: { match: boolean; athletes: number; events: number };
}

export interface ImportResult {
  imported: boolean;
  preview: ImportPreview;
  match_id?: string;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** Compara o arquivo (já com o tenant local) com o banco. Só usa o Dexie: pode rodar dentro de transação. */
async function planImport(db: ScoutDB, envelope: MatchExportV1, tenant_id: string): Promise<Plan> {
  const retenant = <T extends { tenant_id: string }>(row: T): T => ({ ...row, tenant_id });
  const match = retenant(envelope.data.match);
  const athletes = envelope.data.athletes.map(retenant);
  const events = envelope.data.events.map(retenant);
  const conflict = (reason: string): Plan => ({ situation: "conflict", reason, match: null, athletes: [], events: [] });

  const localMatch = await db.matches.get(match.id);
  if (localMatch && !same(localMatch, match)) return conflict("Os dados da partida neste aparelho são diferentes dos do arquivo.");

  // Atletas são CADASTRO (editáveis na Fase 5): se o id já existe, vale a versão local, sem conflito.
  // Partida e lances continuam com comparação estrita.
  const localAthletes = await db.athletes.bulkGet(athletes.map((a) => a.id));
  const newAthletes: Athlete[] = athletes.filter((_, i) => !localAthletes[i]);

  const incoming = new Map(events.map((e) => [e.id, e]));
  const localEvents = localMatch ? await listMatchEvents(db, { tenant_id, match_id: match.id }) : [];
  for (const local of localEvents) {
    const theirs = incoming.get(local.id);
    if (!theirs) {
      return {
        situation: "diverged",
        reason: "Esta partida foi alterada neste aparelho depois do backup. Não é possível mesclar.",
        match: null,
        athletes: [],
        events: [],
      };
    }
    if (!same(local, theirs)) return conflict("Um lance deste aparelho está diferente no arquivo.");
  }
  const known = new Set(localEvents.map((e) => e.id));
  const newEvents = events.filter((e) => !known.has(e.id)).sort((a, b) => a.local_seq - b.local_seq);

  if (!localMatch) return { situation: "new", reason: null, match, athletes: newAthletes, events: newEvents };
  if (newAthletes.length === 0 && newEvents.length === 0) {
    return { situation: "up_to_date", reason: "Nada novo para importar: este aparelho já tem tudo.", match: null, athletes: [], events: [] };
  }
  return { situation: "append", reason: null, match: null, athletes: newAthletes, events: newEvents };
}

/** Verifica o arquivo e mostra o que a importação faria. Não grava nada. */
export async function inspectMatchExport(db: ScoutDB, input: string | unknown, tenant_id: string): Promise<ImportPreview> {
  const verified = await verifyMatchExport(input);
  if (!verified.ok || !verified.envelope) return { ok: false, errors: verified.errors };

  const envelope = verified.envelope;
  const fingerprint = await keyFingerprint(envelope.integrity.signature.public_key);
  const [origin, plan] = await Promise.all([classifyOrigin(db, fingerprint), planImport(db, envelope, tenant_id)]);
  return {
    ok: true,
    errors: [],
    envelope,
    fingerprint,
    origin,
    situation: plan.situation,
    reason: plan.reason,
    pending: { match: !!plan.match, athletes: plan.athletes.length, events: plan.events.length },
  };
}

/** Importa o arquivo numa única transação (tudo ou nada). Recusa conflitos e ledgers divergentes. */
export async function importMatchExport(
  db: ScoutDB,
  input: string | unknown,
  tenant_id: string,
  { now = Date.now() }: { now?: number } = {},
): Promise<ImportResult> {
  const preview = await inspectMatchExport(db, input, tenant_id);
  if (!preview.ok || !preview.envelope || !preview.fingerprint) return { imported: false, preview };
  const { envelope, fingerprint } = preview;

  return db.transaction("rw", [db.matches, db.athletes, db.rally_events, db.outbox, db.meta], async () => {
    // Reavalia dentro da transação: o banco pode ter mudado desde a pré-visualização.
    const plan = await planImport(db, envelope, tenant_id);
    if (plan.situation !== "new" && plan.situation !== "append") {
      return { imported: false, preview: { ...preview, situation: plan.situation, reason: plan.reason } };
    }

    // Mesma ordem da criação: atletas, partida, eventos (ordem de envio do outbox).
    for (const athlete of plan.athletes) {
      await db.athletes.add(athlete);
      await enqueue(db, "athlete", athlete);
    }
    if (plan.match) {
      await db.matches.add(plan.match);
      await enqueue(db, "match", plan.match);
    }
    for (const event of plan.events) {
      await db.rally_events.add(event);
      await enqueue(db, "rally_event", event);
    }
    await rememberDevice(db, fingerprint, now);
    return { imported: true, preview: { ...preview, situation: plan.situation }, match_id: envelope.data.match.id };
  });
}
