"use client";

/**
 * "Exportar PDF" (Fase 15): impressão nativa do navegador (Salvar como PDF). Zero biblioteca,
 * funciona offline. O layout de papel vem do `@media print` (globals.css): A4, fundo branco, sem
 * menus nem botões, detalhamentos abertos.
 */
export function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-print="hide"
      className={`min-h-12 rounded-xl bg-sky-200 px-4 font-semibold text-sky-950 ${className}`}
      title="Abre a impressão: escolha “Salvar como PDF”"
    >
      ⎙ Exportar PDF
    </button>
  );
}
