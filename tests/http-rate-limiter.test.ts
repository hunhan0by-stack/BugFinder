import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  BoundedHttpRateLimiter,
  clientKeyFromRequest,
  normalizeClientKey,
} from "@/lib/security/http-rate-limiter";

describe("normalizeClientKey", () => {
  it("maps empty and malformed identifiers to unknown", () => {
    assert.equal(normalizeClientKey(null), "unknown");
    assert.equal(normalizeClientKey(""), "unknown");
    assert.equal(normalizeClientKey("  "), "unknown");
    assert.equal(normalizeClientKey("bad key"), "unknown");
    assert.equal(normalizeClientKey("evil\nheader"), "unknown");
    assert.equal(normalizeClientKey("127.0.0.1"), "127.0.0.1");
  });
});

describe("clientKeyFromRequest", () => {
  it("ignores forwarding headers unless the proxy is trusted", () => {
    const request = new Request("http://localhost/api/scan", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    assert.equal(clientKeyFromRequest(request, false), "unknown");
    assert.equal(clientKeyFromRequest(request, true), "203.0.113.10");
  });
});

describe("BoundedHttpRateLimiter", () => {
  let now = 1_000_000;
  let limiter: BoundedHttpRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new BoundedHttpRateLimiter({
      windowMs: 10_000,
      maxRequests: 3,
      maxKeys: 2,
      now: () => now,
    });
  });

  it("allows requests below the threshold", () => {
    assert.equal(limiter.check("10.0.0.1").allowed, true);
    assert.equal(limiter.check("10.0.0.1").allowed, true);
  });

  it("allows the request that reaches the threshold", () => {
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    const third = limiter.check("10.0.0.1");
    assert.equal(third.allowed, true);
  });

  it("returns 429 semantics and Retry-After over the threshold", () => {
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    const blocked = limiter.check("10.0.0.1");
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) {
      assert.ok(blocked.retryAfterSeconds >= 1);
    }
  });

  it("cleans stale buckets after the window", () => {
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    now += 11_000;
    const next = limiter.check("10.0.0.1");
    assert.equal(next.allowed, true);
    assert.equal(limiter.size, 1);
  });

  it("keeps the map bounded", () => {
    assert.equal(limiter.check("10.0.0.1").allowed, true);
    assert.equal(limiter.check("10.0.0.2").allowed, true);
    assert.equal(limiter.size, 2);
    limiter.check("10.0.0.3");
    assert.ok(limiter.size <= 2);
  });
});
