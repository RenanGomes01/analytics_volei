/**
 * Qual faixa de conexão mostrar (Fase 11). Puro: recebe o estado e o banner anterior.
 *  - offline: "Sem internet — tudo está sendo salvo neste aparelho." (sempre, inclusive sync off)
 *  - voltou a rede com fila (nuvem ligada): "Conexão restabelecida!…" + Ir para Sincronização
 *  - a fila zerou depois disso: "✓ Tudo enviado" (o componente esconde após alguns segundos)
 */

export type ConnectionBanner =
  | { kind: "none" }
  | { kind: "offline" }
  | { kind: "reconnected"; pending: number; linked: boolean }
  | { kind: "synced" };

export interface ConnectionInput {
  online: boolean;
  /** Itens na fila esperando envio (sem os de teste). */
  pending: number;
  /** Nuvem ligada (modo supabase/mock). */
  cloud: boolean;
  /** Aparelho vinculado a uma conta (só então o envio é automático). */
  linked: boolean;
  /** O analista fechou a faixa de "reconectado". */
  dismissed: boolean;
}

export function nextConnectionBanner(prev: ConnectionBanner, { online, pending, cloud, linked, dismissed }: ConnectionInput): ConnectionBanner {
  if (!online) return { kind: "offline" };
  if (!cloud) return { kind: "none" };
  // A rede acabou de voltar (ou ainda estamos no aviso de reconexão).
  if (prev.kind === "offline" || prev.kind === "reconnected") {
    if (pending > 0) return dismissed ? { kind: "none" } : { kind: "reconnected", pending, linked };
    return prev.kind === "reconnected" ? { kind: "synced" } : { kind: "none" };
  }
  return prev.kind === "synced" ? prev : { kind: "none" };
}
