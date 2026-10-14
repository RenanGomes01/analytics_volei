"use client";

import { useCallback, useRef, useState } from "react";

/** Núcleo da trava (testável sem React): enquanto `lock.current`, novas chamadas são ignoradas. */
export async function runOnce<T>(lock: { current: boolean }, fn: () => Promise<T>): Promise<{ ran: false } | { ran: true; value: T }> {
  if (lock.current) return { ran: false };
  lock.current = true;
  try {
    return { ran: true, value: await fn() };
  } finally {
    lock.current = false;
  }
}

/**
 * Trava de envio para botões que gravam (criar atleta, dupla, partida…). A trava é um `ref`: vale
 * no mesmo toque, antes de o React re-renderizar o botão desabilitado — dois toques rápidos no
 * tablet nunca gravam duas vezes. Erros ficam em `error` para o formulário mostrar.
 */
export function useSubmit() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    setBusy(true);
    setError(null);
    try {
      const result = await runOnce(lock, fn);
      return result.ran ? result.value : undefined;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
