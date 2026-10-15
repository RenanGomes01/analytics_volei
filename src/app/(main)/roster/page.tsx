import { StaffGuard } from "@/features/staff/staff-guard";
import { RosterScreen } from "@/features/roster/roster-screen";

export const metadata = { title: "Atletas e duplas" };

export default function RosterPage() {
  return (
    <StaffGuard>
      <h1 className="mx-auto w-full max-w-3xl px-4 pt-4 text-2xl font-bold">Atletas e duplas</h1>
      <RosterScreen />
    </StaffGuard>
  );
}
