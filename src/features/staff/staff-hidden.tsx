"use client";

import type { ReactNode } from "react";
import { useStaffMode } from "./staff-mode";

/** Some no modo comissão técnica: scout, edição, exclusão, importação, cadastro. */
export function StaffHidden({ children }: { children: ReactNode }) {
  return useStaffMode() ? null : <>{children}</>;
}
