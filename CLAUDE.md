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

## Regras do Next.js (geradas pelo create-next-app)
@AGENTS.md
