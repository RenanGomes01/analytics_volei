export const metadata = { title: "Sem conexão" };

export default function Offline() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">Página ainda não disponível offline</h1>
      <p className="max-w-sm text-sm opacity-70">
        Esta tela não foi carregada enquanto havia internet. Os dados de scout continuam salvos neste aparelho.
      </p>
    </main>
  );
}
