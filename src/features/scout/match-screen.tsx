"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { ConfirmSheet } from "@/components/confirm-sheet";
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
import { planFinishMatch, type FinishMatchInput } from "@/domain/rally/plan-events";
import { LoadFailure } from "./components/load-failure";
import { ScoutErrorBoundary } from "./scout-error-boundary";
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
  if (!matchId) return <Notice text="Nenhuma partida selecionada." />;
  return (
    <ScoutErrorBoundary key={matchId} matchId={matchId}>
      <ScoutBoard matchId={matchId} />
    </ScoutErrorBoundary>
  );
}

/** Carregamento que passa disto vira tela de diagnóstico (nunca "Carregando…" para sempre). */
const LOAD_TIMEOUT_MS = 8_000;

function useLoadTimeout(loading: boolean): number | null {
  const [startedAt] = useState(() => Date.now());
  const [timedOutAfter, setTimedOutAfter] = useState<number | null>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOutAfter(Date.now() - startedAt), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading, startedAt]);
  return loading ? timedOutAfter : null;
}

/** Lances ainda na fila de gravação: avisa antes de fechar/recarregar a aba. */
function useWarnBeforeUnload(unsaved: number, leaving: { current: boolean }) {
  useEffect(() => {
    if (unsaved === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved, leaving]);
}

function ScoutBoard({ matchId }: { matchId: string }) {
  const { scope, match, athletes, derived, exec, ready, deviceError, save } = useMatchData(matchId);
  const commands = useScoutCommands(exec, derived?.next ?? null, derived?.ledgerSize ?? null);
  const [swapped, toggleSides] = useSideSwap(matchId);
  const [mode, setMode] = useScoutMode(matchId);
  const [statsOpen, setStatsOpen] = useState(false);
  const closeStats = useCallback(() => setStatsOpen(false), []);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const leaving = useRef(false);
  useWarnBeforeUnload(save.unsaved, leaving);
  /** Modo detalhado: "Ponto X" com o rali aberto pergunta como foi (nunca vira falta sem lance às cegas). */
  const [pointFor, setPointFor] = useState<TeamSide | null>(null);

  function finish(input: FinishMatchInput) {
    setFinishError(null);
    try {
      exec((d) => planFinishMatch(d, input));
      setFinishOpen(false);
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : String(e));
    }
  }

  const leave = useCallback(() => {
    leaving.current = true;
    // Navegação completa de propósito (como o HardLink): offline, a página vem do pré-cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }, []);
  /** "← Sair" com lances na fila: espera a gravação (sai sozinho quando termina) ou pergunta. */
  const onExit = (e: MouseEvent) => {
    if (save.unsaved === 0) return;
    e.preventDefault();
    setExitOpen(true);
  };
  useEffect(() => {
    if (exitOpen && save.unsaved === 0) leave();
  }, [exitOpen, save.unsaved, leave]);

  useWakeLock(!!match && !derived?.state.winner);
  const loading = !match || !athletes || !derived || !ready;
  const timedOutAfter = useLoadTimeout(loading && !deviceError && match !== null);

  if (deviceError) return <LoadFailure matchId={matchId} title="Não consegui abrir o banco local" error={deviceError} elapsedMs={0} />;
  if (match === null) return <Notice text="Partida não encontrada neste aparelho." />;
  if (match?.deleted_at) return <Notice text="Esta partida está na lixeira. Para voltar a usá-la, restaure pela lista de partidas." />;
  if (timedOutAfter !== null) return <LoadFailure matchId={matchId} title="A partida está demorando para abrir" elapsedMs={timedOutAfter} />;
  if (loading) return <Notice text="Carregando partida…" />;

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
    <div className="relative grid h-dvh touch-manipulation select-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden overscroll-none bg-zinc-950 text-zinc-100">
      <Scoreboard match={match} state={state} next={next} rules={rules} sides={sides} onFinish={() => setFinishOpen(true)} onExit={onExit} />

      {mode === "quick" ? (
        <QuickBoard
          scope={scope}
          exec={exec}
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
          <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 p-2 portrait:grid-cols-1 portrait:grid-rows-[minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,0.8fr)]">
            {panel(sides[0])}
            <section aria-label="Lance" className="flex min-h-0 flex-col gap-2">
              <ServeChooser exec={exec} match={match} state={state} sides={sides} />
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
        <FinishMatchSheet match={match} state={state} saving={false} onConfirm={finish} onCancel={() => setFinishOpen(false)} />
      )}

      {(commands.ui.error || finishError) && (
        <div
          role="alert"
          className="absolute inset-x-0 top-2 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl bg-red-700 px-4 py-3 text-white shadow-lg"
        >
          <span>Não foi possível registrar: {commands.ui.error ?? finishError}</span>
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

      {save.error && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-24 z-[60] mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl bg-red-700 px-4 py-3 text-white shadow-lg"
        >
          <span>
            {save.unsaved} {save.unsaved === 1 ? "lance ainda não foi salvo" : "lances ainda não foram salvos"} neste aparelho. Não
            feche o app. ({save.error})
          </span>
          <button type="button" onClick={save.retry} className="min-h-12 shrink-0 rounded-lg bg-white px-3 font-bold text-red-800">
            Tentar de novo
          </button>
        </div>
      )}

      {exitOpen && (
        <ConfirmSheet
          title="Ainda gravando lances"
          confirmLabel="Sair mesmo assim"
          danger
          onConfirm={async () => leave()}
          onClose={() => setExitOpen(false)}
        >
          <p>
            {save.unsaved} {save.unsaved === 1 ? "lance ainda está" : "lances ainda estão"} sendo gravados neste aparelho. Assim que
            terminar, a tela sai sozinha.
          </p>
          <p>Se sair agora, {save.unsaved === 1 ? "esse lance se perde" : "esses lances se perdem"}.</p>
        </ConfirmSheet>
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
