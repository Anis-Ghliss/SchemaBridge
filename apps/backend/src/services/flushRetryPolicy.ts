export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000
};

/** Exponential backoff: base * 2^(attempt-1), capped at maxDelayMs. */
export function nextDelayMs(policy: RetryPolicy, attempt: number): number {
  const delay = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}
