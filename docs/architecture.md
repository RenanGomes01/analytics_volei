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
