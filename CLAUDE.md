# Guia de Desenvolvimento (Claude Code)

## Contexto do Projeto
- Sistema de scout de vôlei (Beach-first 2x2, suporte a Indoor 6x6).
- **Arquitetura:** Next.js (React/TypeScript), PWA, Offline-first via Dexie.js (IndexedDB).
- **Motor de Regras:** Ledger de eventos de rali imutáveis.

## Regras Estritas de Atuação
1. **Offline Absoluto na Quadra:** O app deve funcionar 100% sem internet após o carregamento inicial. Nunca implemente lógicas de scout que exijam chamadas de API, processamento em nuvem ou IA externa em tempo de jogo.
2. **Plan Mode First:** Para mudanças arquiteturais, de estado complexo ou que afetem múltiplos arquivos, sempre proponha um plano detalhado e liste os arquivos afetados antes de escrever o código.
3. **Mutações Imutáveis:** O banco de dados opera sob o padrão Outbox. Não sobrescreva eventos; registre novos eventos com versionamento (server_seq) para resolução posterior de conflitos.
4. **Scout Manual:** Na Fase 1, toda inserção de dados é estritamente manual pela interface. O motor de Visão Computacional será um módulo separado no futuro.
5. **Testes Offline:** Priorize testes de replay de rali, validando as regras específicas do beach volley (ex: bloqueio conta como 1º toque).

## Comandos
- `npm test` — Vitest (domínio + Dexie real sobre `fake-indexeddb`). `npm run test:watch` em modo contínuo.
- `npm run typecheck` e `npm run lint`.
- Teste offline: `npm run build && npm start`, abrir uma vez, derrubar o servidor e recarregar. Em `next dev` o service worker fica desligado.

## Estrutura e dependências
- `src/domain/` — regras puras (tipos, `rules/modality.ts`, `rally/touch-counter.ts`, `rally/replay.ts`). Não importa React, Dexie nem I/O.
- `src/db/` — schema Dexie (`ScoutDB`). `src/services/` — única porta de acesso ao IndexedDB; recebe o `db` por parâmetro.
- Direção: `app → services → db + domain`. O estado da partida (placar, sacador, set) é sempre derivado por `replayMatch()`, nunca persistido.
- `rally_events` é append-only: correções via `voidEvent()`. Toda escrita grava a entidade e o `outbox` na mesma transação.
- PWA: Serwist via `src/app/serwist/[path]/route.ts` + `src/app/sw.ts`. Não reative `cacheComponents` (incompatível com essa rota).
- Toda página nova que precisa abrir offline entra em `additionalPrecacheEntries` (route.ts). Rotas recebem parâmetros por query string (`/match?id=`), nunca por segmento dinâmico, e o parâmetro precisa estar em `ignoreURLParametersMatching` (sw.ts).
- Links entre páginas usam `HardLink` (`src/components/hard-link.tsx`), não `<Link>`: a navegação completa é servida pelo pré-cache mesmo offline.
- Telas com navegação ficam em `src/app/(main)/` (o grupo não entra na URL): o layout dele dá o cabeçalho global (`AppHeader`) e a faixa de rede (`NetworkBanner`). Página nova vai para lá e **não** monta cabeçalho/"← Início" próprio. O scout (`/match`) fica fora (tela cheia; sai pelo "← Sair" do placar).

