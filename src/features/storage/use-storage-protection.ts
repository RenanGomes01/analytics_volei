"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getStorageProtection,
  requestStorageProtection,
  type StorageProtection,
} from "@/services/storage/persistence";

async function requestAndRead(): Promise<StorageProtection> {
  await requestStorageProtection();
  return getStorageProtection();
}

/** Estado da proteção do armazenamento. Pede a proteção uma vez ao montar (sem gesto, o Chrome decide sozinho). */
export function useStorageProtection() {
  const [status, setStatus] = useState<StorageProtection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void requestAndRead().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Pedido explícito (gesto do usuário): necessário em navegadores que mostram uma pergunta. */
  const protect = useCallback(async () => setStatus(await requestAndRead()), []);

  return { status, protect };
}
