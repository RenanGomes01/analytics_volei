import type { Modality } from "../types";
import type { TeamAggregate } from "./aggregate";
import { efficiency, rate } from "./rate";
import type { TouchCounters, TouchDelta } from "./touch-lines";
import type { AttackLine, Rate, ReceptionLine, ServeLine } from "./types";

/**
 * Dicionário único das estatísticas (Fase 12): sigla, nome completo e explicação de cada coluna.
 * Tabelas, legenda e CSVs leem daqui — sigla nova só entra por este arquivo. Em cada fundamento a
 * ordem é sempre: total (volume) → acertos → erros → continuidade → índice.
 */

export type StatGroup = "geral" | "ataque" | "saque" | "recepcao" | "bloqueio" | "defesa" | "levantamento" | "erros" | "resultado";

export const GROUP_LABEL: Record<StatGroup, string> = {
  geral: "Geral",
  resultado: "Resultado",
  ataque: "Ataque",
  saque: "Saque",
  recepcao: "Recepção",
  bloqueio: "Bloqueio",
  defesa: "Defesa",
  levantamento: "Levantamento",
  erros: "Erros",
};

/** Ordem dos grupos no construtor de relatórios. */
export const GROUP_ORDER: StatGroup[] = ["geral", "resultado", "ataque", "saque", "recepcao", "bloqueio", "defesa", "levantamento", "erros"];

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
  /** Micro-métrica (Fase 15): fica fora das tabelas compactas; aparece em "todas as métricas", no construtor e no CSV. */
  detail?: true;
  /** Métrica-foco do grupo (Fase 16): ao marcar o grupo no construtor, a tabela ordena por ela. */
  focus?: true;
  value: (line: L) => number | Rate | string | null;
  /**
   * Drill-down: quanto cada lance soma a esta coluna (a partir do mesmo `touchDelta` das estatísticas).
   * Em contagens, a soma sobre os lances é igual ao valor da coluna (invariante testada); em
   * porcentagens, é a base do cálculo (o volume que a % resume).
   */
  drill?: (d: TouchDelta) => number;
}

const n = (k: keyof TouchCounters) => (d: TouchDelta) => d[k] ?? 0;

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
  counters: TouchCounters;
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
        focus: true,
        short: "Na mão",
        full: "Passe na mão (%)",
        hint: "Passes # (na mão) sobre as recepções avaliadas. As do modo rápido (não avaliadas) ficam fora.",
        group: "recepcao",
        format: "pct",
        value: (l) => l.reception.positive,
        drill: n("receptions_rated"),
      }
    : {
        key: "rec_positive",
        focus: true,
        short: "#+",
        full: "Recepção perfeita ou positiva (%)",
        hint: "Recepções # e + sobre as recepções avaliadas.",
        group: "recepcao",
        format: "pct",
        value: (l) => l.reception.positive,
        drill: n("receptions_rated"),
      };

