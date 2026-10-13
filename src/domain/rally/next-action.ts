import type { ModalityRules } from "../rules/modality";
import { otherTeam, type Match, type RallyPhase, type Skill, type TeamSide, type TouchEvent } from "../types";
import { phaseForTouch } from "./phase";
import type { MatchState } from "./replay";

export type ScoutStage = "awaiting_serve" | "in_play" | "match_over";

export interface NextAction {
  stage: ScoutStage;
  /** Lado destacado na tela. */
  primary_team: TeamSide | null;
  /** Lados que podem tocar agora. A inferência destaca, mas só bloqueia o que é fisicamente impossível (ex.: sacador tocar após o próprio saque). */
  allowed_teams: TeamSide[];
  /** Fundamentos esperados para a equipe primária; o primeiro é o pré-selecionado. */
  suggested_skills: Skill[];
  /** Atleta pré-selecionado (só no beach, onde a dupla torna a previsão confiável). */
  suggested_athlete_id: string | null;
  /** Fase (K1/K2) do próximo toque da equipe primária. */
  phase: RallyPhase | null;
  /** Posse atual e quantos toques já usou. */
  possession: { team: TeamSide; touches: number; max: number } | null;
}

const ALL_PLAY_SKILLS: Skill[] = ["reception", "set", "attack", "block", "dig", "freeball", "fault"];

/** Fundamentos que fazem sentido para a equipe `team` no estágio atual. A ordem coloca os sugeridos primeiro. */
export function availableSkills(next: NextAction, team: TeamSide): Skill[] {
  if (next.stage === "match_over") return [];
  if (next.stage === "awaiting_serve") return ["serve"];
  const first: Skill[] = team === next.primary_team ? next.suggested_skills : ["dig", "block"];
  return [...new Set([...first, ...ALL_PLAY_SKILLS])];
}

export const defaultSkillFor = (next: NextAction, team: TeamSide): Skill => availableSkills(next, team)[0] ?? "serve";

const rosterOf = (match: Match, team: TeamSide) => (team === "A" ? match.team_a : match.team_b).athlete_ids;

function partnerOf(match: Match, team: TeamSide, athlete_id: string): string | null {
  const roster = rosterOf(match, team);
  if (match.modality !== "beach" || roster.length !== 2) return null;
  return roster.find((id) => id !== athlete_id) ?? null;
}

const serveOf = (touches: readonly TouchEvent[]) => touches.find((t) => t.skill === "serve");

/**
 * Beach: quem sacou continua sacando enquanto a equipe vence o rali; ao recuperar o saque,
 * saca o parceiro de quem sacou no turno anterior da equipe (dentro do mesmo set).
 */
function suggestServer(state: MatchState, match: Match): string | null {
  if (match.modality !== "beach") return null;
  const team = state.serving_team;
  const inSet = state.rallies.filter((r) => r.set_number === state.current_set && r.point_to);
  const last = inSet.at(-1);
  const lastServe = last && serveOf(last.touches);
  if (last?.serving_team === team && lastServe) return lastServe.athlete_id;

  const previousTurn = inSet.findLast((r) => r.serving_team === team && serveOf(r.touches));
  const previousServer = previousTurn && serveOf(previousTurn.touches);
  return previousServer ? partnerOf(match, team, previousServer.athlete_id) : null;
}

/** Próximo passo esperado do rali, derivado só do estado do replay. */
export function nextAction(state: MatchState, match: Match, rules: ModalityRules): NextAction {
  if (state.winner) {
    return {
      stage: "match_over",
      primary_team: null,
      allowed_teams: [],
      suggested_skills: [],
      suggested_athlete_id: null,
      phase: null,
      possession: null,
    };
  }

  const rally = state.open_rally;
  const lastTouch = rally?.touches.filter((t) => t.skill !== "fault").at(-1);
  if (!rally || !lastTouch) {
    return {
      stage: "awaiting_serve",
      primary_team: state.serving_team,
      allowed_teams: [state.serving_team],
      suggested_skills: ["serve"],
      suggested_athlete_id: suggestServer(state, match),
      phase: "counter_attack",
      possession: null,
    };
  }

  const same = lastTouch.team;
  const other = otherTeam(same);
  const current = rally.touch_count.possessions.at(-1);
  const exhausted = (current?.touches ?? 0) >= rules.maxTouchesPerSide;

  let primary: TeamSide;
  let skills: Skill[];
  let allowed: TeamSide[] = ["A", "B"];
  switch (lastTouch.skill) {
    case "serve":
      [primary, skills, allowed] = [other, ["reception"], [other]];
      break;
    case "reception":
    case "dig":
      [primary, skills] = [same, ["set", "attack", "freeball"]];
      break;
    case "set":
      [primary, skills] = [same, ["attack", "freeball"]];
      break;
    case "attack":
      [primary, skills] = [other, ["block", "dig"]];
      break;
    case "freeball":
      [primary, skills] = [other, ["reception", "dig"]];
      break;
    default: // block: a bola pode seguir com quem bloqueou ou voltar para o atacante
      [primary, skills] = [same, ["dig", "set", "attack"]];
  }
  // Posse esgotada: destaca o adversário, mas permite lançar o 4º toque (o replay dá o ponto ao adversário).
  if (exhausted) [primary, skills] = [other, ["block", "dig"]];

  return {
    stage: "in_play",
    primary_team: primary,
    allowed_teams: allowed,
    suggested_skills: skills,
    suggested_athlete_id: primary === same ? partnerOf(match, same, lastTouch.athlete_id) : null,
    phase: phaseForTouch(rally.touches, primary, rally.serving_team, rules),
    possession: current
      ? { team: current.team, touches: current.touches, max: rules.maxTouchesPerSide }
      : null,
  };
}
