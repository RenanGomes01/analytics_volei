import type { ModalityRules } from "../rules/modality";
import type { TeamSide, TouchEvent } from "../types";

export interface Possession {
  team: TeamSide;
  /** Toques que contam para o limite de `maxTouchesPerSide`. */
  touches: number;
  event_ids: string[];
}

export interface TouchViolation {
  reason: "four_touches";
  team: TeamSide;
  at_event_id: string;
}

export interface TouchCount {
  possessions: Possession[];
  violation?: TouchViolation;
}

/** Contato que não entra na contagem de toques da posse. */
function isUncountedContact(event: TouchEvent, rules: ModalityRules): boolean {
  if (event.skill === "serve") return true;
  return event.skill === "block" && !rules.blockCountsAsTouch;
}

/**
 * Conta os toques de cada posse de um rali, na ordem dos eventos.
 * A posse troca quando o contato é da outra equipe. Para no primeiro excesso de toques.
 */
export function countTouches(events: readonly TouchEvent[], rules: ModalityRules): TouchCount {
  const possessions: Possession[] = [];

  for (const event of events) {
    if (event.skill === "fault") continue; // falta sem contato com a bola

    let current = possessions.at(-1);
    if (!current || current.team !== event.team) {
      current = { team: event.team, touches: 0, event_ids: [] };
      possessions.push(current);
    }
    current.event_ids.push(event.id);

    if (isUncountedContact(event, rules)) continue;
    current.touches += 1;
    if (current.touches > rules.maxTouchesPerSide) {
      return { possessions, violation: { reason: "four_touches", team: event.team, at_event_id: event.id } };
    }
  }

  return { possessions };
}
