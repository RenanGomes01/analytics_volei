# Arquitetura Técnica
- Front-end: Next.js (React/TypeScript), PWA.
- Local-first: Dexie.js (IndexedDB).
- Sync: Outbox Pattern (mutation_id, server_seq). O servidor é a fonte da verdade para resolução de conflitos, mas a UI não bloqueia esperando a rede.
- Segurança: Isolamento de tenant local; exportação manual em JSON/CSV.

## Portabilidade e persistência (Fase 4b)
- **Proteção do IndexedDB:** `navigator.storage.persist()` é pedido ao abrir o app, em "Começar scout" e no botão "Proteger dados" da home. O navegador decide; no iPad a proteção real vem de instalar o app na tela de início. O backup JSON continua sendo a garantia.
- **Importação (`/import`, funciona offline):** valida formato, estrutura dos dados, hash e assinatura (`verifyMatchExport`) e mostra a impressão digital do aparelho de origem (este aparelho / já visto / novo). A gravação é append-only e atômica:
  - partida nova → importa tudo;
  - mesmos dados → nada a fazer;
  - backup mais novo → só os eventos que faltam;
  - este aparelho tem eventos que o arquivo não tem → recusa (não mescla ledgers de aparelhos diferentes);
  - mesmo id com conteúdo diferente → recusa.
  Linhas importadas entram no outbox; o servidor deve ser idempotente também por entidade (mesmo conteúdo = mesmo `server_seq`).
- **Limite da assinatura:** prova integridade e qual chave assinou; não prova, sozinha, que o arquivo não foi forjado com outra chave. A garantia forte virá com o registro das chaves dos tablets num servidor.
- **CSV do Box Score:** separador `;`, vírgula decimal, BOM UTF-8 e CRLF (Excel pt-BR); nomes que começam com `= + - @` são neutralizados contra fórmulas. Respeita o filtro de set. Sem assinatura: é relatório, não backup.

## Cadastro central e competições (Fase 5)
- **Tabelas novas (Dexie v3):** `teams` (dupla/elenco persistente, única por `pair_key` = ids canônicos ordenados), `tournaments`, `tournament_entries` (vínculo partida → torneio) e `athlete_aliases` (cadastros duplicados da mesma pessoa). A migração **não altera nenhuma linha existente**: ledgers e JSONs assinados do MVP continuam válidos.
- **A partida não muda:** `team_a`/`team_b` são um retrato do jogo. A dupla é deduzida pelo `pair_key` (depois dos aliases) e o torneio vem do `tournament_entry`. Jogos do MVP entram no histórico unindo atletas (`/roster`) e vinculando a partida a um torneio.
- **Cadastro editável:** atletas, duplas, torneios e aliases usam `op: "upsert" | "delete"` no outbox. Na importação, atleta existente = vale a versão local (sem conflito); partida e lances continuam estritos.
- **Rotas:** `/tournament?id=` e `/roster` (estáticas, pré-cacheadas: funcionam offline).

## Temporada e dashboards (Fase 6)
- **Sem migração de banco:** `Athlete.gender` e `Tournament.category` são opcionais e sem índice; os filtros acontecem em memória.
- **Serviço** `src/services/season-service.ts` (`loadSeason`): uma leitura de `rally_events` por `tenant_id`, agrupada por partida, + torneios, atletas, duplas e aliases.
- **Domínio puro** `src/domain/stats/season.ts` (`filterSeason`, `seasonStats`, `athleteSeries`, `athletePartners`, `teamSeries`, `pointKinds`, recortes por gênero) e `team-rankings.ts` (`rankTeams`).
- **Gráficos:** Recharts 3.10, só em `src/features/charts/` e importado apenas pelas telas de análise — a tela de scout (`/match`) não carrega o pacote. Paleta validada para daltonismo em `palette.ts`.
- **Rotas estáticas por query string, pré-cacheadas:** `/rankings?year=&gender=&view=&category=&friendlies=`, `/athlete?id=`, `/team?key=`. O service worker ignora esses parâmetros ao casar com o pré-cache.

## Fluxo in-game e fases (Fase 7)
- **Sem nova versão do Dexie.** `match_end` é mais um tipo de evento do ledger (append-only, rally_id próprio, anulável por `void`); `TournamentEntry.phase` é opcional e sem índice. O envelope de exportação continua v1 (o validador aceita `match_end`).
- `finishMatch()` (`rally-ledger-service.ts`) grava o encerramento; `replayMatch` descarta o rali aberto, marca o set `interrupted` e expõe `state.end`.
- `appendRallies()` grava vários ralis numa transação (gerador de dados de teste).
- `setMatchPhase()` reclassifica a fase (upsert no outbox). `filterSeason({ phase })` e `useCompetitionData(…, phase)` filtram por fase.
- **Estatísticas in-game:** `src/domain/stats/match-insights.ts` (evolução do placar, maiores sequências, desfecho de ataques e saques, "como os pontos aconteceram"). Os gráficos (`src/features/stats/match-charts.tsx`) entram por `next/dynamic` só quando a aba abre; o chunk fica no pré-cache.

