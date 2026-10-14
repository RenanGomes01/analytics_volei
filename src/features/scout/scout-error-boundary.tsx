"use client";

import { Component, type ReactNode } from "react";
import { LoadFailure } from "./components/load-failure";

interface Props {
  matchId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  at: number;
}

/**
 * Erro ao abrir ou desenhar o scout (ex.: o useLiveQuery relança a falha do IndexedDB no render):
 * mostra a mensagem real e o diagnóstico, nunca uma tela branca ou um "Carregando…" eterno.
 */
export class ScoutErrorBoundary extends Component<Props, State> {
  private readonly mountedAt = Date.now();
  state: State = { error: null, at: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, at: Date.now() };
  }

  componentDidCatch(error: Error) {
    console.error("[scout] erro na tela de scout", error);
  }

  render() {
    const { error, at } = this.state;
    if (!error) return this.props.children;
    return (
      <LoadFailure
        matchId={this.props.matchId}
        title="Não consegui abrir a partida"
        error={`${error.name}: ${error.message}`}
        elapsedMs={at - this.mountedAt}
      />
    );
  }
}
