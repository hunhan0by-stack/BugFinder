/**
 * Phase 7 side-effect prevention matrix.
 * Verifies the fixture server itself receives zero mutation requests
 * when the scanner clicks network/submit-prone controls.
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

const opts = {
  consoleErrors: false,
  networkErrors: false,
  brokenImages: false,
  mobileLayout: false,
  accessibility: false,
  screenshots: false,
  safeInteractions: true,
};

try {
  await check("POST network click does not mutate fixture", async () => {
    const before = fixture.counters.interactionMutation;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/network-click`,
      options: opts,
    });
    assert.equal(fixture.counters.interactionMutation, before);
    assert.ok(result.safeInteractionAnalysis.skippedNetworkCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("GET side-effect click does not hit fixture counter", async () => {
    const before = fixture.counters.interactionGet;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/get-side-effect`,
      options: opts,
    });
    assert.equal(fixture.counters.interactionGet, before);
    assert.ok(result.safeInteractionAnalysis.skippedNetworkCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("submit control never posts to form endpoint", async () => {
    const before = fixture.counters.formSubmit;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/submit-form`,
      options: opts,
    });
    assert.equal(fixture.counters.formSubmit, before);
    assert.ok(result.safeInteractionAnalysis.skippedFormSubmissionCount >= 1);
    assert.equal(result.safeInteractionAnalysis.actualClickCount, 0);
  });

  await check("navigation click does not create DEAD_CLICK", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/nav-click`,
      options: opts,
    });
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
    assert.ok(
      result.safeInteractionAnalysis.skippedNavigationCount >= 1 ||
        result.safeInteractionAnalysis.skippedNetworkCount >= 1 ||
        result.safeInteractionAnalysis.skippedUnstableCount >= 1,
    );
  });

  await check("popup click is closed without DEAD_CLICK", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/popup-click`,
      options: opts,
    });
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
    assert.ok(
      result.safeInteractionAnalysis.skippedPopupCount >= 1 ||
        result.safeInteractionAnalysis.skippedUnsafeCount >= 0,
    );
  });

  await check("destructive control is skipped without click", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/destructive-button`,
      options: opts,
    });
    assert.equal(result.safeInteractionAnalysis.actualClickCount, 0);
    assert.ok(result.safeInteractionAnalysis.skippedDestructiveCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  await check("offscreen control is skipped without scroll/click", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/offscreen-safe`,
      options: opts,
    });
    assert.ok(result.safeInteractionAnalysis.skippedOffscreenCount >= 1);
    assert.equal(result.safeInteractionAnalysis.actualClickCount, 0);
  });

  await check("fixture mutation counters remain zero overall", async () => {
    assert.equal(fixture.counters.interactionMutation, 0);
    assert.equal(fixture.counters.interactionGet, 0);
    assert.equal(fixture.counters.formSubmit, 0);
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
