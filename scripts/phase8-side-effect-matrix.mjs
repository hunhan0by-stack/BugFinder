/**
 * Phase 8 side-effect prevention matrix.
 * Verifies reversible second-click network/navigation never hits fixture counters.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

process.env.NODE_ENV = "test";
process.env.ALLOW_LOCAL_FIXTURE = "true";
process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
process.env.LOCAL_FIXTURE_PORT = "3111";
process.env.SCAN_STABILIZATION_MS = "100";
process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "200";
process.env.SCAN_PAGE_TIMEOUT_MS = "8000";
process.env.SCAN_TOTAL_TIMEOUT_MS = "90000";
process.env.SCAN_MAX_CONCURRENT_SCANS = "1";
process.env.SCAN_INTERACTION_SETTLE_MS = "400";
process.env.SCAN_INTERACTION_PRECLICK_QUIET_MS = "100";
process.env.SCAN_WORKFLOW_SETTLE_MS = "400";
process.env.SCAN_MAX_SAFE_CLICKS = "8";
process.env.SCAN_MAX_REVERSIBLE_WORKFLOWS = "5";

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
const fixture = await startLocalFixtureServer(3111);
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
  issueEvidence: false,
  reversibleWorkflows: true,
};

try {
  await check("second-network workflow does not mutate fixture", async () => {
    const beforeMutation = fixture.counters.interactionMutation;
    const beforeGet = fixture.counters.interactionGet;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/second-network`,
      options: opts,
    });
    assert.equal(fixture.counters.interactionMutation, beforeMutation);
    assert.equal(fixture.counters.interactionGet, beforeGet);
    assert.ok(result.reversibleWorkflowAnalysis.skippedNetworkCount >= 1);
  });

  await check("second-navigation workflow does not mutate fixture", async () => {
    const beforeMutation = fixture.counters.interactionMutation;
    const beforeGet = fixture.counters.interactionGet;
    const beforeSubmit = fixture.counters.formSubmit;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/second-navigation`,
      options: opts,
    });
    assert.equal(fixture.counters.interactionMutation, beforeMutation);
    assert.equal(fixture.counters.interactionGet, beforeGet);
    assert.equal(fixture.counters.formSubmit, beforeSubmit);
    assert.ok(
      result.reversibleWorkflowAnalysis.skippedNavigationCount >= 1 ||
        result.reversibleWorkflowAnalysis.skippedNetworkCount >= 1 ||
        result.reversibleWorkflowAnalysis.skippedUnstableCount >= 1,
    );
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
