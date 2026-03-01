/**
 * Retry logic with exponential backoff for vision API calls.
 * Pattern ported from openscenesense-ollama (MIT) — handles transient errors
 * (429 rate limits, 5xx server errors, network failures) with jittered backoff.
 */

import type { VisionProviderAdapter, VisionRequest, VisionResponse } from "./types";

export interface RetryOpts {
  /** Maximum number of retry attempts (default 3) */
  maxRetries?: number;
  /** Initial backoff delay in ms (default 1000) */
  initialDelayMs?: number;
  /** Maximum backoff delay in ms (default 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default 2) */
  multiplier?: number;
  /** Jitter factor 0-1 (default 0.25) */
  jitter?: number;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/** Error types that are considered transient and worth retrying */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();

  // Rate limiting (429)
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return true;
  }

  // Server errors (5xx)
  if (/\b5\d{2}\b/.test(msg)) return true;

  // Network errors
  if (
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("fetch failed")
  ) {
    return true;
  }

  // Overloaded (Anthropic)
  if (msg.includes("overloaded")) return true;

  return false;
}

/** Compute delay with exponential backoff + jitter */
interface BackoffOpts {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: number;
}

function computeDelay(attempt: number, opts: BackoffOpts): number {
  const baseDelay = Math.min(
    opts.initialDelayMs * Math.pow(opts.multiplier, attempt),
    opts.maxDelayMs,
  );
  const jitterRange = baseDelay * opts.jitter;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(0, Math.round(baseDelay + jitter));
}

/** Parse Retry-After header value from error message if present */
function parseRetryAfter(err: Error): number | null {
  const match = err.message.match(/retry.?after[:\s]+(\d+)/i);
  if (match) return parseInt(match[1], 10) * 1000;
  return null;
}

/**
 * Execute an async function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOpts,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const initialDelayMs = opts?.initialDelayMs ?? 1000;
  const maxDelayMs = opts?.maxDelayMs ?? 30000;
  const multiplier = opts?.multiplier ?? 2;
  const jitter = opts?.jitter ?? 0.25;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry non-transient errors or on last attempt
      if (attempt >= maxRetries || !isTransientError(lastError)) {
        throw lastError;
      }

      // Compute delay — respect Retry-After header if present
      const retryAfter = parseRetryAfter(lastError);
      const delay = retryAfter ?? computeDelay(attempt, { initialDelayMs, maxDelayMs, multiplier, jitter });

      opts?.onRetry?.(attempt + 1, lastError, delay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Wrap a VisionProviderAdapter with automatic retry logic.
 * Returns a new adapter that transparently retries transient failures.
 */
export function withRetryProvider(
  provider: VisionProviderAdapter,
  retryOpts?: RetryOpts,
): VisionProviderAdapter {
  return {
    name: provider.name,
    model: provider.model,
    async analyze(req: VisionRequest): Promise<VisionResponse> {
      return withRetry(() => provider.analyze(req), retryOpts);
    },
  };
}
