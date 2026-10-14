import type { Modality } from "../types";
import type { TeamAggregate } from "./aggregate";
import type { AttackLine, Rate, ReceptionLine, ServeLine } from "./types";

/**
 * Dicionário único das estatísticas (Fase 12): sigla, nome completo e explicação de cada coluna.
 * Tabelas, legenda e CSVs leem daqui — sigla nova só entra por este arquivo. Em cada fundamento a
 * ordem é sempre: total (volume) → acertos → erros → continuidade → índice.
 */

export type StatGroup = "geral" | "ataque" | "saque" | "recepcao" | "bloqueio" | "defesa" | "resultado";

export const GROUP_LABEL: Record<StatGroup, string> = {
  geral: "Geral",
  resultado: "Resultado",
  ataque: "Ataque",
  saque: "Saque",
  recepcao: "Recepção",
  bloqueio: "Bloqueio",
  defesa: "Defesa",
};

/** count = número; pct = proporção 0–1 (ou Rate) exibida em %; text = já formatado. */
export type StatFormat = "count" | "pct" | "text";

export interface StatColumn<L> {
  key: string;
  short: string;
  full: string;
  hint: string;
  group: StatGroup;
  format: StatFormat;
  /** Coluna de volume do fundamento (destacada na tabela). */
  total?: true;
  /** Só na tela (ex.: "2ª" como 3/5) ou só no CSV (as duas partes, em números). */
  only?: "table" | "csv";
  value: (line: L) => number | Rate | string | null;
}

/** O que uma linha de atleta precisa (partida: AthleteStats; agregado: AthleteAggregate). */
export interface PlayerLine {
  points: number;
  attack: AttackLine;
  serve: ServeLine;
  reception: ReceptionLine;
  blocks: number;
  digs: number;
  errors: number;
  matches?: number;
}

export const serveInPlay = (s: ServeLine) => Math.max(0, s.attempts - s.aces - s.errors);

export interface ColumnOptions {
  modality: Modality;
  /** Agregado de várias partidas: inclui "Jogos". */
  aggregated?: boolean;
  /** Passe na mão só com recepções avaliadas (o modo rápido não avalia o passe). */
  showReception?: boolean;
}

const receptionColumn = <L extends { reception: ReceptionLine }>(modality: Modality): StatColumn<L> =>
  modality === "beach"
    ? {
        key: "rec_positive",
        short: "Na mão",
        full: "Passe na mão (%)",
        hint: "Passes # (na mão) sobre as recepções avaliadas. As do modo rápido (não avaliadas) ficam fora.",
        group: "recepcao",
        format: "pct",
        value: (l) => l.reception.positive,
      }
    : {
        key: "rec_positive",
        short: "#+",
        full: "Recepção perfeita ou positiva (%)",
        hint: "Recepções # e + sobre as recepções avaliadas.",
        group: "recepcao",
        format: "pct",
        value: (l) => l.reception.positive,
      };

