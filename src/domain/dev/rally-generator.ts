import { impliedPoint, type ImpliedPoint } from "../rally/implied-point";
import { otherTeam, type Quality, type Skill, type TeamSide } from "../types";

/**
 * Gerador de ralis sintéticos (modo detalhado) para homologação dos dashboards.
 * Puro e determinístico: a mesma semente gera sempre os mesmos lances.
 */

export type Rng = () => number;

/** mulberry32: PRNG pequeno e estável entre navegadores. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Notas de 0 a 1 por fundamento. */
export interface PlayerProfile {
  serve: number;
  pass: number;
  attack: number;
  block: number;
  dig: number;
}

export interface GeneratedTouch {
  team: TeamSide;
  athlete_id: string;
  skill: Skill;
  quality: Quality;
}

export interface GeneratedRally {
  touches: GeneratedTouch[];
  end: ImpliedPoint;
}

export interface RallyContext {
  serving_team: TeamSide;
  /** Atleta que saca neste rali. */
  server_id: string;
  /** Ids das duas atletas de cada lado (beach). */
  athletes: Record<TeamSide, [string, string]>;
  profiles: Record<string, PlayerProfile>;
}

type Weights = Partial<Record<Quality, number>>;

function pickQuality(rng: Rng, weights: Weights): Quality {
  const entries = Object.entries(weights).map(([q, w]) => [q as Quality, Math.max(0.005, w ?? 0)] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [q, w] of entries) {
    r -= w;
    if (r <= 0) return q;
  }
  return entries[entries.length - 1][0];
}

const SERVE_PRESSURE: Partial<Record<Quality, number>> = { "+": -0.25, "!": 0, "-": 0.15, "/": 0.25 };
const SET_BONUS: Partial<Record<Quality, number>> = { "#": 0.1, "+": 0.05, "!": -0.05, "-": -0.15 };
/** Qualidades que, em passe/defesa/levantamento/bola de graça, mandam a bola para o outro lado. */
const crosses = (q: Quality) => q === "/";

const MAX_TOUCHES = 40;

/**
 * Gera um rali seguindo a bola: saque → recepção → levantamento → ataque (ou bola de graça) → bloqueio/defesa → …
 * Respeita o limite de 3 toques por lado (bloqueio conta como 1º toque no beach) e termina sempre num lance
 * terminal (`#` em saque/ataque/bloqueio ou `=`), de onde sai o ponto via `impliedPoint`.
 */