## Cloud sync com Supabase (Fase 8)
- **Local-first continua:** toda tela lê o Dexie. A nuvem é um espelho: recebe o outbox (push) e devolve o que outros aparelhos da mesma conta gravaram (pull). Nada no scout espera pela rede.
- **Postgres** (`supabase/migrations/0001_cloud_sync.sql`): uma tabela por store (`athletes`, `teams`, `tournaments`, `tournament_entries`, `athlete_aliases`, `matches`, `rally_events`) com `owner_id` (= `auth.uid()`), `id`, `server_seq`, `data jsonb` (a linha do Dexie sem `tenant_id`), `deleted_at` (lápide) e colunas tipadas **geradas** a partir de `data`. Campo opcional novo no app não exige migração. `sync_mutations` é o registro de idempotência. Sem foreign keys (uma FK violada travaria a fila FIFO). `rally_events` tem trigger que recusa UPDATE/DELETE. RLS em tudo; `anon` sem acesso.
- **RPCs** (`security invoker`): `push_mutations(batch)` aplica o lote numa transação, com lock por conta (os `server_seq` de uma conta são confirmados em ordem → o cursor do pull não pula linhas); erro de dado numa mutação vira `conflict` sem travar as outras. `pull_changes(since, limit)` devolve as mudanças em ordem de `server_seq`.
- **App:** `SupabaseTransport` (`src/services/sync/supabase-transport.ts`) implementa `SyncTransport` e `PullSource`; o motor `runSyncCycle` não mudou. `pull-service.ts` aplica cada página numa transação Dexie junto com o cursor (`meta["sync:pull_cursor"]`), sem outbox. `account-service.ts` cuida do vínculo aparelho ↔ conta. O SDK (`@supabase/supabase-js`) entra só por `import()` em `supabase-client.ts`.
- **Mesclagem no pull:** partida e lances só são acrescentados (mesmo id com outro conteúdo → mantém o local e registra a divergência); cadastro segue o servidor, exceto se houver mudança local pendente/enviada; lápide remove. Lance que ocupa um `local_seq` já usado na partida = partida scouteada em dois aparelhos (guardado e sinalizado).
- **SyncAgent:** só sincroniza com conta conectada **e** vínculo confirmado (`meta["sync:account"]`). Ciclo = push → pull; na rota `/match` só push. Avisos em `meta` (`sync:blocked`, `sync:pull_error`) aparecem no `SyncBadge` e em `/account`.
- **Dados de teste:** o outbox do `/dev/seed` nasce `local_only` (`withLocalOnlyOutbox`) e nunca é enviado.
- **Service worker:** origens `*.supabase.co`/`*.supabase.in` são `NetworkOnly` (o `defaultCache` guardaria GETs de outra origem, inclusive de autenticação).
- **Testes:** o SQL roda em Postgres em memória (`@electric-sql/pglite`, `tests/sql/`) com `auth.uid()` simulado; o app usa um servidor falso com a mesma semântica (`tests/services/cloud-sync.test.ts`).

## CRUD e central de sincronização (Fase 10)
- **Exclusões com lápide.** Atleta, dupla, torneio e vínculo: apagados localmente + outbox `delete` na mesma transação; o servidor marca `deleted_at` (com `server_seq` novo) e o pull apaga nos outros aparelhos. **Partida:** exclusão lógica (`Match.deleted_at`) — a linha e os lances ficam, aqui e na nuvem (ledger imutável); a lixeira restaura com `upsert`.
- **Integridade sem FKs:** checada no serviço antes de gravar. Atleta com partidas (inclusive na lixeira) ou em união não é excluída (o caminho é "Unir atletas"); dupla é só atalho de cadastro; torneio excluído leva os vínculos (partidas viram amistosos); dupla da partida só muda antes do scout.
- **Nuvem:** `0002_editable_matches.sql` libera `upsert`/`delete` em `matches` (policy de UPDATE do dono); `rally_events` continua só `insert` + trigger append-only.
- **Pull:** partida segue a regra do cadastro (servidor vence, salvo mudança local pendente **ou recusada**); lápide de partida vira `deleted_at` local.
- **Fila e falhas:** recusa do servidor (`conflict`) não para a fila; falha de envio (rede, login, 5xx) para a fila FIFO de propósito e aparece como "Envio parado em: …". Recuperação (`recovery-service.ts`): reenviar o estado atual (mutações antigas da entidade viram `dismissed`), usar a versão da nuvem (descarta a local e refaz o pull do zero), ignorar, e pular a cabeça da fila após 5 erros que não são de rede. `dismissed` fica só para auditoria.

## Agregação por atleta e dicionário de estatísticas (Fase 12)
- **Nenhuma estatística é persistida.** O IndexedDB e o Supabase guardam só o ledger (cada lance com o `athlete_id` de quem tocou) e o cadastro. Tela, ranking, perfil e CSV recalculam a partir dos lances.
- **A atleta é a entidade da agregação individual:** `aggregateCompetition` soma contadores brutos por id canônico (aliases unem cadastros duplicados) e registra por quais duplas ela passou (`team_keys`). A dupla é uma agregação paralela, por `pair_key`. Trocar de parceiro não divide nem perde o histórico (`athleteByCompetition` mostra por torneio; a soma é a temporada).
- **Dicionário único** (`stat-columns.ts`): sigla, nome completo, explicação, fundamento e se a coluna é de volume. `StatTable` (cabeçalho por fundamento, dica no mouse/toque, legenda) e os CSVs (`statCell`, cabeçalhos completos) leem dele.
