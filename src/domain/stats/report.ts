import { teamGender } from "../roster/identity";
import type { Athlete, Gender } from "../types";
import type { AthleteAggregate, CompetitionStats, TeamAggregate } from "./aggregate";
import { drillDown } from "./drill";
import { errorLabel } from "./fact-labels";
import type { TouchFact } from "./facts";
import { pointSources, type PointSources } from "./point-sources";
import { efficiency, rate } from "./rate";

/**
 * Relatório de torneio (Fase 15): cruza todas as atletas e duplas de um recorte, separadas por gênero,
 * com os destaques por fundamento (volume mínimo: "1 de 1 = 100%" não leva prêmio) e as maiores
 * fontes de erro. Tudo a partir de aggregateCompetition + fatos. Puro.
 */

export type ReportSectionKey = Gender | "Mixed" | "none";

export const SECTION_LABEL: Record<ReportSectionKey, string> = {
  F: "Feminino",
  M: "Masculino",
  Mixed: "Misto",
  none: "Sem gênero no cadastro",
};

export interface AwardSpec<T> {
  key: string;
  label: string;
  /** Maior = melhor. null = sem base. */
  value: (x: T) => number | null;
  volume: (x: T) => number;
  min: number;
  kind: "count" | "rate";
  /** Detalhe exibido ao lado (ex.: "12-3/40"). */
  detail: (x: T) => string;
  minLabel?: string;
}

export interface AwardWinner {
  id: string;
  value: number;
  detail: string;
}

export interface Award {
  key: string;
  label: string;
  kind: "count" | "rate";
  minLabel?: string;
  /** Top 3 (empate desempata por volume, depois por nome). */
  podium: AwardWinner[];
}

const c = (a: AthleteAggregate) => a.counters;

export function athleteAwardSpecs(): AwardSpec<AthleteAggregate>[] {
  return [
    { key: "points", label: "Maior pontuadora", kind: "count", min: 0, value: (a) => a.points, volume: (a) => a.matches, detail: (a) => `${a.attack.kills} atq · ${a.serve.aces} ace · ${a.blocks} blq` },
    { key: "attack", label: "Melhor ataque (eficiência)", kind: "rate", min: 10, minLabel: "mín. 10 ataques", value: (a) => a.attack.efficiency, volume: (a) => a.attack.attempts, detail: (a) => `${a.attack.kills}-${a.attack.errors}/${a.attack.attempts}` },
    { key: "aces", label: "Mais aces", kind: "count", min: 0, value: (a) => a.serve.aces, volume: (a) => a.serve.attempts, detail: (a) => `${a.serve.attempts} saques` },
    { key: "pressure", label: "Saque mais agressivo (pressão)", kind: "rate", min: 10, minLabel: "mín. 10 saques com recepção avaliada", value: (a) => rate(c(a).serve_pressure_forced, c(a).serve_pressure_rated).pct, volume: (a) => c(a).serve_pressure_rated, detail: (a) => `${c(a).serve_pressure_forced}/${c(a).serve_pressure_rated}` },
    { key: "digs", label: "Quem mais defendeu", kind: "count", min: 0, value: (a) => a.digs, volume: (a) => a.matches, detail: (a) => `${c(a).dig_positive} positivas` },
    { key: "target", label: "Mais sacada (alvo do adversário)", kind: "count", min: 0, value: (a) => a.reception.attempts, volume: (a) => c(a).serves_faced, detail: (a) => `${Math.round((rate(a.reception.attempts, c(a).serves_faced).pct ?? 0) * 100)}% dos saques` },
    { key: "reception", label: "Melhor passe", kind: "rate", min: 10, minLabel: "mín. 10 recepções avaliadas", value: (a) => a.reception.positive.pct, volume: (a) => a.reception.positive.den, detail: (a) => `${a.reception.positive.num}/${a.reception.positive.den}` },
    { key: "blocks", label: "Paredão (pontos de bloqueio)", kind: "count", min: 0, value: (a) => a.blocks, volume: (a) => c(a).block_touches, detail: (a) => `${c(a).block_touches} bloqueios` },
    { key: "k2", label: "Melhor contra-ataque (Efic. K2)", kind: "rate", min: 10, minLabel: "mín. 10 ataques de transição", value: (a) => efficiency(c(a).attack_k2_kills, c(a).attack_k2_errors, c(a).attack_k2_attempts), volume: (a) => c(a).attack_k2_attempts, detail: (a) => `${c(a).attack_k2_kills}-${c(a).attack_k2_errors}/${c(a).attack_k2_attempts}` },
  ];
}

export function teamAwardSpecs(): AwardSpec<TeamAggregate>[] {
  return [
    { key: "side_out", label: "Melhor virada de bola (K1)", kind: "rate", min: 20, minLabel: "mín. 20 saques recebidos", value: (t) => t.side_out.pct, volume: (t) => t.side_out.den, detail: (t) => `${t.side_out.num}/${t.side_out.den}` },
    { key: "break_point", label: "Melhor quebra de saque (K2)", kind: "rate", min: 20, minLabel: "mín. 20 saques", value: (t) => t.break_point.pct, volume: (t) => t.break_point.den, detail: (t) => `${t.break_point.num}/${t.break_point.den}` },
    { key: "balance", label: "Maior saldo de pontos", kind: "count", min: 0, value: (t) => t.points_for - t.points_against, volume: (t) => t.matches, detail: (t) => `${t.wins}V ${t.losses}D` },
  ];
}