/** Colunas da linha de atleta (partida, torneio, temporada, perfil). */
export function athleteColumns({ modality, aggregated = false, showReception = true }: ColumnOptions): StatColumn<PlayerLine>[] {
  const cols: (StatColumn<PlayerLine> | false)[] = [
    aggregated && { key: "matches", short: "J", full: "Jogos", hint: "Partidas em que a atleta estava em quadra.", group: "geral", format: "count", value: (l) => l.matches ?? 0 },
    { key: "points", short: "Pts", full: "Pontos (ataque + ace + bloqueio)", hint: "Pontos feitos pela atleta: ataques #, aces e bloqueios #.", group: "geral", format: "count", value: (l) => l.points },

    { key: "atk_total", short: "TA", full: "Total de ataques", hint: "Todas as bolas atacadas: pontos + erros + em jogo.", group: "ataque", format: "count", total: true, value: (l) => l.attack.attempts },
    { key: "atk_kills", short: "PA", full: "Pontos de ataque", hint: "Ataques # que viraram ponto.", group: "ataque", format: "count", value: (l) => l.attack.kills },
    { key: "atk_errors", short: "EA", full: "Erros de ataque", hint: "Ataque = (fora, rede) ou bloqueado para ponto do adversário.", group: "ataque", format: "count", value: (l) => l.attack.errors },
    { key: "atk_in_play", short: "AJ", full: "Ataques em jogo (continuidade)", hint: "Ataques que não foram ponto nem erro: a bola seguiu em jogo.", group: "ataque", format: "count", value: (l) => l.attack.in_play },
    { key: "atk_eff", short: "Efic.", full: "Eficiência de ataque (%)", hint: "(Pontos de ataque − erros de ataque) ÷ total de ataques.", group: "ataque", format: "pct", value: (l) => l.attack.efficiency },
    {
      key: "second_ball",
      short: "2ª",
      full: "Bola de segunda (pontos/tentativas)",
      hint: "Ataque no 2º toque da posse: pontos / tentativas.",
      group: "ataque",
      format: "text",
      only: "table",
      value: (l) => (l.attack.second_ball.attempts ? `${l.attack.second_ball.kills}/${l.attack.second_ball.attempts}` : null),
    },
    { key: "second_ball_attempts", short: "2ª T", full: "Bola de segunda — tentativas", hint: "Ataques no 2º toque da posse.", group: "ataque", format: "count", only: "csv", value: (l) => l.attack.second_ball.attempts },
    { key: "second_ball_kills", short: "2ª P", full: "Bola de segunda — pontos", hint: "Bolas de segunda que viraram ponto.", group: "ataque", format: "count", only: "csv", value: (l) => l.attack.second_ball.kills },

    { key: "srv_total", short: "TS", full: "Total de saques", hint: "Todos os saques: aces + erros + em jogo.", group: "saque", format: "count", total: true, value: (l) => l.serve.attempts },
    { key: "srv_aces", short: "Ace", full: "Pontos de saque (aces)", hint: "Saque # ou recepção = do adversário logo após o saque.", group: "saque", format: "count", value: (l) => l.serve.aces },
    { key: "srv_errors", short: "ES", full: "Erros de saque (total)", hint: "Todos os erros de saque, inclusive lances antigos sem detalhe de rede/fora.", group: "saque", format: "count", value: (l) => l.serve.errors },
    { key: "srv_errors_net", short: "ES-R", full: "Erros de saque na rede", hint: "Saque = que parou na rede.", group: "saque", format: "count", value: (l) => l.serve.errors_net },
    { key: "srv_errors_out", short: "ES-F", full: "Erros de saque pra fora", hint: "Saque = que caiu fora.", group: "saque", format: "count", value: (l) => l.serve.errors_out },
    { key: "srv_in_play", short: "SJ", full: "Saques em jogo (continuidade)", hint: "Total de saques − aces − erros: o adversário recebeu.", group: "saque", format: "count", value: (l) => serveInPlay(l.serve) },

    { key: "rec_total", short: "TR", full: "Total de recepções", hint: "Todas as recepções de saque, avaliadas ou não.", group: "recepcao", format: "count", total: true, value: (l) => l.reception.attempts },
    showReception && receptionColumn<PlayerLine>(modality),
    { key: "rec_errors", short: "ER", full: "Erros de recepção (aces sofridos)", hint: "Recepção = logo após o saque: ponto direto do adversário.", group: "recepcao", format: "count", value: (l) => l.reception.errors },

    { key: "blocks", short: "Blq", full: "Pontos de bloqueio", hint: "Bloqueios # que viraram ponto.", group: "bloqueio", format: "count", value: (l) => l.blocks },
    { key: "digs", short: "Def", full: "Total de defesas", hint: "Todas as defesas (primeiro toque depois de um ataque).", group: "defesa", format: "count", total: true, value: (l) => l.digs },
    { key: "errors", short: "Err", full: "Erros cometidos (total)", hint: "Todos os lances = da atleta e ataques bloqueados.", group: "geral", format: "count", only: "csv", value: (l) => l.errors },
  ];
  return cols.filter((c): c is StatColumn<PlayerLine> => !!c);
}

