import { describe, expect, it } from "vitest";
import { athleteNameResolver, matchesQuery, matchSearchText } from "@/domain/roster/match-search";

const athletes = new Map([
  ["v1", { name: "Vinícius - RO" }],
  ["p1", { name: "Pedro" }],
  ["g1", { name: "George" }],
  ["a1", { name: "André Luís" }],
  ["v-old", { name: "Vini" }],
]);
// "v-old" é um cadastro antigo unido ao canônico "v1".
const aliases = new Map([["v-old", "v1"]]);
const nameOf = athleteNameResolver(athletes, aliases);

const match = (a: [string, string[]], b: [string, string[]]) => ({
  team_a: { name: a[0], athlete_ids: a[1] },
  team_b: { name: b[0], athlete_ids: b[1] },
});
const search = (m: ReturnType<typeof match>, q: string) => matchesQuery(matchSearchText(m, nameOf), q);

describe("busca de partidas por atleta ou dupla", () => {
  const game = match(["Vinícius - RO / Pedro", ["v1", "p1"]], ["George / André", ["g1", "a1"]]);

  it("acha pelos dois lados, sem acento e sem diferenciar maiúsculas", () => {
    expect(search(game, "vinicius")).toBe(true);
    expect(search(game, "ANDRE")).toBe(true);
    expect(search(game, "luis")).toBe(true);
    expect(search(game, "bruno")).toBe(false);
  });

  it("todas as palavras precisam aparecer, em qualquer ordem e lado", () => {
    expect(search(game, "pedro vini")).toBe(true);
    expect(search(game, "george vini")).toBe(true);
    expect(search(game, "pedro bruno")).toBe(false);
  });

  it("busca vazia ou só espaços aceita tudo", () => {
    expect(search(game, "")).toBe(true);
    expect(search(game, "   ")).toBe(true);
  });

  it("cadastro unido (alias) e atleta renomeada são achados pelo nome atual", () => {
    const old = match(["Vini / Pedro", ["v-old", "p1"]], ["George / André", ["g1", "a1"]]);
    expect(search(old, "RO")).toBe(true); // nome do canônico, não do retrato
    expect(search(old, "vini")).toBe(true); // retrato antigo continua valendo
  });

  it("atleta fora do cadastro ainda aparece pelo nome do retrato", () => {
    const legacy = match(["Ana / Bia", ["x1", "x2"]], ["Carol / Duda", ["x3", "x4"]]);
    expect(search(legacy, "bia")).toBe(true);
    expect(nameOf("x1")).toBeUndefined();
  });
});
