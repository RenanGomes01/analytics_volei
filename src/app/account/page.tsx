import { HardLink } from "@/components/hard-link";
import { AccountScreen } from "@/features/account/account-screen";

export const metadata = { title: "Conta e nuvem" };

export default function AccountPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-4 p-4">
        <HardLink href="/" className="min-h-12 rounded-xl bg-zinc-800 px-4 py-3 font-semibold">
          ← Partidas
        </HardLink>
        <h1 className="text-2xl font-bold">Conta e nuvem</h1>
      </header>
      <AccountScreen />
    </div>
  );
}
