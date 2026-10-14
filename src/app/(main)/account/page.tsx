import { AccountScreen } from "@/features/account/account-screen";

export const metadata = { title: "Conta e nuvem" };

export default function AccountPage() {
  return (
    <>
      <h1 className="mx-auto w-full max-w-3xl px-4 pb-2 pt-4 text-2xl font-bold">Conta e nuvem</h1>
      <AccountScreen />
    </>
  );
}