/** Colunas da linha de atleta (partida, torneio, temporada, perfil). */
export function athleteColumns({ modality, aggregated = false, showReception = true }: ColumnOptions): StatColumn<PlayerLine>[] {
  const c = (l: PlayerLine) => l.counters;
  const cols: (StatColumn<PlayerLine> | false)[] = [
    aggregated && { key: "matches", short: "J", full: "Jogos", hint: "Partidas em que a atleta estava em quadra.", group: "geral", format: "count", value: (l) => l.matches ?? 0 },
    { key: "points", focus: true, short: "Pts", full: "Pontos (ataque + ace + bloqueio)", hint: "Pontos feitos pela atleta: ataques #, aces e bloqueios #.", group: "geral", format: "count", value: (l) => l.points, drill: (d) => (d.kills ?? 0) + (d.aces ?? 0) + (d.blocks ?? 0) },

    { key: "atk_total", short: "TA", full: "Total de ataques", hint: "Todas as bolas atacadas: pontos + erros + em jogo.", group: "ataque", format: "count", total: true, value: (l) => l.attack.attempts, drill: n("attack_attempts") },
    { key: "atk_kills", short: "PA", full: "Pontos de ataque", hint: "Ataques # que viraram ponto.", group: "ataque", format: "count", value: (l) => l.attack.kills, drill: n("kills") },
    { key: "atk_errors", short: "EA", full: "Erros de ataque", hint: "Ataque = (fora, rede) ou bloqueado para ponto do adversário.", group: "ataque", format: "count", value: (l) => l.attack.errors, drill: n("attack_errors") },
    { key: "atk_in_play", short: "AJ", full: "Ataques em jogo (continuidade)", hint: "Ataques que não foram ponto nem erro: a bola seguiu em jogo.", group: "ataque", format: "count", value: (l) => l.attack.in_play, drill: (d) => (d.attack_attempts ?? 0) - (d.kills ?? 0) - (d.attack_errors ?? 0) },
    { key: "atk_blocked", short: "Bloq.", full: "Ataques bloqueados", hint: "Ataques que o bloqueio adversário devolveu para ponto (estão dentro dos erros de ataque).", group: "ataque", format: "count", detail: true, value: (l) => c(l).attack_blocked, drill: n("attack_blocked") },
    { key: "atk_kill_pct", short: "%PA", full: "Aproveitamento de ataque (%)", hint: "Pontos de ataque ÷ total de ataques.", group: "ataque", format: "pct", detail: true, value: (l) => rate(c(l).kills, c(l).attack_attempts), drill: n("attack_attempts") },
    { key: "atk_err_pct", short: "%EA", full: "Erros de ataque (%)", hint: "Erros de ataque (inclui bloqueados) ÷ total de ataques.", group: "ataque", format: "pct", detail: true, value: (l) => rate(c(l).attack_errors, c(l).attack_attempts), drill: n("attack_attempts") },
    { key: "atk_eff", focus: true, short: "Efic.", full: "Eficiência de ataque (%)", hint: "(Pontos de ataque − erros de ataque) ÷ total de ataques.", group: "ataque", format: "pct", value: (l) => l.attack.efficiency, drill: n("attack_attempts") },
    { key: "atk_k1_eff", short: "Efic. K1", full: "Eficiência de ataque na virada de bola (K1)", hint: "(Pontos − erros) ÷ ataques feitos recebendo o saque (side-out).", group: "ataque", format: "pct", detail: true, value: (l) => efficiency(c(l).attack_k1_kills, c(l).attack_k1_errors, c(l).attack_k1_attempts), drill: n("attack_k1_attempts") },
    { key: "atk_k2_eff", short: "Efic. K2", full: "Eficiência de ataque no contra-ataque (K2)", hint: "(Pontos − erros) ÷ ataques de transição (depois de defesa, bloqueio ou bola de graça).", group: "ataque", format: "pct", detail: true, value: (l) => efficiency(c(l).attack_k2_kills, c(l).attack_k2_errors, c(l).attack_k2_attempts), drill: n("attack_k2_attempts") },
    { key: "atk_share", short: "%Dupla", full: "Participação no ataque da dupla (%)", hint: "Ataques dela ÷ ataques da dupla nas partidas em que jogou: quem carrega o ataque.", group: "ataque", format: "pct", detail: true, value: (l) => rate(l.attack.attempts, c(l).team_attack_attempts) },
    { key: "atk_first", short: "1ª", full: "Ataques de primeira", hint: "Ataque no 1º toque da posse (bola de primeira).", group: "ataque", format: "count", detail: true, value: (l) => c(l).attack_first, drill: n("attack_first") },
    {
      key: "second_ball",
      short: "2ª",
      full: "Bola de segunda (pontos/tentativas)",
      hint: "Ataque no 2º toque da posse: pontos / tentativas.",
      group: "ataque",
      format: "text",
      only: "table",
      value: (l) => (l.attack.second_ball.attempts ? `${l.attack.second_ball.kills}/${l.attack.second_ball.attempts}` : null),
      drill: n("second_ball_attempts"),
    },
    { key: "second_ball_attempts", short: "2ª T", full: "Bola de segunda — tentativas", hint: "Ataques no 2º toque da posse.", group: "ataque", format: "count", only: "csv", value: (l) => l.attack.second_ball.attempts, drill: n("second_ball_attempts") },
    { key: "second_ball_kills", short: "2ª P", full: "Bola de segunda — pontos", hint: "Bolas de segunda que viraram ponto.", group: "ataque", format: "count", only: "csv", value: (l) => l.attack.second_ball.kills, drill: n("second_ball_kills") },
    { key: "atk_third", short: "3º", full: "Ataques no 3º toque", hint: "Ataque depois de recepção/defesa e levantamento (3º toque da posse).", group: "ataque", format: "count", detail: true, value: (l) => c(l).attack_third, drill: n("attack_third") },
    { key: "atk_shots", short: "Larg.", full: "Largadas / shots", hint: "Ataques registrados como largada ou shot (em qualquer toque da posse).", group: "ataque", format: "count", detail: true, value: (l) => c(l).attack_shots, drill: n("attack_shots") },
    { key: "atk_block_out", short: "ExpB", full: "Pontos explorando o bloqueio", hint: "Ataques que usaram o bloqueio adversário (block-out) e viraram ponto.", group: "ataque", format: "count", detail: true, value: (l) => c(l).attack_block_out_kills, drill: n("attack_block_out_kills") },

    { key: "srv_total", short: "TS", full: "Total de saques", hint: "Todos os saques: aces + erros + em jogo.", group: "saque", format: "count", total: true, value: (l) => l.serve.attempts, drill: n("serve_attempts") },
    { key: "srv_aces", focus: true, short: "Ace", full: "Pontos de saque (aces)", hint: "Saque # ou recepção = do adversário logo após o saque.", group: "saque", format: "count", value: (l) => l.serve.aces, drill: n("aces") },
    { key: "srv_errors", short: "ES", full: "Erros de saque (total)", hint: "Todos os erros de saque, inclusive lances antigos sem detalhe de rede/fora.", group: "saque", format: "count", value: (l) => l.serve.errors, drill: n("serve_errors") },
    { key: "srv_errors_net", short: "ES-R", full: "Erros de saque na rede", hint: "Saque = que parou na rede.", group: "saque", format: "count", value: (l) => l.serve.errors_net, drill: n("serve_errors_net") },
    { key: "srv_errors_out", short: "ES-F", full: "Erros de saque pra fora", hint: "Saque = que caiu fora.", group: "saque", format: "count", value: (l) => l.serve.errors_out, drill: n("serve_errors_out") },
    { key: "srv_in_play", short: "SJ", full: "Saques em jogo (continuidade)", hint: "Total de saques − aces − erros: o adversário recebeu.", group: "saque", format: "count", value: (l) => serveInPlay(l.serve), drill: (d) => (d.serve_attempts ?? 0) - (d.aces ?? 0) - (d.serve_errors ?? 0) },
    { key: "srv_ace_pct", short: "%Ace", full: "Aces (% dos saques)", hint: "Aces ÷ total de saques.", group: "saque", format: "pct", detail: true, value: (l) => rate(l.serve.aces, l.serve.attempts), drill: n("serve_attempts") },
    { key: "srv_err_pct", short: "%ES", full: "Erros de saque (% dos saques)", hint: "Erros de saque ÷ total de saques.", group: "saque", format: "pct", detail: true, value: (l) => rate(l.serve.errors, l.serve.attempts), drill: n("serve_attempts") },
    { key: "srv_pressure", short: "Press.", full: "Pressão do saque (%)", hint: "Recepções adversárias ruins (-, /, =) forçadas ÷ saques com a recepção avaliada.", group: "saque", format: "pct", detail: true, value: (l) => rate(c(l).serve_pressure_forced, c(l).serve_pressure_rated), drill: n("serve_pressure_rated") },
    { key: "srv_break", short: "Quebra", full: "Quebra de saque da sacadora (%)", hint: "Ralis ganhos pela equipe com o saque dela ÷ saques dela (K2 individual).", group: "saque", format: "pct", detail: true, value: (l) => rate(c(l).serve_won, l.serve.attempts), drill: n("serve_attempts") },

    { key: "rec_total", short: "TR", full: "Total de recepções", hint: "Todas as recepções de saque, avaliadas ou não.", group: "recepcao", format: "count", total: true, value: (l) => l.reception.attempts, drill: n("receptions") },
    showReception && receptionColumn<PlayerLine>(modality),
    { key: "rec_errors", short: "ER", full: "Erros de recepção (aces sofridos)", hint: "Recepção = logo após o saque: ponto direto do adversário.", group: "recepcao", format: "count", value: (l) => l.reception.errors, drill: n("reception_errors") },
    { key: "rec_target", short: "Alvo", full: "Alvo do saque (%)", hint: "Recepções dela ÷ saques que chegaram à equipe dela: quanto o adversário sacou nela.", group: "recepcao", format: "pct", detail: true, value: (l) => rate(l.reception.attempts, c(l).serves_faced) },
    { key: "rec_err_pct", short: "%ER", full: "Erros de recepção (% das recepções)", hint: "Recepções = ÷ total de recepções.", group: "recepcao", format: "pct", detail: true, value: (l) => rate(l.reception.errors, l.reception.attempts), drill: n("receptions") },
    { key: "rec_sideout", short: "K1 rec.", full: "Virada de bola após a recepção dela (%)", hint: "Ralis ganhos pela equipe quando ela recebeu ÷ recepções dela.", group: "recepcao", format: "pct", detail: true, value: (l) => rate(c(l).reception_won, l.reception.attempts), drill: n("receptions") },
    { key: "rec_first_ball", short: "K1 1ª", full: "Virada de primeira (%)", hint: "Recepções dela em que a equipe ganhou o rali sem precisar de uma segunda posse (o primeiro ataque decidiu) ÷ recepções dela.", group: "recepcao", format: "pct", detail: true, value: (l) => rate(c(l).reception_first_ball_won, l.reception.attempts), drill: n("receptions") },
    { key: "rec_long", short: "K1 longo", full: "Virada no rali longo (%)", hint: "Quando o primeiro ataque não decidiu e o rali voltou: ralis ganhos ÷ ralis que voltaram (recepções dela).", group: "recepcao", format: "pct", detail: true, value: (l) => rate(c(l).reception_long_rally_won, c(l).reception_long_rally), drill: n("reception_long_rally") },
    { key: "rec_pressure", short: "K1 press.", full: "Virada de bola sob pressão (%)", hint: "Recepções dela com a equipe vindo de 2+ pontos perdidos seguidos: ralis ganhos ÷ essas recepções.", group: "recepcao", format: "pct", detail: true, value: (l) => rate(c(l).reception_pressure_won, c(l).reception_pressure), drill: n("reception_pressure") },

    { key: "blk_touches", short: "TB", full: "Total de bloqueios (toques)", hint: "Todos os toques de bloqueio registrados.", group: "bloqueio", format: "count", total: true, detail: true, value: (l) => c(l).block_touches, drill: n("block_touches") },
    { key: "blocks", focus: true, short: "Blq", full: "Pontos de bloqueio", hint: "Bloqueios # que viraram ponto.", group: "bloqueio", format: "count", value: (l) => l.blocks, drill: n("blocks") },
    { key: "blk_errors", short: "EB", full: "Erros de bloqueio", hint: "Bloqueio = (toque na rede, bola pra fora no bloqueio).", group: "bloqueio", format: "count", detail: true, value: (l) => c(l).block_errors, drill: n("block_errors") },
    { key: "blk_exploited", short: "Blq expl.", full: "Bloqueios explorados (sofridos)", hint: "Ataques adversários que usaram o bloqueio dela (block-out) e viraram ponto. Só quando o toque de bloqueio foi registrado.", group: "bloqueio", format: "count", detail: true, value: (l) => c(l).block_exploited, drill: n("block_exploited") },

    { key: "digs", focus: true, short: "Def", full: "Total de defesas", hint: "Todas as defesas (primeiro toque depois de um ataque).", group: "defesa", format: "count", total: true, value: (l) => l.digs, drill: n("digs") },
    { key: "dig_positive", short: "Def+", full: "Defesas positivas", hint: "Defesas # ou + (bola boa para o contra-ataque).", group: "defesa", format: "count", detail: true, value: (l) => c(l).dig_positive, drill: n("dig_positive") },
    { key: "dig_errors", short: "ED", full: "Erros de defesa", hint: "Defesa = (a bola caiu ou saiu sem controle).", group: "defesa", format: "count", detail: true, value: (l) => c(l).dig_errors, drill: n("dig_errors") },
    { key: "dig_won", short: "K2 def.", full: "Contra-ataque convertido após a defesa (%)", hint: "Ralis ganhos pela equipe depois de uma defesa dela ÷ defesas dela.", group: "defesa", format: "pct", detail: true, value: (l) => rate(c(l).dig_won, l.digs), drill: n("digs") },

    { key: "sets", focus: true, short: "TL", full: "Total de levantamentos", hint: "Todos os levantamentos registrados (volume de distribuição).", group: "levantamento", format: "count", total: true, detail: true, value: (l) => c(l).sets, drill: n("sets") },
    { key: "set_errors", short: "EL", full: "Erros de levantamento", hint: "Levantamento = (dois toques, condução, bola perdida).", group: "levantamento", format: "count", detail: true, value: (l) => c(l).set_errors, drill: n("set_errors") },

    { key: "errors", focus: true, short: "Err", full: "Erros cometidos (total)", hint: "Todos os lances = da atleta e ataques bloqueados.", group: "erros", format: "count", total: true, detail: true, value: (l) => l.errors, drill: n("errors") },
    { key: "points_given", short: "PE", full: "Pontos entregues", hint: "Erros que deram o ponto ao adversário (lance = ou ataque bloqueado num rali perdido).", group: "erros", format: "count", detail: true, value: (l) => c(l).points_given, drill: n("points_given") },
    { key: "faults", short: "Falt.", full: "Faltas", hint: "Faltas sem contato com a bola: toque na rede, invasão, condução, pé na linha…", group: "erros", format: "count", detail: true, value: (l) => c(l).faults, drill: n("faults") },
  ];
  return cols.filter((c): c is StatColumn<PlayerLine> => !!c);
}

