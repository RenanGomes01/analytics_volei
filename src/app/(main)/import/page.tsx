import { StaffGuard } from "@/features/staff/staff-guard";
import { ImportScreen } from "@/features/import/import-screen";

export const metadata = { title: "Importar partida" };

export default function ImportPage() {
  return (
    <StaffGuard>
      <h1 className="mx-auto w-full max-w-3xl px-4 pb-2 pt-4 text-2xl font-bold">Importar partida</h1>
      <ImportScreen />
    </StaffGuard>
  );
}
