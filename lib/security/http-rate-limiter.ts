import "server-only";

import { getRuntimeConfig } from "@/lib/config/runtime-config";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type RateLimitBucket = {
  count: number;
  windowStartMs: number;
  lastSeenMs: number;
};

const UNKNOWN_CLIENT_KEY = "unknown";
const MAX_CLIENT_KEY_LENGTH = 64;
const SAFE_CLIENT_KEY = /^[a-z0-9.:]+$/;

export function normalizeClientKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    return UNKNOWN_CLIENT_KEY;
  }
  const normalized = raw.trim().toLowerCase().slice(0, MAX_CLIENT_KEY_LENGTH);
  if (normalized === "" || !SAFE_CLIENT_KEY.test(normalized)) {
    return UNKNOWN_CLIENT_KEY;
  }
  return normalized;
}

/**
 * Client identity for rate limiting. User-controlled forwarding headers are
 * ignored unless SCAN_TRUST_PROXY is explicitly enabled and the reverse proxy
 * overwrites untrusted incoming values.
 */
export function clientKeyFromRequest(
  request: Request,
  trustProxy: boolean,
): string {
  if (!trustProxy) {
    return UNKNOWN_CLIENT_KEY;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return UNKNOWN_CLIENT_KEY;
  }
  const firstHop = forwarded.split(",")[0];
  return normalizeClientKey(firstHop);
}

/**
 * Fixed-window limiter with a hard cap on stored keys. This is in-process
 * only and does not coordinate across multiple application instances.
 */
export class BoundedHttpRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastCleanupMs = 0;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxKeys: number;
  private readonly nowFn: () => number;

  constructor(options: {
    windowMs: number;
    maxRequests: number;
    maxKeys: number;
    now?: () => number;
  }) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.maxKeys = options.maxKeys;
    this.nowFn = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.buckets.size;
  }

  reset(): void {
    this.buckets.clear();
    this.lastCleanupMs = 0;
  }

  check(rawClientKey: string): RateLimitDecision {
    const now = this.nowFn();
    this.cleanupExpired(now);
    const key = normalizeClientKey(rawClientKey);

    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartMs >= this.windowMs) {
      if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
        this.evictExpiredThenOldest(now);
      }
      if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
        return {
          allowed: false,
          retryAfterSeconds: this.retryAfterSeconds(now, now),
        };
      }
      bucket = { count: 0, windowStartMs: now, lastSeenMs: now };
      this.buckets.set(key, bucket);
    }

    bucket.lastSeenMs = now;
    if (bucket.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: this.retryAfterSeconds(now, bucket.windowStartMs),
      };
    }

    bucket.count += 1;
    return { allowed: true };
  }

  private retryAfterSeconds(now: number, windowStartMs: number): number {
    const remainingMs = Math.max(1_000, this.windowMs - (now - windowStartMs));
    return Math.max(1, Math.ceil(remainingMs / 1_000));
  }

  private cleanupExpired(now: number): void {
    if (now - this.lastCleanupMs < 1_000) {
      return;
    }
    this.lastCleanupMs = now;
    this.evictExpiredThenOldest(now, true);
  }

  private evictExpiredThenOldest(now: number, expiredOnly = false): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartMs >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
    if (expiredOnly || this.buckets.size < this.maxKeys) {
      return;
    }
    let oldestKey: string | null = null;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastSeenMs < oldestSeen) {
        oldestSeen = bucket.lastSeenMs;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }
}

let sharedLimiter: BoundedHttpRateLimiter | null = null;

export function getScanHttpRateLimiter(): BoundedHttpRateLimiter {
  if (!sharedLimiter) {
    const config = getRuntimeConfig();
    sharedLimiter = new BoundedHttpRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      maxKeys: config.rateLimitMaxKeys,
    });
  }
  return sharedLimiter;
}

export function resetScanHttpRateLimiter(): void {
  sharedLimiter?.reset();
  sharedLimiter = null;
}
