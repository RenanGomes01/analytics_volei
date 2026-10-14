import { useSyncExternalStore } from "react";

/**
 * Avisos rápidos de confirmação ("Atleta cadastrada", "Partida enviada para a lixeira"). Store em
 * memória; como os links fazem navegação completa (HardLink), um aviso com `afterNavigation` vai
 * para o sessionStorage e aparece na próxima página.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  run: () => unknown;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastOptions {
  action?: ToastAction;
  /** Mostrar depois da próxima navegação (ex.: "Partida criada" ao chegar no /match). */
  afterNavigation?: boolean;
}

export const MAX_TOASTS = 3;
export const TOAST_MS = 3_500;
export const FLASH_KEY = "scout:flash-toasts";

let toasts: Toast[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

function push(kind: ToastKind, message: string, { action, afterNavigation }: ToastOptions = {}) {
  if (afterNavigation) {
    // A ação (função) não sobrevive à navegação: só a mensagem vai para o próximo carregamento.
    try {
      const saved = JSON.parse(sessionStorage.getItem(FLASH_KEY) ?? "[]") as { kind: ToastKind; message: string }[];
      sessionStorage.setItem(FLASH_KEY, JSON.stringify([...saved, { kind, message }].slice(-MAX_TOASTS)));
      return;
    } catch {
      // Sem storage (aba privada, bloqueado): mostra já, nesta página.
    }
  }
  const toast: Toast = { id: nextId++, kind, message, ...(action ? { action } : {}) };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  // Com ação (ex.: Desfazer) fica um pouco mais para dar tempo de tocar.
  timers.set(toast.id, setTimeout(() => dismissToast(toast.id), action ? TOAST_MS * 2 : TOAST_MS));
  emit();
}

export const toast = {
  success: (message: string, options?: ToastOptions) => push("success", message, options),
  error: (message: string, options?: ToastOptions) => push("error", message, options),
  info: (message: string, options?: ToastOptions) => push("info", message, options),
};

/** Mostra os avisos guardados antes da navegação (chamado uma vez pelo Toaster ao montar). */
export function showFlashToasts() {
  let saved: { kind: ToastKind; message: string }[] = [];
  try {
    saved = JSON.parse(sessionStorage.getItem(FLASH_KEY) ?? "[]");
    sessionStorage.removeItem(FLASH_KEY);
  } catch {
    return;
  }
  for (const t of saved) push(t.kind, t.message);
}

/** Só para testes. */
export function resetToasts() {
  for (const id of timers.keys()) clearTimeout(timers.get(id));
  timers.clear();
  toasts = [];
  emit();
}

export const getToasts = () => toasts;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getToasts, () => EMPTY);
}
