/**
 * Phase 8 scanner matrix using the local fixture only (no public websites).
 * Runs runBasicScan directly — does not require a Next.js server.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

process.env.NODE_ENV = "test";
process.env.ALLOW_LOCAL_FIXTURE = "true";
process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
process.env.LOCAL_FIXTURE_PORT = "3110";
process.env.SCAN_STABILIZATION_MS = "100";
process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "200";
process.env.SCAN_PAGE_TIMEOUT_MS = "8000";
process.env.SCAN_TOTAL_TIMEOUT_MS = "120000";
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
const fixture = await startLocalFixtureServer(3110);
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
  issueEvidence: false,
  reversibleWorkflows: false,
  ...partial,
});

try {
  await check("reversible checkbox succeeds without STATE_TRANSITION", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/reversible-checkbox`,
      options: opts({ reversibleWorkflows: true, safeInteractions: true }),
    });
    assert.ok(result.reversibleWorkflowAnalysis.successfulReversalCount >= 1);
    assert.equal(
      result.diagnostics.issues.some(
        (issue) => issue.type === "STATE_TRANSITION_ISSUE",
      ),
      false,
    );
  });

  await check("failed reversal produces STATE_TRANSITION_ISSUE", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/failed-reversal`,
      options: opts({ reversibleWorkflows: true, safeInteractions: true }),
    });
    assert.ok(
      result.diagnostics.issues.some(
        (issue) =>
          issue.type === "STATE_TRANSITION_ISSUE" &&
          issue.metadata.subtype === "FAILED_TO_RETURN_TO_BASELINE",
      ),
    );
  });

  await check("second network keeps counters 0 and skips failed-return", async () => {
    const before = fixture.counters.interactionMutation;
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/second-network`,
      options: opts({ reversibleWorkflows: true, safeInteractions: true }),
    });
    assert.equal(fixture.counters.interactionMutation, before);
    assert.ok(result.reversibleWorkflowAnalysis.skippedNetworkCount >= 1);
    assert.equal(
      result.diagnostics.issues.some(
        (issue) =>
          issue.type === "STATE_TRANSITION_ISSUE" &&
          issue.metadata.subtype === "FAILED_TO_RETURN_TO_BASELINE",
      ),
      false,
    );
  });

  await check("issueEvidence on obstructed captures artifacts", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/obstructed`,
      options: opts({
        safeInteractions: true,
        issueEvidence: true,
      }),
    });
    assert.ok(result.issueEvidenceAnalysis.artifactCount > 0);
    const obstructed = result.diagnostics.issues.find(
      (issue) => issue.type === "OBSTRUCTED_CONTROL",
    );
    assert.ok(obstructed);
    assert.ok(Array.isArray(obstructed.evidenceIds));
    assert.ok(obstructed.evidenceIds.length > 0);
  });

  await check("dead-click evidence includes before/after when enabled", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/dead-click`,
      options: opts({
        safeInteractions: true,
        issueEvidence: true,
      }),
    });
    const dead = result.diagnostics.issues.find(
      (issue) => issue.type === "DEAD_CLICK",
    );
    assert.ok(dead);
    assert.ok(Array.isArray(dead.evidenceIds));
    assert.ok(dead.evidenceIds.length >= 2);
    const kinds = new Set(
      result.issueEvidenceAnalysis.artifacts.map((artifact) => artifact.kind),
    );
    assert.equal(kinds.has("BEFORE_INTERACTION"), true);
    assert.equal(kinds.has("AFTER_INTERACTION"), true);
  });

  await check("issueEvidence=false yields artifactCount 0", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/dead-click`,
      options: opts({
        safeInteractions: true,
        issueEvidence: false,
      }),
    });
    assert.equal(result.issueEvidenceAnalysis.artifactCount, 0);
    assert.equal(result.issueEvidenceAnalysis.status, "NOT_REQUESTED");
  });

  await check("reversibleWorkflows=false is NOT_REQUESTED", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/reversible-checkbox`,
      options: opts({
        safeInteractions: true,
        reversibleWorkflows: false,
      }),
    });
    assert.equal(result.reversibleWorkflowAnalysis.status, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.reversibleWorkflows, "NOT_REQUESTED");
  });

  await check("workflow flood respects SCAN_MAX_REVERSIBLE_WORKFLOWS", async () => {
    process.env.SCAN_MAX_REVERSIBLE_WORKFLOWS = "2";
    resetScannerConfigCache();
    try {
      const result = await runBasicScan({
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/phase8/workflow-flood`,
        options: opts({
          reversibleWorkflows: true,
          safeInteractions: true,
        }),
      });
      assert.equal(result.reversibleWorkflowAnalysis.status, "PARTIAL");
      assert.equal(result.reversibleWorkflowAnalysis.workflowLimitReached, true);
      assert.ok(result.reversibleWorkflowAnalysis.attemptedWorkflowCount <= 2);
    } finally {
      process.env.SCAN_MAX_REVERSIBLE_WORKFLOWS = "5";
      resetScannerConfigCache();
    }
  });

  await check("secret privacy strings never appear in scan JSON", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/secret-privacy?secret=PHASE8_QUERY_SECRET`,
      options: opts({
        safeInteractions: true,
        reversibleWorkflows: true,
        issueEvidence: true,
      }),
    });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("PHASE8_SECRET_BUTTON_TEXT"), false);
    assert.equal(serialized.includes("PHASE8_SECRET_FORM_VALUE"), false);
    assert.equal(serialized.includes("PHASE8_PASSWORD_SECRET"), false);
    assert.equal(serialized.includes("PHASE8_QUERY_SECRET"), false);
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
