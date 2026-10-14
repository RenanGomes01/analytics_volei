/** Chaves da tabela `meta` usadas pelo sync com a nuvem (Fase 8). */
export const LAST_SUCCESS_KEY = "sync:last_success_at";
export const PULL_CURSOR_KEY = "sync:pull_cursor";
export const LAST_PULL_KEY = "sync:last_pull_at";
/** Lista de divergências vistas no pull: `{ entity, entity_id, match_id?, reason }`. */
export const PULL_CONFLICTS_KEY = "sync:pull_conflicts";
/** `user.id` da conta para a qual este aparelho envia o outbox. */
export const ACCOUNT_KEY = "sync:account";
/** Por que o sync com a nuvem está parado (sem conta, vínculo pendente…), ou ausente. */
export const BLOCKED_KEY = "sync:blocked";
/** Erro do último pull, ou ausente. */
export const PULL_ERROR_KEY = "sync:pull_error";
