export type SupabaseRetryContext = {
  operation: string;
  table?: string;
  source?: string;
  commander?: string;
  range?: string;
};

export type SupabaseRetryOptions = SupabaseRetryContext & {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryLabel(context: SupabaseRetryContext): string {
  return [
    context.operation,
    context.table ? `table=${context.table}` : null,
    context.source ? `source=${context.source}` : null,
    context.commander ? `commander=${context.commander}` : null,
    context.range ? `range=${context.range}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isTransientSupabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /fetch failed|network|timeout|timed out|terminated|econnreset|etimedout|socket|502|503|504/i.test(message);
}

export function supabaseBackoffDelayMs(attempt: number, baseDelayMs = 750, maxDelayMs = 8_000): number {
  const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.min(250, Math.max(25, Math.floor(exponential * 0.1)));
  return Math.min(maxDelayMs, exponential + jitter);
}

export async function withSupabaseRetry<T>(options: SupabaseRetryOptions, fn: () => Promise<T>): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const wait = options.sleep ?? sleep;
  const label = retryLabel(options);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) console.warn(`[external-meta] retry ${label} attempt=${attempt}/${attempts}`);
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = isTransientSupabaseError(error);
      console.warn(`[external-meta] failed ${label} attempt=${attempt}/${attempts} transient=${transient} reason=${message}`);
      if (!transient || attempt >= attempts) break;
      await wait(supabaseBackoffDelayMs(attempt, options.baseDelayMs, options.maxDelayMs));
    }
  }

  const finalMessage = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown_error");
  console.error(`[external-meta] gave_up ${label} attempts=${attempts} reason=${finalMessage}`);
  throw lastError instanceof Error ? lastError : new Error(finalMessage);
}
