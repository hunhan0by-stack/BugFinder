import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GET as healthGet } from "@/app/api/health/route";
import { GET, POST } from "@/app/api/scan/route";
import { resetRuntimeConfigCache } from "@/lib/config/runtime-config";
import { resetScannerConfigCache } from "@/lib/config/scanner-config";
import { resetScanHttpRateLimiter } from "@/lib/security/http-rate-limiter";
import { scanLimiter } from "@/lib/scanner/scan-limiter";

const OPTIONS = {
  consoleErrors: true,
  networkErrors: false,
  brokenImages: false,
  mobileLayout: false,
  accessibility: false,
  screenshots: false,
  safeInteractions: false,
  issueEvidence: false,
  reversibleWorkflows: false,
};

function scanRequest(body: BodyInit | null, init?: RequestInit): Request {
  return new Request("http://127.0.0.1/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body,
    ...init,
  });
}

describe("scan API hardening", () => {
  beforeEach(() => {
    process.env.SCAN_RATE_LIMIT_MAX_REQUESTS = "5";
    process.env.SCAN_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.SCAN_RATE_LIMIT_MAX_KEYS = "50";
    process.env.SCAN_MAX_REQUEST_BODY_BYTES = "16384";
    resetRuntimeConfigCache();
    resetScannerConfigCache();
    resetScanHttpRateLimiter();
    scanLimiter.reset();
  });

  afterEach(() => {
    resetScanHttpRateLimiter();
    scanLimiter.reset();
    resetRuntimeConfigCache();
    resetScannerConfigCache();
    delete process.env.SCAN_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.SCAN_RATE_LIMIT_WINDOW_MS;
    delete process.env.SCAN_RATE_LIMIT_MAX_KEYS;
    delete process.env.SCAN_MAX_REQUEST_BODY_BYTES;
  });

  it("rejects GET and other methods without scanning", async () => {
    const getResponse = await GET();
    assert.equal(getResponse.status, 405);
    const body = (await getResponse.json()) as { code?: string };
    assert.equal(body.code, "METHOD_NOT_ALLOWED");
  });

  it("rejects empty and malformed JSON", async () => {
    const empty = await POST(scanRequest(""));
    assert.equal(empty.status, 400);
    const malformed = await POST(scanRequest("{"));
    assert.equal(malformed.status, 400);
    const malformedBody = (await malformed.json()) as { code?: string };
    assert.equal(malformedBody.code, "INVALID_JSON");
  });

  it("rejects oversized JSON before scanning", async () => {
    const oversized = "x".repeat(20_000);
    const response = await POST(
      scanRequest(`{"url":"https://example.com","options":${JSON.stringify(OPTIONS)},"pad":"${oversized}"}`),
    );
    assert.equal(response.status, 413);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "PAYLOAD_TOO_LARGE");
  });

  it("rejects unknown fields and wrong types", async () => {
    const unknown = await POST(
      scanRequest(
        JSON.stringify({
          url: "https://example.com",
          options: OPTIONS,
          extra: true,
        }),
      ),
    );
    assert.equal(unknown.status, 400);
    const wrongType = await POST(
      scanRequest(JSON.stringify({ url: 123, options: OPTIONS })),
    );
    assert.equal(wrongType.status, 400);
  });

  it("rejects missing options", async () => {
    const response = await POST(
      scanRequest(JSON.stringify({ url: "https://example.com" })),
    );
    assert.equal(response.status, 400);
  });

  it("rejects localhost and private targets without contacting them", async () => {
    const localhost = await POST(
      scanRequest(
        JSON.stringify({ url: "http://localhost", options: OPTIONS }),
      ),
    );
    assert.equal(localhost.status, 403);
    const loopback = await POST(
      scanRequest(
        JSON.stringify({ url: "http://127.0.0.1", options: OPTIONS }),
      ),
    );
    assert.equal(loopback.status, 403);
    const privateIp = await POST(
      scanRequest(
        JSON.stringify({ url: "http://192.168.1.10", options: OPTIONS }),
      ),
    );
    assert.equal(privateIp.status, 403);
  });

  it("rate-limits excessive scan requests and sets Retry-After", async () => {
    process.env.SCAN_RATE_LIMIT_MAX_REQUESTS = "2";
    resetRuntimeConfigCache();
    resetScanHttpRateLimiter();
    const payload = JSON.stringify({ url: "not-a-url", options: OPTIONS });
    const first = await POST(scanRequest(payload));
    const second = await POST(scanRequest(payload));
    const third = await POST(scanRequest(payload));
    assert.equal(first.status, 400);
    assert.equal(second.status, 400);
    assert.equal(third.status, 429);
    const body = (await third.json()) as { code?: string; error?: string };
    assert.equal(body.code, "RATE_LIMITED");
    assert.equal(typeof body.error, "string");
    assert.equal(body.error?.includes("stack"), false);
    assert.ok(third.headers.get("Retry-After"));
    assert.equal(scanLimiter.getActiveCount(), 0);
  });

  it("does not rate-limit the health endpoint", async () => {
    process.env.SCAN_RATE_LIMIT_MAX_REQUESTS = "1";
    resetRuntimeConfigCache();
    resetScanHttpRateLimiter();
    await POST(scanRequest("{"));
    await POST(scanRequest("{"));
    const health = await healthGet();
    assert.equal(health.status, 200);
  });
});