export function generateRally(ctx: RallyContext, rng: Rng): GeneratedRally {
  const touches: GeneratedTouch[] = [];
  const p = (id: string) => ctx.profiles[id];
  const partner = (team: TeamSide, id: string) => (ctx.athletes[team][0] === id ? ctx.athletes[team][1] : ctx.athletes[team][0]);
  const push = (team: TeamSide, athlete_id: string, skill: Skill, quality: Quality) => {
    touches.push({ team, athlete_id, skill, quality });
    return quality;
  };
  const finish = (): GeneratedRally => {
    const last = touches[touches.length - 1];
    const end = impliedPoint(last, touches[touches.length - 2]);
    if (!end) throw new Error(`Rali gerado sem lance terminal (${last.skill} ${last.quality}).`);
    return { touches, end };
  };
  const terminal = (q: Quality) => q === "#" || q === "=";

  // Falta rara (rede, invasão), cometida por qualquer atleta em quadra.
  if (rng() < 0.015) {
    const team: TeamSide = rng() < 0.5 ? "A" : "B";
    push(team, ctx.athletes[team][rng() < 0.5 ? 0 : 1], "fault", "=");
    return finish();
  }

  // 1. Saque
  const s = p(ctx.server_id).serve;
  const serveQ = push(ctx.serving_team, ctx.server_id, "serve", pickQuality(rng, {
    "#": 0.03 + 0.08 * s,
    "+": 0.14 + 0.1 * s,
    "!": 0.34,
    "-": 0.22 - 0.08 * s,
    "/": 0.06,
    "=": 0.15 - 0.07 * s,
  }));
  if (terminal(serveQ)) return finish();

  // 2. Recepção: o saque mira mais a passadora mais fraca.
  let team = otherTeam(ctx.serving_team);
  const [r0, r1] = ctx.athletes[team];
  const weaker = p(r0).pass <= p(r1).pass ? r0 : r1;
  const receiver = rng() < 0.62 ? weaker : partner(team, weaker);
  const pass = p(receiver).pass;
  const m = SERVE_PRESSURE[serveQ] ?? 0;
  let firstQ = push(team, receiver, "reception", pickQuality(rng, {
    "#": 0.42 + 0.3 * pass + m,
    "!": 0.3,
    "/": 0.08 - 0.05 * pass - m / 3,
    "=": 0.05 - 0.03 * pass - m / 4,
  }));
  if (firstQ === "=") return finish();
  let first = receiver; // quem deu o 1º toque da posse
  let used = 1; // toques da posse que contam para o limite

  while (touches.length < MAX_TOUCHES) {
    // A bola cruzou (passe/defesa/levantamento de graça): o outro lado defende uma bola fácil.
    if (crosses(firstQ)) {
      team = otherTeam(team);
      first = ctx.athletes[team][rng() < 0.5 ? 0 : 1];
      firstQ = push(team, first, "dig", pickQuality(rng, { "#": 0.35, "+": 0.4, "!": 0.18, "-": 0.05, "=": 0.02 }));
      if (firstQ === "=") return finish();
      used = 1;
      continue;
    }

    // Levantamento (2º toque), a não ser que a posse já venha do bloqueio + defesa.
    let lastQ: Quality = firstQ;
    let lastAthlete: string = first;
    if (used === 1) {
      const setter = partner(team, first);
      const worse = firstQ === "!" || firstQ === "-" ? 0.12 : 0;
      lastQ = push(team, setter, "set", pickQuality(rng, {
        "#": 0.3 - worse,
        "+": 0.4 - worse,
        "!": 0.18 + worse,
        "-": 0.07 + worse,
        "/": 0.02,
        "=": 0.02,
      }));
      if (lastQ === "=") return finish();
      if (crosses(lastQ)) {
        firstQ = lastQ;
        continue;
      }
      lastAthlete = setter;
      used = 2;
    }

    // 3º toque: ataque da parceira de quem levantou, ou bola de graça quando não dá para atacar.
    const hitter = partner(team, lastAthlete);
    const opp = otherTeam(team);
    const [o0, o1] = ctx.athletes[opp];
    const blocker = p(o0).block >= p(o1).block ? o0 : o1;
    const defender = partner(opp, blocker);

    if (lastQ === "-" && rng() < 0.5) {
      const fq = push(team, hitter, "freeball", pickQuality(rng, { "#": 0.05, "+": 0.15, "!": 0.35, "-": 0.3, "/": 0.1, "=": 0.05 }));
      if (fq === "=") return finish();
      team = opp;
      first = defender;
      firstQ = push(team, defender, "dig", pickQuality(rng, { "#": 0.3, "+": 0.4, "!": 0.2, "-": 0.07, "=": 0.03 }));
      if (firstQ === "=") return finish();
      used = 1;
      continue;
    }

    const a = p(hitter).attack;
    const b = p(blocker).block;
    const k = SET_BONUS[lastQ] ?? 0;
    // "x" = ataque bloqueado (vira bloqueio # do adversário logo em seguida).
    const outcomes: Weights & { x?: number } = {
      "#": 0.3 + 0.25 * a + k,
      "+": 0.15,
      "!": 0.17,
      "-": 0.1,
      "/": 0.04,
      "=": 0.13 - 0.06 * a,
    };
    const stuffChance = 0.04 + 0.1 * b;
    if (rng() < stuffChance) {
      push(team, hitter, "attack", "-");
      push(opp, blocker, "block", "#");
      return finish();
    }
    const attackQ = push(team, hitter, "attack", pickQuality(rng, outcomes));
    if (terminal(attackQ)) return finish();

    // Bloqueio que só toca na bola (fica do lado de quem bloqueou e conta como 1º toque).
    team = opp;
    if (rng() < 0.08 + 0.15 * b) {
      push(team, blocker, "block", rng() < 0.5 ? "+" : "!");
      const dq = push(team, defender, "dig", pickQuality(rng, { "+": 0.35, "!": 0.35, "-": 0.2, "=": 0.1 }));
      if (dq === "=") return finish();
      // Bloqueio (1º) + defesa (2º): o 3º toque é o contra-ataque (ou bola de graça) da bloqueadora.
      const counterHitter = blocker;
      const ca = p(counterHitter).attack;
      if (dq === "-" && rng() < 0.6) {
        const fq = push(team, counterHitter, "freeball", pickQuality(rng, { "+": 0.2, "!": 0.4, "-": 0.3, "=": 0.1 }));
        if (fq === "=") return finish();
      } else {
        const cq = push(team, counterHitter, "attack", pickQuality(rng, {
          "#": 0.25 + 0.2 * ca,
          "+": 0.18,
          "!": 0.2,
          "-": 0.12,
          "=": 0.14 - 0.05 * ca,
        }));
        if (terminal(cq)) return finish();
      }
      // a bola volta para quem atacou primeiro
      team = otherTeam(team);
      first = ctx.athletes[team][rng() < 0.5 ? 0 : 1];
      firstQ = push(team, first, "dig", pickQuality(rng, { "#": 0.15, "+": 0.3, "!": 0.3, "-": 0.12, "/": 0.03, "=": 0.1 }));
      if (firstQ === "=") return finish();
      used = 1;
      continue;
    }

    // Defesa direta do ataque.
    const d = p(defender).dig;
    const hard = attackQ === "+" ? 2 : attackQ === "!" ? 1 : 0;
    const errorW = [0.06, 0.16, 0.38][hard] * (1.3 - 0.6 * d);
    firstQ = push(team, defender, "dig", pickQuality(rng, {
      "#": [0.3, 0.12, 0.03][hard],
      "+": [0.4, 0.3, 0.12][hard],
      "!": [0.18, 0.32, 0.22][hard],
      "-": [0.05, 0.1, 0.22][hard],
      "/": [0.01, 0.03, 0.05][hard],
      "=": errorW,
    }));
    if (firstQ === "=") return finish();
    first = defender;
    used = 1;
  }

  // Limite de segurança: encerra com um ataque de quem está com a bola.
  push(team, partner(team, first), "attack", rng() < 0.6 ? "#" : "=");
  return finish();
}