## UI de scout (`src/features/scout/`)
- **Tela = f(ledger):** `use-match-data.ts` faz `useLiveQuery` → `ScoutLedger` (gravados ∪ fila, Fase 14) → `replayMatch` → `nextAction`. Placar, rali, posse e sugestões nunca viram estado React.
- O único estado de UI é a seleção efêmera (`scout-ui-reducer.ts`: idle → armed). Ele volta para idle sempre que o tamanho do ledger (em memória) muda.
- O ponto sai da qualidade do lance (`domain/rally/implied-point.ts`): `#` em saque, ataque ou bloqueio e `=` em qualquer fundamento. Os botões Ponto A/B: sem toques no rali, falta sem lance; com o rali aberto, abrem "Como foi o ponto?" (`resolve-detailed-point.ts` + `resolvePoint`), nunca um ponto "manual" às cegas.
- A inferência destaca a equipe esperada, mas só bloqueia o que é fisicamente impossível. O analista precisa conseguir registrar o que viu, inclusive um 4º toque.
- Tela de scout: `h-dvh overflow-hidden`, sem scroll; alvos de toque com no mínimo 48px (botões principais com 64px).
- **Toda interface em PT-BR**, inclusive siglas e motivos de ponto (ex.: "Virada de bola", "Quebra de saque", "Bola de graça", "PA"). Identificadores no código continuam em inglês.
- `qualityOptions(modality, skill)` (`quality-hints.ts`) é a fonte de **quais botões de qualidade aparecem** e das dicas embaixo deles (até 20 caracteres), separadas por beach e indoor. Exemplos: recepção do beach com 4 botões; falta só com `=`. Tudo documentado em `docs/business_rules.md`. Ao mudar a regra de fim de rali, atualize os três: `implied-point.ts`, `quality-hints.ts` e o doc.
- `nextAction()` segue a bola: a **qualidade** pode indicar que ela cruzou a rede (`ballCrossed`: passe/defesa/levantamento `/`, bloqueio `-`/`/`). Use a linguagem da areia no beach (ver `labels.ts`: `SKILL_PROMPT`, `SPECIAL_SKILLS`).

## Estatísticas (`src/domain/stats/` + `src/features/stats/`)
- As estatísticas partem de `replayMatch(...).rallies`, nunca do ledger cru. Assim usam as mesmas anulações, sets, sacador e resultado de rali do placar.
- Invariante testada: os pontos da equipe (kills + aces + bloqueios + erros do adversário) são sempre iguais ao placar. Os testes de invariantes usam ledgers aleatórios com semente fixa.
- Toda divisão passa por `rate()` / `efficiency()` (`rate.ts`): denominador 0 vira `null` e aparece como "–".
- **Siglas, nomes completos e ordem das colunas** vêm só de `src/domain/stats/stat-columns.ts` (tabelas via `StatTable`, legenda e CSVs). Sigla nova entra lá, com `full` e `hint`; em cada fundamento o total vem primeiro. CSV usa sempre o nome completo.
- O histórico individual é da **atleta** (id canônico), nunca da dupla: estatística não é persistida (nem no Dexie nem no Supabase); tudo é recalculado do ledger por `aggregateCompetition`. Ver `athlete-independence.test.ts`.
- Definições: ataque bloqueado (próximo toque é bloqueio `#` do adversário) é erro do atacante; ponto de ataque e de bloqueio exigem `#` **e** o rali ganho; ace = rali com motivo `ace` (saque `#` ou recepção `=` logo após o saque) creditado à sacadora; "erros do adversário" = `error` + `four_touches` + `manual`.
- A UI (`StatsSheet`) usa os `events` do mesmo `useLiveQuery` da tela de scout: não abra outra consulta ao banco.

