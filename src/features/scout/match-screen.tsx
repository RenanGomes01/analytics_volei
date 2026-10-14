"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { HardLink } from "@/components/hard-link";
import type { Emphasis } from "./components/athlete-button";
import { ActionPad } from "./components/action-pad";
import { MatchOver } from "./components/match-over";
import { RallyTrail } from "./components/rally-trail";
import { Scoreboard } from "./components/scoreboard";
import { ScoutFooter } from "./components/scout-footer";
import { TeamPanel } from "./components/team-panel";
import type { NextAction } from "@/domain/rally/next-action";
import { StatsSheet } from "@/features/stats/stats-sheet";
import type { TeamSide } from "@/domain/types";
import { getDB } from "@/db/client";
import { finishMatch, type FinishMatchInput } from "@/services/rally-ledger-service";
import { FinishMatchSheet } from "./components/finish-match-sheet";
import { useMatchData } from "./use-match-data";
import { useScoutCommands } from "./use-scout-commands";
import { ServeChooser } from "./components/serve-chooser";
import { QuickBoard } from "./quick/quick-board";
import { PointSheet } from "./quick/point-sheet";
import { detailedPointOutcomes, resolveDetailedPoint } from "@/domain/rally/resolve-detailed-point";
import { useScoutMode } from "./use-scout-mode";
import { useSideSwap } from "./use-side-swap";
import { useWakeLock } from "./use-wake-lock";

function emphasisOf(next: NextAction, team: TeamSide): Emphasis {
  if (!next.allowed_teams.includes(team)) return "disabled";
  return next.primary_team === team ? "primary" : "secondary";
}

export function MatchScreen() {
  const matchId = useSearchParams().get("id") ?? "";
  return matchId ? <ScoutBoard key={matchId} matchId={matchId} /> : <Notice text="Nenhuma partida selecionada." />;
}

function ScoutBoard({ matchId }: { matchId: string }) {
  const { scope, match, athletes, derived } = useMatchData(matchId);
  const commands = useScoutCommands(scope, derived?.next ?? null, derived?.ledgerSize ?? null);
  const [swapped, toggleSides] = useSideSwap(matchId);
  const [mode, setMode] = useScoutMode(matchId);
  const [statsOpen, setStatsOpen] = useState(false);
  const closeStats = useCallback(() => setStatsOpen(false), []);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  /** Modo detalhado: "Ponto X" com o rali aberto pergunta como foi (nunca vira falta sem lance às cegas). */
  const [pointFor, setPointFor] = useState<TeamSide | null>(null);

  async function finish(input: FinishMatchInput) {
    setFinishing(true);
    setFinishError(null);
    try {
      await finishMatch(getDB(), scope, input);
      setFinishOpen(false);
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinishing(false);
    }
  }
  useWakeLock(!!match && !derived?.state.winner);

  if (match === null) return <Notice text="Partida não encontrada neste aparelho." />;
  if (!match || !athletes || !derived) return <Notice text="Carregando partida…" />;

  const { events, state, next, rules, lastActive } = derived;
  const sides: [TeamSide, TeamSide] = swapped ? ["B", "A"] : ["A", "B"];
  const { selection } = commands;
  const openTouches = state.open_rally?.touches ?? [];
  const teamName = (t: TeamSide) => (t === "A" ? match.team_a.name : match.team_b.name);

  const panel = (team: TeamSide) => (
    <TeamPanel
      key={team}
      team={team}
      name={team === "A" ? match.team_a.name : match.team_b.name}
      athleteIds={team === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids}
      athletes={athletes}
      emphasis={commands.saving ? "disabled" : emphasisOf(next, team)}
      serving={state.serving_team === team && !state.winner}
      selectedAthleteId={selection?.team === team ? selection.athlete_id : null}
      onPick={commands.pickAthlete}
    />
  );

  return (
    <div className="relative grid h-dvh touch-manipulation select-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden overscroll-none bg-zinc-950 text-zinc-100">
      <Scoreboard match={match} state={state} next={next} rules={rules} sides={sides} onFinish={() => setFinishOpen(true)} />

      {mode === "quick" ? (
        <QuickBoard
          scope={scope}
          match={match}
          state={state}
          next={next}
          athletes={athletes}
          sides={sides}
          onDetailedMode={() => setMode("detailed")}
          onOpenStats={() => setStatsOpen(true)}
          onSwapSides={toggleSides}
        />
      ) : (
        <>
          <main className="grid min-h-0 grid-cols-[1fr_1.4fr_1fr] gap-2 p-2 portrait:grid-cols-1 portrait:grid-rows-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]">
            {panel(sides[0])}
            <section aria-label="Lance" className="flex min-h-0 flex-col gap-2">
              <ServeChooser scope={scope} match={match} state={state} sides={sides} />
              <RallyTrail match={match} state={state} next={next} athletes={athletes} />
              {state.winner ? (
                <MatchOver match={match} state={state} />
              ) : (
                <ActionPad
                  modality={match.modality}
                  next={next}
                  selection={selection}
                  athletes={athletes}
                  saving={commands.saving}
                  onSkill={commands.pickSkill}
                  onQuality={commands.commitQuality}
                />
              )}
            </section>
            {panel(sides[1])}
          </main>

          <ScoutFooter
            match={match}
            sides={sides}
            lastActive={lastActive}
            athletes={athletes}
            saving={commands.saving}
            canScore={!state.winner}
            onUndo={commands.undo}
            onPoint={(team) => (openTouches.length > 0 ? setPointFor(team) : commands.pointTo(team))}
            onSwapSides={toggleSides}
            onOpenStats={() => setStatsOpen(true)}
            onQuickMode={() => setMode("quick")}
          />
        </>
      )}

      {statsOpen && (
        <StatsSheet match={match} rules={rules} events={events} athletes={athletes} sides={sides} onClose={closeStats} />
      )}

      {pointFor && mode === "detailed" && openTouches.length > 0 && !state.winner && (
        <PointSheet
          winner={pointFor}
          options={detailedPointOutcomes(openTouches, pointFor)}
          teamName={teamName}
          roster={(t) => (t === "A" ? match.team_a.athlete_ids : match.team_b.athlete_ids)}
          athletes={athletes}
          saving={commands.saving}
          onChoose={(choice) => {
            setPointFor(null);
            commands.resolvePoint(resolveDetailedPoint(openTouches, pointFor, choice));
          }}
          onCancel={() => setPointFor(null)}
        />
      )}

      {finishOpen && !state.winner && (
        <FinishMatchSheet match={match} state={state} saving={finishing} onConfirm={finish} onCancel={() => setFinishOpen(false)} />
      )}

      {(commands.ui.error || finishError) && (
        <div
          role="alert"
          className="absolute inset-x-0 top-2 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl bg-red-700 px-4 py-3 text-white shadow-lg"
        >
          <span>Não foi possível salvar: {commands.ui.error ?? finishError}</span>
          <button
            type="button"
            onClick={() => {
              commands.dismissError();
              setFinishError(null);
            }} className="min-h-10 rounded-lg bg-black/20 px-3 font-semibold">
            OK
          </button>
        </div>
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-center text-zinc-100">
      <p className="text-xl">{text}</p>
      <HardLink href="/" className="rounded-xl bg-zinc-800 px-5 py-3 font-semibold">
        Voltar às partidas
      </HardLink>
    </div>
  );
}
