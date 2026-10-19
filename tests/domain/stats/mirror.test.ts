import { describe, expect, it } from "vitest";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES } from "@/domain/rules/modality";
import { aggregateCompetition } from "@/domain/stats/aggregate";
import { drillDown, factsIn, scoredBreakdown } from "@/domain/stats/drill";
import { duelLabel } from "@/domain/stats/fact-labels";
import { buildAnalytics } from "@/domain/stats/facts";
import { setStory, storyLines } from "@/domain/stats/match-story";
import { causeRows, concededByAthlete, mirrorRows, pointsConceded, pointsWon } from "@/domain/stats/rally-facts";
import { athleteColumns } from "@/domain/stats/stat-columns";
import type { TeamSide } from "@/domain/types";
import { explainBreakPoint, explainEfficiency, explainPass, explainSideOut } from "@/features/stats/explain";
import { rate } from "@/domain/stats/rate";
import { ledger, matchFixture } from "../../helpers";
import { randomMatch } from "./random-ledger";

/** Fase 16 — espelho tático, duelos, narrativa do placar e textos traduzidos. */

const PAIR = { A: "A1|A2", B: "B1|B2" } as const;

describe("espelho tático (ledgers aleatórios)", () => {
  it.each([3, 21, 99, 2026])("semente %i: o mérito de uma dupla é exatamente o que a outra cedeu", (seed) => {
    const matches = [randomMatch(seed, 160)];
    const { rallies } = buildAnalytics(matches);
    const stats = aggregateCompetition(matches);
    const state = replayMatch(matches[0].events, { rules: BEACH_RULES, first_server: "A" });
    for (const [w, l] of [["A", "B"], ["B", "A"]] as const) {
      const won = pointsWon(rallies, { pair_key: PAIR[w] });
      const lost = pointsConceded(rallies, { pair_key: PAIR[l] });
      // (a) mesma causa, mesma contagem, nos dois lados
      const merit = new Map(causeRows(won, "merit").map((r) => [r.code, r.count]));
      const conceded = new Map(causeRows(lost, "conceded").map((r) => [r.code, r.count]));
      expect(conceded).toEqual(merit);
      expect(mirrorRows(rallies, { pair_key: PAIR[w] }).reduce((s, r) => s + r.count, 0)).toBe(won.length);
      // (b) os pontos cedidos por L são o placar de W
      expect(lost.length).toBe(state.sets.reduce((s, set) => s + set.score[w], 0));
      // (c) os grupos batem com a origem dos pontos (rally-lines)
      const pts = stats.teams[PAIR[w]].points;
      for (const g of ["kills", "aces", "blocks", "opponent_errors"] as const) expect(won.filter((f) => f.group === g).length, g).toBe(pts[g]);
      // (d) atletas + "sem atleta" = dupla
      const { byAthlete, unattributed } = concededByAthlete(lost);
      expect([...byAthlete.values()].reduce((s, n) => s + n, 0) + unattributed).toBe(lost.length);
    }
  });
});

describe("hotfix: nenhum ponto da atleta fica fora do detalhamento", () => {
  it.each([3, 21, 99, 2026, 7, 11])("semente %i: 'Como cada ponto saiu' soma exatamente os Pts de cada atleta", (seed) => {
    const matches = [randomMatch(seed, 160)];
    const { touches } = buildAnalytics(matches);
    const stats = aggregateCompetition(matches);
    for (const a of Object.values(stats.athletes)) {
      const b = scoredBreakdown(factsIn(touches, { athlete_id: a.athlete_id }));
      expect(b.total, a.athlete_id).toBe(a.points);
      expect(b.rows.reduce((s, r) => s + r.count, 0)).toBe(a.points);
      const count = (label: string) => b.rows.find((r) => r.label === label)?.count ?? 0;
      expect(count("Ace")).toBe(a.serve.aces);
      expect(count("Ponto de bloqueio")).toBe(a.blocks);
      expect(b.rows.filter((r) => r.label !== "Ace" && r.label !== "Ponto de bloqueio").reduce((s, r) => s + r.count, 0)).toBe(a.attack.kills);
      if (b.total) expect(b.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10); // % sobre o total real
    }
  });

  it("ataque # → defesa = do adversário → ponto: a autora é a atacante e a culpada é a defensora", () => {
    const l = ledger("pd");
    l.rally();
    l.touch("B", "serve", { athlete_id: "B1" });
    l.touch("A", "reception", { athlete_id: "A2" });
    l.touch("A", "set", { athlete_id: "A2" });
    l.touch("A", "attack", { athlete_id: "A1", quality: "#" });
    l.touch("B", "dig", { athlete_id: "B2", quality: "=" });
    l.end("A", "kill");
    const matches = [{ match: { ...matchFixture("beach"), id: "pd" }, events: l.events }];
    const { rallies, touches } = buildAnalytics(matches);
    expect(rallies[0]).toMatchObject({ code: "attack:Ataque (3º toque)", merit: "Ataque (3º toque)", conceded: "Ataque (3º toque) não defendido", scorer: "A1", culprit: "B2", group: "kills" });
    expect(scoredBreakdown(factsIn(touches, { athlete_id: "A1" })).rows).toEqual([expect.objectContaining({ label: "Ataque (3º toque)", count: 1, share: 1 })]);
  });
});

