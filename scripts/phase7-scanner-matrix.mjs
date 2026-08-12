/**
 * Phase 7 scanner matrix using the local fixture only (no public websites).
 * Runs runBasicScan directly — does not require a Next.js server.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

process.env.NODE_ENV = "test";
process.env.ALLOW_LOCAL_FIXTURE = "true";
process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
process.env.LOCAL_FIXTURE_PORT = "3100";
process.env.SCAN_STABILIZATION_MS = "100";
process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "200";
process.env.SCAN_PAGE_TIMEOUT_MS = "8000";
process.env.SCAN_TOTAL_TIMEOUT_MS = "90000";
process.env.SCAN_MAX_CONCURRENT_SCANS = "1";
process.env.SCAN_INTERACTION_SETTLE_MS = "400";
process.env.SCAN_INTERACTION_PRECLICK_QUIET_MS = "100";
process.env.SCAN_MAX_SAFE_CLICKS = "5";

const { resetScannerConfigCache } = await import(
  pathToFileURL(
    path.join(process.cwd(), "lib/config/scanner-config.ts"),
  ).href
);
const { runBasicScan } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/scanner/basic-scan.ts")).href
);
const { scanLimiter } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/scanner/scan-limiter.ts")).href
);

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

resetScannerConfigCache();
scanLimiter.reset();
const fixture = await startLocalFixtureServer(3100);
process.env.LOCAL_FIXTURE_PORT = String(fixture.port);
resetScannerConfigCache();

const opts = (partial) => ({
  consoleErrors: false,
  networkErrors: false,
  brokenImages: false,
  mobileLayout: false,
  accessibility: false,
  screenshots: false,
  safeInteractions: false,
  ...partial,
});

try {
  await check("safeInteractions=false is NOT_REQUESTED", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/safe-toggle`,
      options: opts({}),
    });
    assert.equal(
      result.diagnostics.capabilities.safeInteractions,
      "NOT_REQUESTED",
    );
    assert.equal(result.safeInteractionAnalysis.actualClickCount, 0);
  });

  await check("safe toggle is responsive with no issues", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/safe-toggle`,
      options: opts({ safeInteractions: true }),
    });
    assert.equal(result.safeInteractionAnalysis.status, "COMPLETE");
    assert.ok(result.safeInteractionAnalysis.actualClickCount >= 1);
    assert.ok(result.safeInteractionAnalysis.responsiveControlCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("dead-click fixture produces DEAD_CLICK", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/dead-click`,
      options: opts({ safeInteractions: true }),
    });
    assert.ok(
      result.diagnostics.issues.some((issue) => issue.type === "DEAD_CLICK"),
    );
    assert.equal(JSON.stringify(result).includes("No handler"), false);
  });

  await check("obstructed button produces OBSTRUCTED_CONTROL only", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/obstructed-button`,
      options: opts({ safeInteractions: true }),
    });
    assert.ok(
      result.diagnostics.issues.some(
        (issue) => issue.type === "OBSTRUCTED_CONTROL",
      ),
    );
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("network click is skipped without DEAD_CLICK", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/network-click`,
      options: opts({ safeInteractions: true }),
    });
    assert.ok(result.safeInteractionAnalysis.skippedNetworkCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("persistent busy produces FORM_STATE_ISSUE", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/persistent-busy`,
      options: opts({ safeInteractions: true }),
    });
    const busy = result.diagnostics.issues.filter(
      (issue) => issue.type === "FORM_STATE_ISSUE",
    );
    assert.ok(busy.length >= 1);
    assert.equal(busy[0]?.metadata.subtype, "PERSISTENT_BUSY_STATE");
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("safeInteractions-only leaves other capabilities NOT_REQUESTED", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/safe-toggle`,
      options: opts({ safeInteractions: true }),
    });
    assert.equal(result.diagnostics.capabilities.console, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.network, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.brokenImages, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.mobileLayout, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.accessibility, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.safeInteractions, "COMPLETE");
    assert.equal(result.screenshot.available, false);
  });

  await check("cleanup releases limiter after interaction scan", async () => {
    assert.equal(scanLimiter.getActiveCount(), 0);
  });
} finally {
  await fixture.close();
  scanLimiter.reset();
  resetScannerConfigCache();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
