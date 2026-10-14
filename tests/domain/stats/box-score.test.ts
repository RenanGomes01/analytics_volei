import { describe, expect, it } from "vitest";
import { replayMatch } from "@/domain/rally/replay";
import { BEACH_RULES } from "@/domain/rules/modality";
import { boxScoreFromRallies, computeBoxScore } from "@/domain/stats/box-score";
import type { Quality, Skill, TeamSide } from "@/domain/types";
import { ledger } from "../../helpers";

const roster = { A: ["A1", "A2"], B: ["B1", "B2"] };
const options = { rules: BEACH_RULES, first_server: "A" as const, roster };

type Play = readonly [athlete: string, skill: Skill, quality: Quality];

/** Lança um rali; o time vem do prefixo do atleta (A1 → A). */
function rally(l: ReturnType<typeof ledger>, ...plays: Play[]) {
  l.rally();
  for (const [athlete_id, skill, quality] of plays) l.touch(athlete_id[0] as TeamSide, skill, { athlete_id, quality });
  return l;
}

/**
 * Set beach roteirizado (A saca primeiro). Placar final: A 4 × 6 B.
 * Os comentários dizem quem saca, quem ganha e por quê.
 */
function referenceSet() {
  const l = ledger();
  rally(l, ["A1", "serve", "+"], ["B1", "reception", "#"], ["B2", "set", "+"], ["B1", "attack", "#"]); // R1 A saca · B kill B1
  rally(l, ["B2", "serve", "#"]); // R2 B saca · ace B2
  rally(l, ["B2", "serve", "+"], ["A1", "reception", "+"], ["A2", "set", "+"], ["A1", "attack", "+"], ["B1", "block", "#"]); // R3 B saca · bloqueio B1 (A1 bloqueado)
  rally(l, ["B2", "serve", "="]); // R4 B saca · erro de saque → A
  rally(l, ["A2", "serve", "+"], ["B2", "reception", "!"], ["B1", "set", "+"], ["B2", "attack", "="]); // R5 A saca · erro de ataque B2 → A
  rally(
    l,
    ["A2", "serve", "+"], ["B1", "reception", "-"], ["B2", "set", "+"], ["B1", "attack", "+"],
    ["A1", "dig", "+"], ["A2", "set", "+"], ["A1", "attack", "#"],
  ); // R6 A saca · A kill A1
  rally(
    l,
    ["A2", "serve", "+"], ["B2", "reception", "#"], ["B1", "set", "+"], ["B2", "attack", "+"],
    ["A1", "block", "+"], ["A2", "dig", "+"], ["A1", "set", "+"], ["A2", "attack", "+"],
  ); // R7 A saca · 4 toques de A (bloqueio conta) → B
  rally(l, ["B1", "serve", "+"], ["A1", "reception", "="]); // R8 B saca · recepção = logo após o saque → ace de B1
  rally(l, ["B1", "serve", "+"], ["A2", "reception", "#"], ["A1", "set", "+"], ["A2", "attack", "#"]); // R9 B saca · A kill A2
  rally(l, ["A1", "serve", "+"], ["B1", "reception", "+"]); // R10 A saca · rede de A (ponto manual) → B
  l.end("B", "manual");
  return l;
}

describe("Box Score — set de referência (beach)", () => {
  const box = computeBoxScore(referenceSet().events, options);

  it("pontos por equipe batem com o placar e com a classificação esperada", () => {
    expect(box.teams.A.points).toEqual({ total: 4, kills: 2, aces: 0, blocks: 0, opponent_errors: 2 });
    expect(box.teams.B.points).toEqual({ total: 6, kills: 1, aces: 2, blocks: 1, opponent_errors: 2 });
  });

  it("side-out (K1) e break-point (K2)", () => {
    expect(box.teams.A.side_out).toEqual({ num: 2, den: 5, pct: 0.4 });
    expect(box.teams.A.break_point).toEqual({ num: 2, den: 5, pct: 0.4 });
    expect(box.teams.B.side_out).toEqual({ num: 3, den: 5, pct: 0.6 });
    expect(box.teams.B.break_point).toEqual({ num: 3, den: 5, pct: 0.6 });
  });

  it("ataque: ataque bloqueado é erro do atacante; 4º toque sem # nem = é bola em jogo", () => {
    expect(box.teams.A.attack).toMatchObject({ attempts: 4, kills: 2, errors: 1, in_play: 1, efficiency: 0.25 });
    expect(box.teams.B.attack).toMatchObject({ attempts: 4, kills: 1, errors: 1, in_play: 2, efficiency: 0 });
    expect(box.athletes.A1.attack).toMatchObject({ attempts: 2, kills: 1, errors: 1, efficiency: 0 });
    expect(box.athletes.A2.attack).toMatchObject({ attempts: 2, kills: 1, errors: 0, efficiency: 0.5 });
  });

  it("saque e recepção", () => {
    expect(box.teams.A.serve).toMatchObject({ attempts: 5, aces: 0, errors: 0 });
    expect(box.teams.B.serve).toMatchObject({ attempts: 5, aces: 2, errors: 1 });
    expect(box.teams.A.reception).toEqual({ attempts: 3, positive: { num: 2, den: 3, pct: 2 / 3 }, errors: 1 });
    expect(box.teams.B.reception).toEqual({ attempts: 5, positive: { num: 3, den: 5, pct: 0.6 }, errors: 0 });
  });

  it("por atleta: pontos, bloqueios (só #), defesas e erros cometidos", () => {
    expect(box.athletes.A1).toMatchObject({ points: 1, blocks: 0, digs: 1, errors: 2 }); // bloqueado + recepção =
    expect(box.athletes.A2).toMatchObject({ points: 1, blocks: 0, digs: 1, errors: 0 });
    expect(box.athletes.B1).toMatchObject({ points: 3, blocks: 1, digs: 0, errors: 0 }); // kill + bloqueio + ace (R8)
    expect(box.athletes.B1.serve).toMatchObject({ attempts: 2, aces: 1, errors: 0 });
    expect(box.athletes.A1.reception.errors).toBe(1); // o erro de recepção continua com quem recebeu
    expect(box.athletes.B2).toMatchObject({ points: 1, blocks: 0, errors: 2 }); // ace; erro de saque + de ataque
    expect(box.teams.B.blocks).toBe(1);
    expect(box.teams.A.digs).toBe(2);
  });
});

