import { canonicalJson } from "@/domain/export/canonical-json";
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  SIGNATURE_ALGORITHM,
  type MatchExportV1,
} from "@/domain/export/match-export";
import { validateExportData } from "@/domain/export/validate-export-data";
import { fromBase64, sha256Hex, utf8 } from "./crypto-encoding";
import { ECDSA_P256, ECDSA_SHA256 } from "./device-key";

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  envelope?: MatchExportV1;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Verifica um arquivo de exportação: formato, versão, estrutura dos dados, hash do `data` canônico
 * e assinatura ECDSA.
 * A assinatura prova integridade e origem no aparelho dono da chave pública — a identidade do
 * aparelho só é garantida quando essa chave estiver registrada num servidor confiável.
 */
export async function verifyMatchExport(input: string | unknown): Promise<VerifyResult> {
  let parsed: unknown = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["Arquivo não é um JSON válido."] };
    }
  }

  const errors: string[] = [];
  if (!isObject(parsed)) return { ok: false, errors: ["Conteúdo não é um objeto de exportação."] };
  if (parsed.format !== EXPORT_FORMAT) errors.push(`Formato desconhecido: ${String(parsed.format)}.`);
  if (parsed.schema_version !== EXPORT_SCHEMA_VERSION) errors.push(`Versão não suportada: ${String(parsed.schema_version)}.`);

  const data = parsed.data;
  const integrity = parsed.integrity;
  if (!isObject(data) || !isObject(data.match) || !Array.isArray(data.events) || !Array.isArray(data.athletes)) {
    errors.push("Bloco `data` ausente ou incompleto.");
  }
  if (!isObject(integrity) || !isObject(integrity.signature)) errors.push("Bloco `integrity` ausente.");
  if (errors.length) return { ok: false, errors };

  const envelope = parsed as unknown as MatchExportV1;
  // Estrutura dos dados: um arquivo assinado com outra chave pode ser íntegro e ainda assim malformado.
  errors.push(...validateExportData(envelope.data));

  const canonical = canonicalJson(envelope.data);
  if ((await sha256Hex(canonical)) !== envelope.integrity.content_hash) {
    errors.push("Hash não confere: o conteúdo foi alterado depois da exportação.");
  }

  const { signature } = envelope.integrity;
  if (signature.algorithm !== SIGNATURE_ALGORITHM) {
    errors.push(`Algoritmo de assinatura não suportado: ${String(signature.algorithm)}.`);
  } else {
    try {
      const key = await crypto.subtle.importKey("jwk", signature.public_key, ECDSA_P256, false, ["verify"]);
      const valid = await crypto.subtle.verify(ECDSA_SHA256, key, fromBase64(signature.value), utf8(canonical));
      if (!valid) errors.push("Assinatura inválida para esta chave pública.");
    } catch (e) {
      errors.push(`Não foi possível verificar a assinatura: ${e instanceof Error ? e.message : String(e)}.`);
    }
  }

  return { ok: errors.length === 0, errors, envelope };
}
