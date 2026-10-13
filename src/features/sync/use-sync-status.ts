"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { getSyncStatus } from "@/services/sync/sync-engine";

export function useSyncStatus() {
  return useLiveQuery(() => getSyncStatus(getDB(), LOCAL_TENANT_ID), []);
}