describe("Box Score — casos de borda", () => {
  it("sem lances: atletas do elenco aparecem zerados e as porcentagens são null", () => {
    const box = computeBoxScore([], options);
    expect(Object.keys(box.athletes).sort()).toEqual(["A1", "A2", "B1", "B2"]);
    expect(box.athletes.A1.attack).toMatchObject({ attempts: 0, kills: 0, errors: 0, in_play: 0, efficiency: null });
    expect(box.teams.A.side_out).toEqual({ num: 0, den: 0, pct: null });
    expect(box.teams.A.reception.positive.pct).toBeNull();
    expect(box.sets_available).toEqual([]);
  });

  it("um lance anulado (VoidEvent) sai das estatísticas", () => {
    const l = rally(ledger(), ["A1", "serve", "+"], ["B1", "reception", "+"], ["B1", "attack", "#"]);
    const kill = l.events.at(-1)!;
    expect(computeBoxScore(l.events, options).athletes.B1.attack.kills).toBe(1);

    l.void(kill.id);
    const box = computeBoxScore(l.events, options);
    expect(box.athletes.B1.attack).toMatchObject({ attempts: 0, kills: 0 });
    expect(box.teams.B.points.total).toBe(0);
    expect(box.athletes.B1.reception.attempts).toBe(1); // o rali reaberto continua contando os toques
  });

  it("rali aberto conta os toques, mas não entra em side-out/break-point", () => {
    const box = computeBoxScore(rally(ledger(), ["A1", "serve", "+"], ["B1", "reception", "#"]).events, options);
    expect(box.teams.B.reception.attempts).toBe(1);
    expect(box.teams.B.side_out.den).toBe(0);
    expect(box.sets_available).toEqual([1]);
  });

  it("atleta fora do elenco não perde o lance", () => {
    const box = computeBoxScore(rally(ledger(), ["A9", "serve", "#"]).events, options);
    expect(box.athletes.A9).toMatchObject({ team: "A", points: 1 });
    expect(box.teams.A.serve.aces).toBe(1);
  });

  it("rally_end explícito contra um ataque #: o ponto não vira kill de ninguém", () => {
    const l = rally(ledger(), ["A1", "serve", "+"], ["B1", "attack", "#"]);
    l.end("A", "manual"); // arbitragem: B1 tocou na rede
    const box = computeBoxScore(l.events, options);
    expect(box.athletes.B1.attack).toMatchObject({ kills: 0, in_play: 1 });
    expect(box.teams.A.points).toMatchObject({ total: 1, opponent_errors: 1 });
  });
});

describe("Box Score — filtro por set", () => {
  // Set 1: A vence 21×0 com aces de A1. Set 2 (B saca primeiro): 3 ralis.
  const l = ledger();
  for (let i = 0; i < 21; i++) rally(l, ["A1", "serve", "#"]);
  rally(l, ["B1", "serve", "#"]);
  rally(l, ["B1", "serve", "="]);
  rally(l, ["A2", "serve", "#"]);
  const rallies = replayMatch(l.events, { rules: BEACH_RULES, first_server: "A" }).rallies;

  it("usa a fronteira de set do replay e lista os sets disponíveis", () => {
    const set2 = boxScoreFromRallies(rallies, roster, { set: 2 });
    expect(set2.sets_available).toEqual([1, 2]);
    expect(set2.teams.A.points.total).toBe(2);
    expect(set2.teams.B.points.total).toBe(1);
    expect(set2.athletes.A1.serve.attempts).toBe(0);
    expect(boxScoreFromRallies(rallies, roster, { set: 1 }).athletes.A1.serve.aces).toBe(21);
  });

  it("o jogo inteiro é a soma dos sets", () => {
    const all = boxScoreFromRallies(rallies, roster);
    const s1 = boxScoreFromRallies(rallies, roster, { set: 1 });
    const s2 = boxScoreFromRallies(rallies, roster, { set: 2 });
    expect(all.teams.A.points.total).toBe(s1.teams.A.points.total + s2.teams.A.points.total);
    expect(all.teams.A.serve.aces).toBe(s1.teams.A.serve.aces + s2.teams.A.serve.aces);
  });
});