## Exportação e sync (Fase 4)
- **Exportação:** `exportMatch()` (`src/services/export/`) gera o envelope `volei-scout/match-export` v1 com o ledger completo (inclusive VoidEvents), um hash SHA-256 do JSON canônico de `data` e uma assinatura ECDSA P-256 da chave **não-extraível** do aparelho (fica na `meta`). Mudou o formato de forma incompatível? Suba `EXPORT_SCHEMA_VERSION` e mantenha `verifyMatchExport` lendo as versões antigas.
- **Outbox:** o sync só altera a tabela `outbox`, nunca `rally_events`. Envio FIFO por `created_at` (monotônico no `enqueue`), parando no primeiro retry; backoff em `src/services/sync/backoff.ts`; lease de 2 min para entradas presas em `sent`.
- **Transporte:** a interface é `SyncTransport` (`src/services/sync/transport.ts`); `MockTransport` (teste) e `SupabaseTransport` (Fase 8), sem mexer no motor. É obrigatório ser idempotente por `mutation_id`.
- **Versão nova do PWA:** o SW usa skipWaiting + clientsClaim, então abas abertas passam a ter código antigo sob um SW novo. `src/features/update/` detecta isso (`controllerchange`), mostra o banner "Nova versão disponível" e **pausa o SyncAgent** naquela aba até recarregar. Nunca recarregue automaticamente: `reloadOnOnline` fica desligado no `SerwistProvider`.
- `NEXT_PUBLIC_SYNC_MODE` = `off` (padrão), `mock` ou `supabase` (ver `.env.example`). O `SyncAgent` (no layout) nunca bloqueia a UI, e o status aparece só no `SyncBadge`, nunca na tela de scout.
- **Importação** (`src/services/export/import-service.ts`): sempre `inspectMatchExport` (só lê) antes de `importMatchExport` (transação única). Nunca sobrescreva: as situações são new / up_to_date / append / diverged / conflict (ver `docs/architecture.md`). Toda validação nova de arquivo entra em `validateExportData` (estrutura) — hash e assinatura não bastam.
- **CSV** (`src/domain/export/box-score-csv.ts`): formato Excel pt-BR (`;`, vírgula decimal, BOM). Todo texto vindo do usuário passa por `text()` (neutraliza fórmulas).
- **Persistência:** `src/services/storage/persistence.ts`; nunca prometa na interface que os dados estão garantidos só porque `persist()` foi pedido.
- Mudança de schema do IndexedDB = nova `version(n)` no `ScoutDB` com `upgrade()` e teste de migração (ver `tests/services/sync.test.ts`).

## Cadastro e competições (Fase 5)
- `src/domain/roster/` (tipos e identidade: `pairKey`, `resolveAthlete`), `src/services/roster-service.ts` e `tournament-service.ts`. Partidas novas nascem de `createMatchFromTeams` (reutiliza atletas e duplas).
- **Nunca reescreva ids no ledger nem altere linhas antigas em migrações:** una cadastros com `athlete_aliases` e vincule partidas com `tournament_entries`.
- **Agregação** (`src/domain/stats/aggregate.ts`): use `tallyRallies` (contadores brutos) + `finalizeTeam`/`athleteLines`; nunca agregue porcentagens já finalizadas. Rankings em `rankings.ts` com volume mínimo.
- CSV comum em `src/domain/export/csv.ts` (Box Score e torneio).

## Dashboards e temporada (Fase 6)
- `src/domain/stats/season.ts` + `src/services/season-service.ts`; telas em `src/features/analytics/` (`/rankings`, `/athlete?id=`, `/team?key=`).
- **Recharts só em `src/features/charts/`** e só importado por telas de análise. No scout (`/match`), só via `next/dynamic` (`src/features/stats/match-charts.tsx`), nunca no carregamento inicial.
- Gênero no atleta (`gender`), categoria no torneio (`category`), gênero da dupla deduzido por `teamGender`. Campos opcionais: não exigem migração.
- Gráficos: um eixo por gráfico, % sempre com volume, pouco volume esmaecido (nunca escondido).
- Rota nova com query string → adicionar em `additionalPrecacheEntries` e o parâmetro em `ignoreURLParametersMatching` (`src/app/sw.ts`).

## Fluxo in-game (Fase 7)
- "Como foi o ponto?" (`quick-rally.ts`) **sempre** termina com "Não vi como foi" (`unseen`): nenhuma sequência de toques pode deixar o analista sem saída (há teste exaustivo).
- Bola de primeira/segunda: `as_attack` converte o último toque em ataque. A estatística "2ª" é deduzida pela ordem dos toques (`touch-lines.ts`), sem campo novo.
- Encerramento manual = evento `match_end` (`finishMatch`); nunca altere a partida nem apague eventos para encerrar. Desfazer reabre.
- Fase da partida mora em `TournamentEntry.phase` (`setMatchPhase`); amistoso = sem torneio.
- Passe na mão só aparece com recepções avaliadas no recorte (`reception.positive.den > 0`).

