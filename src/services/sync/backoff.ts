export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 10 * 60_000;

/**
 * Próxima tentativa após a `attempts`-ésima falha: 5s, 10s, 20s… até 10 min, com jitter de ±20%
 * para que vários tablets não voltem todos no mesmo instante. `now` e `random` são injetáveis.
 */
export function nextAttemptAt(attempts: number, now: number, random: () => number = Math.random): number {
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  const jitter = 0.8 + 0.4 * random();
  return now + Math.round(Math.min(BACKOFF_MAX_MS, exponential * jitter));
}
