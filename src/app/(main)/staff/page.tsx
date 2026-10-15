import { StaffScreen } from "@/features/staff/staff-screen";

export const metadata = { title: "Comissão técnica" };

// Rota estática (pré-cacheada): entrada da visão técnica, só leitura.
export default function StaffPage() {
  return <StaffScreen />;
}