## Cloud sync com Supabase (Fase 8)
- Telas leem **só o Dexie**; o Supabase é espelho (push do outbox + pull). Nunca leia do Supabase numa tela nem faça o scout esperar pela rede.
- SQL em `supabase/migrations/` (aplicado à mão no SQL Editor). Mudou o SQL? Crie `0002_….sql` (idempotente) e cubra em `tests/sql/` (PGlite).
- Tabelas da nuvem guardam a linha inteira em `data jsonb`; colunas tipadas são geradas. Campo opcional novo no app não exige SQL novo. Entidade nova no outbox exige: tabela + `sync_table()` + `pull_changes()` + `tableOf()` em `pull-service.ts`.
- `SupabaseTransport` implementa `SyncTransport`/`PullSource`; o SDK só por `import()` (`supabase-client.ts`), nunca no carregamento inicial.
- Pull grava sem outbox, numa transação por página junto com o cursor. Ledger: só acrescenta. Cadastro e partidas: servidor vence, salvo mudança local não enviada ou recusada (`conflict` espera a decisão do analista).
- O sync só roda com conta conectada **e** vínculo confirmado (`linkAccount`). Outbox do seed é `local_only` — e toda mutação posterior de uma entidade `local_only` herda o status (`enqueue`).

## CRUD e central de sincronização (Fase 10)
- Exclusão = mudança local + outbox `delete` na mesma transação (lápide `deleted_at` na nuvem). Sem FKs na nuvem: a integridade é checada no serviço **antes** (`deleteAthlete` recusa atleta com partidas; `deleteTournament` deixa as partidas como amistosos; `updateMatchTeams` só sem lances).
- Partida excluída é **lógica** (`Match.deleted_at`, lixeira com `restoreMatch`); os lances ficam no ledger. Toda leitura de partidas para tela/estatística filtra `deleted_at` (`listMatches`, `loadSeason`, `listTournamentMatches`). Nova consulta a `db.matches`? Filtre também.
- Partida editável na nuvem exige `supabase/migrations/0002_editable_matches.sql`. Sem ele, edição/exclusão de partida volta `conflict` com a instrução.
- Central (`src/features/account/sync-center.tsx`): `getSyncSummary` (o que está retido, item parado, recusados, com nomes legíveis) + `recovery-service.ts` (`retryEntry`, `acceptRemote`, `dismissEntry`, `skipHead`). Reenvio de cadastro/partida manda o **estado atual** e marca as mutações antigas como `dismissed` — nunca reenvie um payload velho.
- Falha de rede/login nunca é "pulada" (`isTransientError`); só erro do servidor repetido (≥ 5 tentativas) pode ir para revisão.
- Diálogos de confirmação: `ConfirmSheet` (`src/components/`), nunca `confirm()` do navegador.

## Ponto no modo detalhado (Fase 9)
- `outcomesForTouches` / `buildRallyFromTouches` (`quick-rally.ts`) são o núcleo único do "Como foi o ponto?": o modo rápido chega lá por `inferSkills(taps)`, o detalhado pelos toques do rali aberto.
- `resolveDetailedPoint` gera um plano append-only (anula um sufixo do rali e regrava, com `replaces_event_id`); `resolvePoint` aplica numa transação e marca os toques com `via_point`. `undoLastAction` desfaz esse ponto inteiro e regrava os originais. Nunca edite toques no lugar.

## UX guiada (Fase 11)
- **Lista vazia nunca é rua sem saída:** use `EmptyState` (`src/components/empty-state.tsx`) com o próximo passo como botão (ex.: "+ Cadastrar atleta", "+ Iniciar nova partida").
- **Todo CRUD confirma com toast** (`toast.success` de `src/features/toast/toast.ts`), disparado na interface, não no serviço. Antes de navegar com `window.location`, use `{ afterNavigation: true }` (vai pelo sessionStorage). Exclusão reversível oferece `action: Desfazer`. Erro de formulário continua no formulário.
- Rede: `useOnline()` (`src/features/network/use-network.ts`); a decisão da faixa é pura (`connection-banner.ts`, testada). Nada de rede/sync aparece no scout.