describe("tabela de espelhos e duelos (cenário fixo)", () => {
  function scenario() {
    const l = ledger("fix");
    // 4 pontos de A explorando o bloqueio de B2 (o toque de bloqueio foi registrado em 2 deles).
    for (let k = 0; k < 4; k++) {
      l.rally();
      l.touch("B", "serve", { athlete_id: "B1" });
      l.touch("A", "reception", { athlete_id: "A2" });
      l.touch("A", "set", { athlete_id: "A2" });
      if (k < 2) {
        l.touch("A", "attack", { athlete_id: "A1", quality: "+" });
        l.touch("B", "block", { athlete_id: "B2", quality: "-" });
        l.touch("B", "dig", { athlete_id: "B1", quality: "+" });
        l.touch("B", "set", { athlete_id: "B2" });
        l.touch("B", "attack", { athlete_id: "B1", quality: "+" });
        l.touch("A", "block", { athlete_id: "A1", quality: "-" });
      }
      const atk = l.touch("A", "attack", { athlete_id: "A1", quality: "#" });
      atk.detail = "block_out";
      l.end("A", "kill");
    }
    // B1 é bloqueada por A1 para ponto.
    l.rally();
    l.touch("A", "serve", { athlete_id: "A2" });
    l.touch("B", "reception", { athlete_id: "B2" });
    l.touch("B", "set", { athlete_id: "B2" });
    l.touch("B", "attack", { athlete_id: "B1", quality: "+" });
    l.touch("A", "block", { athlete_id: "A1", quality: "#" });
    // Ace de A2 em B2.
    l.rally();
    l.touch("A", "serve", { athlete_id: "A2", quality: "#" });
    return [{ match: { ...matchFixture("beach"), id: "fix" }, events: l.events }];
  }

  it("Explorou o bloqueio ×4 de A ↔ Bloqueio explorado ×4 de B, com a bloqueadora quando registrada", () => {
    const { rallies } = buildAnalytics(scenario());
    const merit = causeRows(pointsWon(rallies, { pair_key: PAIR.A }), "merit");
    const conceded = causeRows(pointsConceded(rallies, { pair_key: PAIR.B }), "conceded");
    expect(merit.find((r) => r.code === "block_out")).toMatchObject({ label: "Explorou o bloqueio", count: 4, leader: { athlete_id: "A1", count: 4 } });
    expect(conceded.find((r) => r.code === "block_out")).toMatchObject({ label: "Bloqueio explorado", count: 4, fault: "opponent", leader: { athlete_id: "B2", count: 2 } });
    expect(conceded.find((r) => r.code === "block_point")).toMatchObject({ label: "Ataque bloqueado", count: 1, fault: "own", leader: { athlete_id: "B1", count: 1 } });
    expect(conceded.find((r) => r.code === "ace")).toMatchObject({ label: "Ace sofrido", count: 1 });
    // Sem toque de bloqueio registrado, o ponto fica "da dupla": 2 dos 4.
    const { byAthlete, unattributed } = concededByAthlete(pointsConceded(rallies, { pair_key: PAIR.B }));
    expect(byAthlete.get("B2")).toBe(2);
    expect(unattributed).toBe(3); // 2 block-outs sem bloqueio registrado + o ace sem recepção
  });

  it("duelo: quem bloqueou quem, quem sacou em quem", () => {
    const { touches } = buildAnalytics(scenario());
    const name = (id: string) => ({ A1: "Ana", A2: "Bia", B1: "Vinícius", B2: "Duda" })[id] ?? id;
    const stuff = touches.find((f) => f.skill === "block" && f.delta.blocks)!;
    expect(duelLabel(stuff, name)).toBe("Bloqueou Vinícius");
    const blocked = touches.find((f) => f.skill === "attack" && f.delta.attack_blocked)!;
    expect(duelLabel(blocked, name)).toBe("Bloqueado por Ana");
    const ace = touches.find((f) => f.skill === "serve" && f.delta.aces)!;
    expect(ace.opponent_id).toBeUndefined(); // ninguém tocou no ace: sem nome inventado
    expect(duelLabel(ace, name)).toBeNull();
    // Drill de "Blq" de A1: a ocorrência diz quem ela bloqueou; a dimensão Adversário agrupa.
    const blq = athleteColumns({ modality: "beach" }).find((c) => c.key === "blocks")!;
    const drill = drillDown(factsIn(touches, { athlete_id: "A1" }), blq.drill!, "opponent", { athleteLabel: name });
    expect(drill.rows).toEqual([expect.objectContaining({ label: "Vinícius", count: 1 })]);
    expect(drill.occurrences[0].duel).toBe("Bloqueou Vinícius");
  });

  it("taxa por grupo: a eficiência de cada partida no drill é a mesma da tabela daquela partida", () => {
    const m1 = randomMatch(7, 120, "j1");
    const m2 = randomMatch(8, 120, "j2");
    const { touches } = buildAnalytics([m1, m2]);
    const eff = athleteColumns({ modality: "beach", aggregated: true }).find((c) => c.key === "atk_eff")!;
    const drill = drillDown(factsIn(touches, { athlete_id: "A1" }), eff.drill!, "match", { withCounters: true });
    for (const row of drill.rows) {
      const single = aggregateCompetition([row.key === "j1" ? m1 : m2]).athletes.A1;
      expect(row.counters!.kills).toBe(single.attack.kills);
      expect(row.counters!.attack_attempts).toBe(single.attack.attempts);
    }
  });
});

