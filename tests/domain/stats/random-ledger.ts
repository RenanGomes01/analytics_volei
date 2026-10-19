import type { PointDetail, Quality, RallyEvent, Skill, TeamSide } from "@/domain/types";
import { ledger, matchFixture } from "../../helpers";

/** Ledger aleatório com semente fixa (testes de invariantes das Fases 16 e 19). */

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKILLS: Skill[] = ["reception", "set", "attack", "block", "dig", "freeball", "fault"];
const QUALITIES: Quality[] = ["#", "+", "!", "-", "/", "="];
const DETAILS: (PointDetail | undefined)[] = [undefined, undefined, "shot", "block_out", "out", "net", "net_touch"];

export function randomMatch(seed: number, rallies: number, id = `m${seed}`) {
  const random = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const team = (): TeamSide => (random() < 0.5 ? "A" : "B");
  const l = ledger(id);
  for (let r = 0; r < rallies; r++) {
    l.rally();
    const server = team();
    l.touch(server, "serve", { athlete_id: `${server}${1 + Math.floor(random() * 2)}`, quality: pick(QUALITIES) });
    for (let i = 0; i < Math.floor(random() * 7); i++) {
      const t = team();
      l.touch(t, pick(SKILLS), { athlete_id: `${t}${1 + Math.floor(random() * 2)}`, quality: pick(QUALITIES) });
    }
    // Bola que passou pela defesa (o padrão do bug): ataque # → defesa = do adversário → ponto.
    if (random() < 0.2) {
      const atk = team();
      l.touch(atk, "attack", { athlete_id: `${atk}${1 + Math.floor(random() * 2)}`, quality: "#" });
      l.touch(atk === "A" ? "B" : "A", "dig", { athlete_id: `${atk === "A" ? "B" : "A"}${1 + Math.floor(random() * 2)}`, quality: "=" });
      l.end(atk, "kill");
    } else if (random() < 0.15) l.end(team(), pick(["manual", "kill", "ace"] as const));
    if (random() < 0.1) l.void(pick(l.events).id);
  }
  for (const e of l.events) if (e.kind === "touch" && pick(DETAILS)) e.detail = pick(DETAILS);
  return { match: { ...matchFixture("beach"), id }, events: l.events as RallyEvent[] };
}