/** Colunas da linha de dupla/time no torneio. */
export function teamColumns({ modality, showReception = true }: ColumnOptions): StatColumn<TeamAggregate>[] {
  const cols: (StatColumn<TeamAggregate> | false)[] = [
    { key: "matches", short: "J", full: "Jogos", hint: "Partidas no recorte.", group: "resultado", format: "count", value: (t) => t.matches },
    { key: "wins", short: "V", full: "Vitórias", hint: "Partidas vencidas.", group: "resultado", format: "count", value: (t) => t.wins },
    { key: "losses", short: "D", full: "Derrotas", hint: "Partidas perdidas.", group: "resultado", format: "count", value: (t) => t.losses },
    { key: "sets", short: "Sets", full: "Sets (vencidos-perdidos)", hint: "Sets vencidos e perdidos.", group: "resultado", format: "text", only: "table", value: (t) => `${t.sets_won}-${t.sets_lost}` },
    { key: "sets_won", short: "S+", full: "Sets vencidos", hint: "Sets vencidos.", group: "resultado", format: "count", only: "csv", value: (t) => t.sets_won },
    { key: "sets_lost", short: "S-", full: "Sets perdidos", hint: "Sets perdidos.", group: "resultado", format: "count", only: "csv", value: (t) => t.sets_lost },
    { key: "points_for", short: "P+", full: "Pontos a favor", hint: "Pontos ganhos (placar).", group: "resultado", format: "count", only: "csv", value: (t) => t.points_for },
    { key: "points_against", short: "P-", full: "Pontos contra", hint: "Pontos perdidos (placar).", group: "resultado", format: "count", only: "csv", value: (t) => t.points_against },
    { key: "balance", short: "Saldo", full: "Saldo de pontos", hint: "Pontos a favor − pontos contra.", group: "resultado", format: "count", value: (t) => t.points_for - t.points_against },
    { key: "opp_errors", short: "EAdv", full: "Pontos por erro do adversário", hint: "Pontos ganhos por erro (=), 4 toques ou falta do adversário.", group: "resultado", format: "count", value: (t) => t.points.opponent_errors },
    { key: "side_out", short: "K1", full: "Virada de bola (%)", hint: "Ralis ganhos recebendo o saque ÷ saques recebidos.", group: "resultado", format: "pct", value: (t) => t.side_out },
    { key: "break_point", short: "K2", full: "Quebra de saque (%)", hint: "Ralis ganhos sacando ÷ saques feitos.", group: "resultado", format: "pct", value: (t) => t.break_point },

    { key: "atk_total", short: "TA", full: "Total de ataques", hint: "Todas as bolas atacadas pela dupla.", group: "ataque", format: "count", total: true, value: (t) => t.attack.attempts },
    { key: "atk_kills", short: "PA", full: "Pontos de ataque", hint: "Ataques # que viraram ponto.", group: "ataque", format: "count", value: (t) => t.attack.kills },
    { key: "atk_errors", short: "EA", full: "Erros de ataque", hint: "Ataque = ou bloqueado para ponto do adversário.", group: "ataque", format: "count", value: (t) => t.attack.errors },
    { key: "atk_eff", short: "Efic.", full: "Eficiência de ataque (%)", hint: "(Pontos de ataque − erros de ataque) ÷ total de ataques.", group: "ataque", format: "pct", value: (t) => t.attack.efficiency },

    { key: "srv_total", short: "TS", full: "Total de saques", hint: "Todos os saques da dupla.", group: "saque", format: "count", total: true, value: (t) => t.serve.attempts },
    { key: "srv_aces", short: "Ace", full: "Pontos de saque (aces)", hint: "Aces da dupla.", group: "saque", format: "count", value: (t) => t.points.aces },
    { key: "srv_errors", short: "ES", full: "Erros de saque (total)", hint: "Todos os erros de saque da dupla.", group: "saque", format: "count", value: (t) => t.serve.errors },

    { key: "rec_total", short: "TR", full: "Total de recepções", hint: "Todas as recepções de saque da dupla.", group: "recepcao", format: "count", total: true, value: (t) => t.reception.attempts },
    showReception && receptionColumn<TeamAggregate>(modality),

    { key: "blocks", short: "Blq", full: "Pontos de bloqueio", hint: "Bloqueios # que viraram ponto.", group: "bloqueio", format: "count", value: (t) => t.points.blocks },
  ];
  return cols.filter((c): c is StatColumn<TeamAggregate> => !!c);
}

export const tableColumns = <L>(cols: readonly StatColumn<L>[]) => cols.filter((c) => c.only !== "csv");
export const csvColumns = <L>(cols: readonly StatColumn<L>[]) => cols.filter((c) => c.only !== "table");

/** Faixas do cabeçalho agrupado: grupos consecutivos viram uma célula com colSpan. */
export function groupSpans<L>(cols: readonly StatColumn<L>[]): { group: StatGroup; span: number }[] {
  const spans: { group: StatGroup; span: number }[] = [];
  for (const c of cols) {
    const last = spans.at(-1);
    if (last && last.group === c.group) last.span += 1;
    else spans.push({ group: c.group, span: 1 });
  }
  return spans;
}
