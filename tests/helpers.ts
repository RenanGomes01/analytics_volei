import type {
  Match,
  Modality,
  Quality,
  RallyEndEvent,
  RallyEndReason,
  RallyEvent,
  Skill,
  TeamSide,
  TouchEvent,
  VoidEvent,
} from "@/domain/types";

/**
 * Monta um ledger em memória, na ordem de chamada (local_seq crescente).
 * `rally()` abre um novo rali; os toques seguintes pertencem a ele.
 */
export function ledger(match_id = "m1") {
  const events: RallyEvent[] = [];
  let seq = 0;
  let rallyCount = 0;
  let rally_id = "";

  const base = (id: string) => ({
    id,
    tenant_id: "t1",
    match_id,
    set_id: `${match_id}:s1`,
    set_number: 1,
    rally_id,
    rally_number: rallyCount,
    local_seq: ++seq,
    device_id: "test-device",
    timestamp: 1_700_000_000_000 + seq,
  });

  const api = {
    events,
    rally() {
      rally_id = `r${++rallyCount}`;
      return api;
    },
    touch(team: TeamSide, skill: Skill, opts: { athlete_id?: string; quality?: Quality } = {}): TouchEvent {
      const event: TouchEvent = {
        ...base(`e${seq + 1}`),
        kind: "touch",
        phase: "counter_attack",
        team,
        athlete_id: opts.athlete_id ?? `${team}1`,
        skill,
        quality: opts.quality ?? "+",
      };
      events.push(event);
      return event;
    },
    end(point_to: TeamSide, reason: RallyEndReason = "kill"): RallyEndEvent {
      const event: RallyEndEvent = { ...base(`e${seq + 1}`), kind: "rally_end", point_to, reason };
      events.push(event);
      return event;
    },
    void(voids_event_id: string): VoidEvent {
      const event: VoidEvent = { ...base(`e${seq + 1}`), kind: "void", voids_event_id };
      events.push(event);
      return event;
    },
    /** Rali curto: saque e ataque direto, ponto para `winner`. */
    point(server: TeamSide, winner: TeamSide) {
      api.rally();
      api.touch(server, "serve");
      api.end(winner, server === winner ? "ace" : "kill");
      return api;
    },
  };
  return api;
}

/** Sequência de toques em um único rali. */
export function touches(...seq: [TeamSide, Skill][]): TouchEvent[] {
  const l = ledger().rally();
  return seq.map(([team, skill]) => l.touch(team, skill));
}

/** Partida com elenco previsível: A1, A2… e B1, B2… */
export function matchFixture(modality: Modality = "beach", first_server: TeamSide = "A"): Match {
  const size = modality === "beach" ? 2 : 6;
  const ids = (team: TeamSide) => Array.from({ length: size }, (_, i) => `${team}${i + 1}`);
  return {
    id: "m1",
    tenant_id: "t1",
    modality,
    rules_version: `${modality}-2026`,
    team_a: { name: "Time A", athlete_ids: ids("A") },
    team_b: { name: "Time B", athlete_ids: ids("B") },
    first_server,
    created_at: 0,
  };
}
