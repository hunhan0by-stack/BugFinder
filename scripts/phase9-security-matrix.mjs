/**
 * Phase 9 production-hardening matrix.
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-alias.mjs scripts/phase9-security-matrix.mjs
 */
import assert from "node:assert/strict";
import { classifyIpAddress } from "../lib/security/ip-policy.ts";
import { evaluateHostname } from "../lib/security/hostname-policy.ts";
import { evaluatePort } from "../lib/security/port-policy.ts";
import { GET, POST } from "../app/api/scan/route.ts";
import { GET as healthGet } from "../app/api/health/route.ts";
import { serveScanPng } from "../lib/scanner/serve-scan-png.ts";
import { logScanEvent, resetScanLogSink, setScanLogSink } from "../lib/observability/scan-logger.ts";
import { resetScanHttpRateLimiter } from "../lib/security/http-rate-limiter.ts";
import { resetRuntimeConfigCache } from "../lib/config/runtime-config.ts";
import { resetScannerConfigCache, isLocalFixtureAllowed, getScannerConfig } from "../lib/config/scanner-config.ts";
import { scanLimiter } from "../lib/scanner/scan-limiter.ts";

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

const config = {
  allowLocalFixture: false,
  localFixtureHost: "127.0.0.1",
  localFixturePort: 3100,
  allowedPorts: [80, 443],
};

const results = [];

async function check(label, fn) {
  try {
    await fn();
    results.push({ label, ok: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error: String(error) });
    console.log(`FAIL ${label}: ${error}`);
  }
}

function scanRequest(body) {
  return new Request("http://127.0.0.1/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

await check("HTTP GET does not scan", async () => {
  const response = await GET();
  assert.equal(response.status, 405);
});

await check("malformed payload rejected", async () => {
  const response = await POST(scanRequest("{"));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "INVALID_JSON");
  assert.equal(JSON.stringify(body).includes("stack"), false);
});

await check("oversized body rejected", async () => {
  const pad = "x".repeat(20_000);
  const response = await POST(
    scanRequest(`{"url":"https://example.com","options":${JSON.stringify(OPTIONS)},"pad":"${pad}"}`),
  );
  assert.equal(response.status, 413);
});

process.env.SCAN_RATE_LIMIT_MAX_REQUESTS = "2";
resetRuntimeConfigCache();
resetScanHttpRateLimiter();
await check("rate limiting returns 429", async () => {
  const payload = JSON.stringify({ url: "bad", options: OPTIONS });
  await POST(scanRequest(payload));
  await POST(scanRequest(payload));
  const third = await POST(scanRequest(payload));
  assert.equal(third.status, 429);
  assert.ok(third.headers.get("Retry-After"));
  assert.equal(scanLimiter.getActiveCount(), 0);
});
delete process.env.SCAN_RATE_LIMIT_MAX_REQUESTS;
resetRuntimeConfigCache();
resetScanHttpRateLimiter();

await check("localhost rejected", async () => {
  const response = await POST(
    scanRequest(JSON.stringify({ url: "http://localhost", options: OPTIONS })),
  );
  assert.equal(response.status, 403);
});

await check("private IPv4 rejected", async () => {
  assert.equal(classifyIpAddress("10.0.0.5").ok, false);
  const response = await POST(
    scanRequest(JSON.stringify({ url: "http://192.168.0.5", options: OPTIONS })),
  );
  assert.equal(response.status, 403);
});

await check("IPv6 loopback rejected", async () => {
  assert.equal(classifyIpAddress("::1").ok, false);
});

await check("metadata address rejected", async () => {
  assert.equal(classifyIpAddress("169.254.169.254").ok, false);
});

await check("mixed DNS private answer is blocked by IP policy", async () => {
  assert.equal(classifyIpAddress("127.0.0.1").ok, false);
});

await check("port policy rejects 3000", async () => {
  assert.equal(evaluatePort("http:", "3000", "example.com", config).ok, false);
});

await check("hostname localhost blocked", async () => {
  assert.equal(evaluateHostname("localhost", config).ok, false);
});

await check("fixture disabled in production", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    resetScannerConfigCache();
    const loaded = getScannerConfig({
      ...process.env,
      NODE_ENV: "production",
      ALLOW_LOCAL_FIXTURE: "false",
    });
    assert.equal(isLocalFixtureAllowed(loaded), false);
  } finally {
    process.env.NODE_ENV = previous;
    resetScannerConfigCache();
  }
});

await check("artifact path traversal rejected", async () => {
  const response = await serveScanPng({
    scanId: "../etc",
    filename: "desktop.png",
    kind: "screenshot",
  });
  assert.equal(response.status, 404);
});

await check("log secret redaction", async () => {
  const lines = [];
  setScanLogSink((line) => lines.push(line));
  logScanEvent({
    level: "info",
    event: "scan.started",
    target: "https://example.com/?secret=PHASE9_SECRET_QUERY",
  });
  resetScanLogSink();
  assert.equal(lines.join("").includes("PHASE9_SECRET_QUERY"), false);
});

await check("health endpoint safety", async () => {
  const response = await healthGet();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal("token" in body, false);
  assert.equal("secret" in body, false);
});

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