describe("narrativa do placar", () => {
  function closed(seq: string, servingFirst: TeamSide = "A") {
    // seq: "AABAB…" = quem ganhou cada ponto; quem saca é quem ganhou o anterior.
    let serving = servingFirst;
    return [...seq].map((w, i) => {
      const r = { rally_id: `r${i}`, set_number: 1, rally_number: i + 1, serving_team: serving, touches: [], touch_count: {} as never, point_to: w as TeamSide, reason: "kill" as const, detail: null };
      serving = w as TeamSide;
      return r;
    });
  }

  it("maior sequência, viradas de liderança, empates e trocação de side-out", () => {
    // A abre 3×0, B vira com 5 seguidos (3×5), A empata e vira; depois side-out ponto a ponto.
    const story = setStory(1, closed("AAABBBBBAAA" + "BABABABA"));
    expect(story.runs.B).toMatchObject({ length: 5, scoreFrom: { A: 3, B: 0 }, scoreTo: { A: 3, B: 5 } });
    expect(story.runs.A?.length).toBe(3);
    expect(story.leadChanges.map((c) => [c.at, c.leader])).toEqual([[7, "B"], [11, "A"]]);
    expect(story.trade).toMatchObject({ length: 8, scoreFrom: { A: 6, B: 5 }, scoreTo: { A: 10, B: 9 } });
    const lines = storyLines(story, (t) => (t === "A" ? "Ana/Bia" : "Carla/Duda"));
    expect(lines[0]).toBe("Ana/Bia fez 3 pontos seguidos (0×0 → 3×0).");
    expect(lines[1]).toBe("Carla/Duda fez 5 pontos seguidos (3×0 → 3×5).");
    expect(lines.some((l) => l.startsWith("A liderança trocou de lado 2 vezes"))).toBe(true);
    expect(lines.at(-1)).toBe("Trocação de side-out: 8 pontos seguidos de quem recebia (6×5 → 10×9).");
  });
});

describe("textos traduzidos", () => {
  it("frases com plural e sem base", () => {
    expect(explainSideOut(rate(14, 16))).toBe("14 viradas de bola em 16 saques recebidos");
    expect(explainSideOut(rate(1, 1))).toBe("1 virada de bola em 1 saque recebido");
    expect(explainSideOut(rate(0, 0))).toBe("nenhum saque recebido ainda");
    expect(explainBreakPoint(rate(9, 20))).toBe("9 pontos sacando em 20 saques");
    expect(explainEfficiency({ kills: 11, errors: 1, attempts: 19 })).toBe("(11 pontos − 1 erro) ÷ 19 ataques");
    expect(explainPass(rate(5, 8), true)).toBe("5 passes na mão em 8 recepções avaliadas");
  });
});
