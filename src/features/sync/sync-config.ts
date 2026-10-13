/** `NEXT_PUBLIC_SYNC_MODE`: "off" (padrão) não envia nada; "mock" usa o MockTransport em memória. */
export type SyncMode = "off" | "mock";

export const SYNC_MODE: SyncMode = process.env.NEXT_PUBLIC_SYNC_MODE === "mock" ? "mock" : "off";
