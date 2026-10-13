import Dexie, { type Table } from "dexie";
import type { Athlete, Match, OutboxEntry, RallyEvent } from "@/domain/types";

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const DB_NAME = "ScoutDB";

export class ScoutDB extends Dexie {
  matches!: Table<Match, string>;
  athletes!: Table<Athlete, string>;
  /** Ledger append-only: nunca chame update/put/delete nesta tabela. */
  rally_events!: Table<RallyEvent, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      matches: "id, tenant_id, created_at",
      athletes: "id, tenant_id, [tenant_id+name]",
      rally_events: "id, tenant_id, [match_id+local_seq], [match_id+set_number], rally_id",
      outbox: "mutation_id, tenant_id, status, [status+created_at], entity_id",
      meta: "key",
    });
  }
}
