/**
 * Cabeçalho que só aparece no papel: recorte e data de geração. `title` só quando a tela não tem um
 * título próprio (ex.: Estatísticas da partida); nas outras, o h1 da página já é o título.
 */
export function PrintHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const now = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <header className="hidden border-b-2 border-black pb-2 print:block">
      <p className="text-xs uppercase tracking-wide">Scout Vôlei · relatório técnico</p>
      {title && <h1 className="text-2xl font-bold">{title}</h1>}
      <p className="text-sm">
        {subtitle ? `${subtitle} · ` : ""}gerado em {now}
      </p>
    </header>
  );
}
