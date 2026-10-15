"use client";

import { useSyncExternalStore } from "react";

/**
 * Modo comissão técnica (Fase 15): foco de INTERFACE, não controle de acesso. Neste aparelho, as
 * telas mostram só análise (temporada, torneios, atletas, relatórios) e escondem scout e CRUD.
 * Fica no localStorage (preferência do aparelho); sem armazenamento, o modo fica desligado.
 */

const KEY = "scout:staff-mode";
const EVENT = "scout:staff-mode-change";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem" | "removeItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStaffMode(from: Reader | null = storage()): boolean {
  try {
    return from?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeStaffMode(on: boolean, to: Writer | null = storage()): void {
  try {
    if (on) to?.setItem(KEY, "1");
    else to?.removeItem(KEY);
  } catch {
    // Sem armazenamento (aba privada, bloqueio): o modo vale só até recarregar.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStaffMode(): boolean {
  return useSyncExternalStore(subscribe, () => readStaffMode(), () => false);
}
