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

## UI de scout (`src/features/scout/`)
- **Tela = f(ledger):** `use-match-data.ts` faz `useLiveQuery` → `replayMatch` → `nextAction`. Placar, rali, posse e sugestões nunca viram estado React.
- O único estado de UI é a seleção efêmera (`scout-ui-reducer.ts`: idle → armed → saving). Ele volta para idle sempre que o tamanho do ledger muda.
- O ponto sai da qualidade do lance (`domain/rally/implied-point.ts`): `#` em saque, ataque ou bloqueio e `=` em qualquer fundamento. Os botões Ponto A/B são só para faltas sem lance.
- A inferência destaca a equipe esperada, mas só bloqueia o que é fisicamente impossível. O analista precisa conseguir registrar o que viu, inclusive um 4º toque.
- Tela de scout: `h-dvh overflow-hidden`, sem scroll; alvos de toque com no mínimo 48px (botões principais com 64px).
- **Toda interface em PT-BR**, inclusive siglas e motivos de ponto (ex.: "Virada de bola", "Quebra de saque", "Bola de graça", "PA"). Identificadores no código continuam em inglês.
- `qualityOptions(modality, skill)` (`quality-hints.ts`) é a fonte de **quais botões de qualidade aparecem** e das dicas embaixo deles (até 20 caracteres), separadas por beach e indoor. Exemplos: recepção do beach com 4 botões; falta só com `=`. Tudo documentado em `docs/business_rules.md`. Ao mudar a regra de fim de rali, atualize os três: `implied-point.ts`, `quality-hints.ts` e o doc.
- `nextAction()` segue a bola: a **qualidade** pode indicar que ela cruzou a rede (`ballCrossed`: passe/defesa/levantamento `/`, bloqueio `-`/`/`). Use a linguagem da areia no beach (ver `labels.ts`: `SKILL_PROMPT`, `SPECIAL_SKILLS`).

## Estatísticas (`src/domain/stats/` + `src/features/stats/`)
- As estatísticas partem de `replayMatch(...).rallies`, nunca do ledger cru. Assim usam as mesmas anulações, sets, sacador e resultado de rali do placar.
- Invariante testada: os pontos da equipe (kills + aces + bloqueios + erros do adversário) são sempre iguais ao placar. Os testes de invariantes usam ledgers aleatórios com semente fixa.
- Toda divisão passa por `rate()` / `efficiency()` (`rate.ts`): denominador 0 vira `null` e aparece como "–".
- Definições: ataque bloqueado (próximo toque é bloqueio `#` do adversário) é erro do atacante; ponto de ataque e de bloqueio exigem `#` **e** o rali ganho; ace = rali com motivo `ace` (saque `#` ou recepção `=` logo após o saque) creditado à sacadora; "erros do adversário" = `error` + `four_touches` + `manual`.
- A UI (`StatsSheet`) usa os `events` do mesmo `useLiveQuery` da tela de scout: não abra outra consulta ao banco.

## Exportação e sync (Fase 4)
- **Exportação:** `exportMatch()` (`src/services/export/`) gera o envelope `volei-scout/match-export` v1 com o ledger completo (inclusive VoidEvents), um hash SHA-256 do JSON canônico de `data` e uma assinatura ECDSA P-256 da chave **não-extraível** do aparelho (fica na `meta`). Mudou o formato de forma incompatível? Suba `EXPORT_SCHEMA_VERSION` e mantenha `verifyMatchExport` lendo as versões antigas.
- **Outbox:** o sync só altera a tabela `outbox`, nunca `rally_events`. Envio FIFO por `created_at` (monotônico no `enqueue`), parando no primeiro retry; backoff em `src/services/sync/backoff.ts`; lease de 2 min para entradas presas em `sent`.
- **Transporte:** a interface é `SyncTransport` (`src/services/sync/transport.ts`); hoje só existe o `MockTransport`. Um back-end real entra como outro transporte, sem mexer no motor. É obrigatório ser idempotente por `mutation_id`.
- **Versão nova do PWA:** o SW usa skipWaiting + clientsClaim, então abas abertas passam a ter código antigo sob um SW novo. `src/features/update/` detecta isso (`controllerchange`), mostra o banner "Nova versão disponível" e **pausa o SyncAgent** naquela aba até recarregar. Nunca recarregue automaticamente: `reloadOnOnline` fica desligado no `SerwistProvider`.
- `NEXT_PUBLIC_SYNC_MODE` = `off` (padrão) ou `mock` (ver `.env.example`). O `SyncAgent` (no layout) nunca bloqueia a UI, e o status aparece só no `SyncBadge`, nunca na tela de scout.
- Mudança de schema do IndexedDB = nova `version(n)` no `ScoutDB` com `upgrade()` e teste de migração (ver `tests/services/sync.test.ts`).

## Regras do Next.js (geradas pelo create-next-app)
@AGENTS.md
