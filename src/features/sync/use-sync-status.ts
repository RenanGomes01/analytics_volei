"use client";

import { useVisibleLiveQuery } from "@/lib/use-visible-live-query";
import { getDB } from "@/db/client";
import { LOCAL_TENANT_ID } from "@/lib/tenant";
import { getSyncStatus } from "@/services/sync/sync-engine";

export function useSyncStatus() {
  return useVisibleLiveQuery(() => getSyncStatus(getDB(), LOCAL_TENANT_ID), []);
}
