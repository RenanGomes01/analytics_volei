import { describe, expect, it } from "vitest";
import { nextConnectionBanner, type ConnectionBanner, type ConnectionInput } from "@/features/network/connection-banner";

const base: ConnectionInput = { online: true, pending: 0, cloud: true, linked: true, dismissed: false };
const run = (steps: Partial<ConnectionInput>[], start: ConnectionBanner = { kind: "none" }) =>
  steps.reduce<ConnectionBanner[]>((acc, s) => [...acc, nextConnectionBanner(acc.at(-1) ?? start, { ...base, ...s })], []).map((b) => b.kind);

describe("faixa de conexão", () => {
  it("offline sempre avisa que está salvando no aparelho (mesmo com a nuvem desligada)", () => {
    expect(run([{ online: false }])).toEqual(["offline"]);
    expect(run([{ online: false, cloud: false }])).toEqual(["offline"]);
  });

  it("voltou a rede com fila → 'reconectado' (com o total); a fila zera → 'tudo enviado'", () => {
    expect(run([{ online: false, pending: 15 }, { pending: 15 }, { pending: 3 }, { pending: 0 }])).toEqual(["offline", "reconnected", "reconnected", "synced"]);
    const reconnected = nextConnectionBanner({ kind: "offline" }, { ...base, pending: 15, linked: false });
    expect(reconnected).toEqual({ kind: "reconnected", pending: 15, linked: false });
  });

  it("voltou a rede sem nada na fila: some sem alarde", () => {
    expect(run([{ online: false }, {}])).toEqual(["offline", "none"]);
  });

  it("nuvem desligada: nada de 'Ir para Sincronização'", () => {
    expect(run([{ online: false, cloud: false, pending: 5 }, { cloud: false, pending: 5 }])).toEqual(["offline", "none"]);
  });

  it("dispensado pelo analista não volta enquanto estiver online; volta na próxima queda", () => {
    expect(run([{ online: false, pending: 4 }, { pending: 4 }, { pending: 4, dismissed: true }, { pending: 5, dismissed: true }])).toEqual([
      "offline",
      "reconnected",
      "none",
      "none",
    ]);
    expect(run([{ online: false, pending: 4 }, { pending: 4 }], { kind: "none" })).toEqual(["offline", "reconnected"]);
  });

  it("abrir o app já online com fila não mostra 'reconectado' (só depois de uma queda)", () => {
    expect(run([{ pending: 30 }])).toEqual(["none"]);
  });
});