/** Colunas da linha de dupla/time no torneio. */
export function teamColumns({ modality, showReception = true }: ColumnOptions): StatColumn<TeamAggregate>[] {
  const cols: (StatColumn<TeamAggregate> | false)[] = [
    { key: "matches", short: "J", full: "Jogos", hint: "Partidas no recorte.", group: "resultado", format: "count", value: (t) => t.matches },
    { key: "wins", focus: true, short: "V", full: "Vitórias", hint: "Partidas vencidas.", group: "resultado", format: "count", value: (t) => t.wins },
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

    { key: "atk_total", short: "TA", full: "Total de ataques", hint: "Todas as bolas atacadas pela dupla.", group: "ataque", format: "count", total: true, value: (t) => t.attack.attempts, drill: n("attack_attempts") },
    { key: "atk_kills", short: "PA", full: "Pontos de ataque", hint: "Ataques # que viraram ponto.", group: "ataque", format: "count", value: (t) => t.attack.kills, drill: n("kills") },
    { key: "atk_errors", short: "EA", full: "Erros de ataque", hint: "Ataque = ou bloqueado para ponto do adversário.", group: "ataque", format: "count", value: (t) => t.attack.errors, drill: n("attack_errors") },
    { key: "atk_blocked", short: "Bloq.", full: "Ataques bloqueados", hint: "Ataques que o bloqueio adversário devolveu para ponto.", group: "ataque", format: "count", detail: true, value: (t) => t.counters.attack_blocked, drill: n("attack_blocked") },
    { key: "atk_eff", focus: true, short: "Efic.", full: "Eficiência de ataque (%)", hint: "(Pontos de ataque − erros de ataque) ÷ total de ataques.", group: "ataque", format: "pct", value: (t) => t.attack.efficiency, drill: n("attack_attempts") },
    { key: "atk_k1_eff", short: "Efic. K1", full: "Eficiência de ataque na virada de bola (K1)", hint: "(Pontos − erros) ÷ ataques feitos recebendo o saque.", group: "ataque", format: "pct", detail: true, value: (t) => efficiency(t.counters.attack_k1_kills, t.counters.attack_k1_errors, t.counters.attack_k1_attempts), drill: n("attack_k1_attempts") },
    { key: "atk_k2_eff", short: "Efic. K2", full: "Eficiência de ataque no contra-ataque (K2)", hint: "(Pontos − erros) ÷ ataques de transição.", group: "ataque", format: "pct", detail: true, value: (t) => efficiency(t.counters.attack_k2_kills, t.counters.attack_k2_errors, t.counters.attack_k2_attempts), drill: n("attack_k2_attempts") },

    { key: "srv_total", short: "TS", full: "Total de saques", hint: "Todos os saques da dupla.", group: "saque", format: "count", total: true, value: (t) => t.serve.attempts, drill: n("serve_attempts") },
    { key: "srv_aces", focus: true, short: "Ace", full: "Pontos de saque (aces)", hint: "Aces da dupla.", group: "saque", format: "count", value: (t) => t.points.aces },
    { key: "srv_errors", short: "ES", full: "Erros de saque (total)", hint: "Todos os erros de saque da dupla.", group: "saque", format: "count", value: (t) => t.serve.errors, drill: n("serve_errors") },
    { key: "srv_pressure", short: "Press.", full: "Pressão do saque (%)", hint: "Recepções adversárias ruins (-, /, =) forçadas ÷ saques com a recepção avaliada.", group: "saque", format: "pct", detail: true, value: (t) => rate(t.counters.serve_pressure_forced, t.counters.serve_pressure_rated), drill: n("serve_pressure_rated") },

    { key: "rec_total", short: "TR", full: "Total de recepções", hint: "Todas as recepções de saque da dupla.", group: "recepcao", format: "count", total: true, value: (t) => t.reception.attempts, drill: n("receptions") },
    showReception && receptionColumn<TeamAggregate>(modality),
    { key: "rec_errors", short: "ER", full: "Erros de recepção (aces sofridos)", hint: "Recepções = da dupla.", group: "recepcao", format: "count", detail: true, value: (t) => t.reception.errors, drill: n("reception_errors") },
    { key: "rec_first_ball", short: "K1 1ª", full: "Virada de primeira (%)", hint: "Recepções em que a dupla ganhou o rali sem precisar de uma segunda posse (o primeiro ataque decidiu) ÷ recepções.", group: "recepcao", format: "pct", detail: true, value: (t) => rate(t.counters.reception_first_ball_won, t.reception.attempts), drill: n("receptions") },
    { key: "rec_long", short: "K1 longo", full: "Virada no rali longo (%)", hint: "Quando o primeiro ataque não decidiu e o rali voltou: ralis ganhos ÷ ralis que voltaram.", group: "recepcao", format: "pct", detail: true, value: (t) => rate(t.counters.reception_long_rally_won, t.counters.reception_long_rally), drill: n("reception_long_rally") },
    { key: "rec_pressure", short: "K1 press.", full: "Virada de bola sob pressão (%)", hint: "Recepções vindo de 2+ pontos perdidos seguidos: ralis ganhos ÷ essas recepções.", group: "recepcao", format: "pct", detail: true, value: (t) => rate(t.counters.reception_pressure_won, t.counters.reception_pressure), drill: n("reception_pressure") },

    { key: "blocks", focus: true, short: "Blq", full: "Pontos de bloqueio", hint: "Bloqueios # que viraram ponto.", group: "bloqueio", format: "count", value: (t) => t.points.blocks },
    { key: "blk_exploited", short: "Blq expl.", full: "Bloqueios explorados (sofridos)", hint: "Pontos do adversário usando o bloqueio desta dupla (block-out).", group: "bloqueio", format: "count", detail: true, value: (t) => t.counters.blocks_exploited },

    { key: "digs", focus: true, short: "Def", full: "Total de defesas", hint: "Todas as defesas da dupla.", group: "defesa", format: "count", total: true, detail: true, value: (t) => t.digs, drill: n("digs") },

    { key: "errors", focus: true, short: "Err", full: "Erros cometidos (total)", hint: "Todos os lances = da dupla e ataques bloqueados.", group: "erros", format: "count", total: true, detail: true, value: (t) => t.errors, drill: n("errors") },
    { key: "points_given", short: "PE", full: "Pontos entregues", hint: "Erros que deram o ponto ao adversário.", group: "erros", format: "count", detail: true, value: (t) => t.counters.points_given, drill: n("points_given") },
  ];
  return cols.filter((c): c is StatColumn<TeamAggregate> => !!c);
}

/** Colunas da tela. `detailed` = inclui as micro-métricas (construtor, "todas as métricas"). */
export const tableColumns = <L>(cols: readonly StatColumn<L>[], { detailed = false }: { detailed?: boolean } = {}) =>
  cols.filter((c) => c.only !== "csv" && (detailed || !c.detail));
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