export function award<T>(items: readonly T[], spec: AwardSpec<T>, idOf: (x: T) => string, nameOf: (id: string) => string, size = 3): Award {
  const rows: (AwardWinner & { volume: number })[] = [];
  for (const x of items) {
    const value = spec.value(x);
    const volume = spec.volume(x);
    if (value === null || volume < spec.min) continue;
    if (spec.kind === "count" && value <= 0) continue;
    rows.push({ id: idOf(x), value, volume, detail: spec.detail(x) });
  }
  rows.sort((a, b) => b.value - a.value || b.volume - a.volume || nameOf(a.id).localeCompare(nameOf(b.id), "pt-BR"));
  return {
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    ...(spec.minLabel ? { minLabel: spec.minLabel } : {}),
    podium: rows.slice(0, size).map(({ id, value, detail }) => ({ id, value, detail })),
  };
}

export interface ErrorSource {
  label: string;
  count: number;
  share: number;
  /** Quem mais cometeu este erro. */
  leader: { athlete_id: string; count: number } | null;
}

export interface ReportSection {
  key: ReportSectionKey;
  label: string;
  athletes: AthleteAggregate[];
  teams: TeamAggregate[];
  awards: Award[];
  teamAwards: Award[];
  points: PointSources;
  /** Erros que deram ponto ao adversário, por tipo (o mais frequente primeiro). */
  errorSources: ErrorSource[];
  /** Quem mais entregou pontos (individual) e qual dupla. */
  topGivers: { athlete_id: string; count: number }[];
  topTeamGivers: { pair_key: string; count: number }[];
}

export interface TournamentReport {
  sections: ReportSection[];
  /** Atletas fora das seções por gênero por falta de cadastro (aviso). */
  missingGender: number;
}

const POINTS_GIVEN = (d: TouchFact["delta"]) => d.points_given ?? 0;

function errorSources(facts: readonly TouchFact[]): ErrorSource[] {
  const result = drillDown(facts, POINTS_GIVEN, "type", { errors: true, limit: 0 });
  const byType = new Map<string, Map<string, number>>();
  for (const f of facts) {
    if (!f.delta.points_given) continue;
    const label = errorLabel(f);
    const m = byType.get(label) ?? new Map<string, number>();
    m.set(f.athlete_id, (m.get(f.athlete_id) ?? 0) + f.delta.points_given);
    byType.set(label, m);
  }
  return result.rows.map((r) => {
    let leader: ErrorSource["leader"] = null;
    for (const [athlete_id, count] of byType.get(r.key) ?? []) if (!leader || count > leader.count) leader = { athlete_id, count };
    return { label: r.label, count: r.count, share: r.share, leader };
  });
}


export function tournamentReport(
  stats: CompetitionStats,
  facts: readonly TouchFact[],
  { athletes, nameOf, teamNameOf }: { athletes: ReadonlyMap<string, Athlete>; nameOf: (id: string) => string; teamNameOf: (key: string) => string },
): TournamentReport {
  const allAthletes = Object.values(stats.athletes);
  const allTeams = Object.values(stats.teams);
  const genderOf = (id: string): Gender | undefined => athletes.get(id)?.gender;
  const sectionOfTeam = (t: TeamAggregate): ReportSectionKey => teamGender(t.athlete_ids.map(genderOf)) ?? "none";

  const keys: ReportSectionKey[] = ["F", "M", "Mixed", "none"];
  const sections: ReportSection[] = [];
  for (const key of keys) {
    const sAthletes = key === "Mixed" ? [] : allAthletes.filter((a) => (genderOf(a.athlete_id) ?? "none") === key);
    const sTeams = allTeams.filter((t) => sectionOfTeam(t) === key);
    if (sAthletes.length === 0 && sTeams.length === 0) continue;
    // Misto: só as duplas mistas (as atletas aparecem na seção do gênero delas).
    const ids = new Set(sAthletes.map((a) => a.athlete_id));
    const teamKeys = new Set(sTeams.map((t) => t.pair_key));
    const sFacts = key === "Mixed" ? facts.filter((f) => teamKeys.has(f.pair_key)) : facts.filter((f) => ids.has(f.athlete_id));
    const pts = sTeams.reduce(
      (acc, t) => ({ kills: acc.kills + t.points.kills, aces: acc.aces + t.points.aces, blocks: acc.blocks + t.points.blocks, opponent_errors: acc.opponent_errors + t.points.opponent_errors }),
      { kills: 0, aces: 0, blocks: 0, opponent_errors: 0 },
    );
    sections.push({
      key,
      label: SECTION_LABEL[key],
      athletes: sAthletes,
      teams: sTeams,
      awards: key === "Mixed" ? [] : athleteAwardSpecs().map((s) => award(sAthletes, s, (a) => a.athlete_id, nameOf)),
      teamAwards: teamAwardSpecs().map((s) => award(sTeams, s, (t) => t.pair_key, teamNameOf)),
      points: pointSources(pts),
      errorSources: errorSources(sFacts),
      topGivers: [...sAthletes]
        .map((a) => ({ athlete_id: a.athlete_id, count: a.counters.points_given }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count || nameOf(a.athlete_id).localeCompare(nameOf(b.athlete_id), "pt-BR"))
        .slice(0, 5),
      topTeamGivers: [...sTeams]
        .map((t) => ({ pair_key: t.pair_key, count: t.counters.points_given }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    });
  }
  const missingGender = allAthletes.filter((a) => !genderOf(a.athlete_id)).length;
  return { sections, missingGender };
}
