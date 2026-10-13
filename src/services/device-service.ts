import type { ScoutDB } from "@/db/schema";

const DEVICE_ID_KEY = "device_id";

/** Identificador estável deste aparelho, criado na primeira gravação. */
export async function getDeviceId(db: ScoutDB): Promise<string> {
  const stored = await db.meta.get(DEVICE_ID_KEY);
  if (typeof stored?.value === "string") return stored.value;
  const id = crypto.randomUUID();
  await db.meta.add({ key: DEVICE_ID_KEY, value: id });
  return id;
}
