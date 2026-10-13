export type DeliveryOutcome = "shared" | "downloaded" | "cancelled";

/**
 * Entrega o arquivo ao analista sem depender de internet:
 * em aparelhos de toque, a folha de compartilhamento nativa (WhatsApp, Drive, AirDrop…);
 * nos demais, ou se o compartilhamento falhar, o download clássico.
 */
export async function deliverFile(contents: string, filename: string): Promise<DeliveryOutcome> {
  const file = new File([contents], filename, { type: "application/json" });
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Outro erro de compartilhamento: cai para o download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
