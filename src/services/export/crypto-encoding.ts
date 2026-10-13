/** Hash e assinatura (crypto.subtle) só existem em contexto seguro: HTTPS ou localhost. */
export function requireSecureCrypto(): void {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Exportar e importar JSON assinado exige conexão segura: abra o app por HTTPS ou em localhost.");
  }
}

export const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", utf8(text)));
}