## Performance no tablet (Fase 13)
- **O outbox guarda todo o histórico** (cada lance com payload; dezenas de milhares de linhas). Consulta ao vivo (`useLiveQuery`) **nunca** lê o outbox inteiro: conte pelo índice `status` (`count()`) e leia só a fila (`pending`/`sent`/`conflict`). Ver `getSyncStatus`, `getSyncSummary`, `outbox-performance.test.ts`.
- Não grave na `meta`/outbox sem mudança real (ex.: ciclo de sync vazio): toda escrita re-executa as consultas ao vivo de todas as telas.
- Loops sobre muitas linhas usam `bulkGet`/consultas por índice, nunca `await table.get()` por item (ver `applyPulledPage`).
- Dexie v4: índices `rally_events.athlete_id` e `teams.*athlete_ids`. Índice novo = nova `version(n)` só com índices + teste de migração.
- **Todo botão que grava** usa `useSubmit()`/`runOnce` (trava por `ref`, vale no mesmo toque) e `SubmitButton` (desabilitado + spinner). Estado do React sozinho não impede o duplo toque no tablet.

## Scout sem espera de banco (Fase 14)
- **Nada no scout espera o IndexedDB.** Comando novo de scout = planejador puro em `src/domain/rally/plan-events.ts` (recebe um `LedgerDraft`, empilha eventos, lança o erro do comando) + `exec(plan)` de `use-match-data.ts`. Nunca `await` de serviço num botão do scout. O serviço equivalente em `rally-ledger-service.ts` usa o mesmo planejador (`command()`).
- `ScoutLedger` (`src/features/scout/scout-ledger.ts`) = gravados ∪ fila; gravação serial por `persistEvents` (só `rally_events` + `outbox`, idempotente). Falha nunca é silenciosa nem descarta lance (faixa "N lances ainda não foram salvos", aviso ao sair).
- **Sem sync em `/match`** (`syncAllowedOn` em `sync-config.ts`). Consulta ao vivo pesada em tela de análise/conta usa `useVisibleLiveQuery` (`src/lib/`), não `useLiveQuery`.
- `/match` nunca fica em "Carregando…" para sempre: `ScoutErrorBoundary` + timeout de 8 s → `LoadFailure` com diagnóstico (`load-diagnostics.ts`). "Recarregar banco de dados local" (`reopenDB`) nunca apaga dados.

## Analytics, drill-down e relatórios (Fase 15)
- **Métrica nova = contador em `TouchCounters`/`touchDelta`** (somável) + coluna em `stat-columns.ts` com `drill(delta)`. Nunca calcule número de tabela fora desse caminho: a invariante "soma do drill = coluna" é testada (`analytics.test.ts`).
- Micro-métrica leva `detail: true` (fora das tabelas compactas; aparece em "todas as métricas", no Construtor e no CSV).
- Drill, relatório e construtor partem de `buildFacts` (`domain/stats/facts.ts`), calculado uma vez por recorte (`useMemo`); nada de nova consulta ao banco.
- **PDF** = `PrintButton` (`window.print()`) + `@media print` em `globals.css`. Elemento só de tela: `data-print="hide"`; só de papel: `PrintHeader`/`print:block`.
- **Modo comissão técnica** (`src/features/staff/`): `StaffHidden` em botões de scout/CRUD, `StaffGuard` em telas de edição. É foco de interface, não segurança. A tela Nuvem fica acessível (a comissão entra na conta para receber dados).

## Dados de teste (`/dev/seed`)
- Gerador puro em `src/domain/dev/rally-generator.ts` (semente fixa, modo detalhado, fim do rali sempre por `impliedPoint`); serviço em `src/services/dev/seed-service.ts`, gravando pelos services reais (`appendRallies` = vários ralis numa transação).
- Os ids criados ficam em `meta["dev_seed"]`. `removeDemoData` apaga **só** esses ids (exceção deliberada ao append-only, restrita a dados sintéticos).
- A rota não tem link na home e não entra no pré-cache. Em produção dá 404 (`src/lib/dev-flags.ts`), salvo `ENABLE_DEV_SEED=true` (só em `.env.local` de homologação, nunca na Vercel).
- No `fake-indexeddb`, apagar milhares de linhas é muito lento: nos testes use `maxMatches`.

## Regras do Next.js (geradas pelo create-next-app)
@AGENTS.md
