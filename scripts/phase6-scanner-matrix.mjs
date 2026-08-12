/**
 * Phase 6 scanner matrix using the local fixture only (no public websites).
 * Runs runBasicScan directly — does not require a Next.js server.
 */
import assert from "node:assert/strict";
import { access, rm, stat } from "node:fs/promises";
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
process.env.SCAN_TOTAL_TIMEOUT_MS = "45000";
process.env.SCAN_MAX_CONCURRENT_SCANS = "1";

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
  issueEvidence: false,
  reversibleWorkflows: false,
  ...partial,
});

try {
  await check("clean Phase 6 diagnostics", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase6-clean`,
      options: opts({
        brokenImages: true,
        mobileLayout: true,
        accessibility: true,
      }),
    });
    assert.equal(result.mode, "BASIC_SCAN");
    assert.equal(result.brokenImageAnalysis.status, "COMPLETE");
    assert.equal(result.mobileLayoutAnalysis.status, "COMPLETE");
    assert.equal(result.accessibilityAnalysis.status, "COMPLETE");
    assert.equal(result.diagnostics.typeSummary.brokenImages, 0);
    assert.equal(result.diagnostics.typeSummary.mobileLayoutIssues, 0);
    assert.equal(result.diagnostics.typeSummary.accessibilityViolations, 0);
  });

  await check("broken image DESKTOP issue", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/broken-image`,
      options: opts({ brokenImages: true, networkErrors: true }),
    });
    const broken = result.diagnostics.issues.filter(
      (issue) => issue.type === "BROKEN_IMAGE",
    );
    assert.equal(broken.length, 1);
    assert.equal(broken[0].profile, "DESKTOP");
  });

  await check("duplicate broken image grouping", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/broken-image-dup`,
      options: opts({ brokenImages: true }),
    });
    const broken = result.diagnostics.issues.filter(
      (issue) => issue.type === "BROKEN_IMAGE",
    );
    assert.equal(broken.length, 1);
    assert.equal(broken[0].occurrenceCount, 3);
  });

  await check("mobile overflow MOBILE profile", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/mobile-overflow`,
      options: opts({ mobileLayout: true }),
    });
    assert.ok(
      result.diagnostics.issues.some(
        (issue) =>
          issue.type === "MOBILE_OVERFLOW" && issue.profile === "MOBILE",
      ),
    );
  });

  await check("missing viewport", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/mobile-missing-viewport`,
      options: opts({ mobileLayout: true }),
    });
    assert.ok(
      result.diagnostics.issues.some((issue) => issue.type === "MOBILE_VIEWPORT"),
    );
  });

  await check("accessibility violations without HTML", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/a11y-violations`,
      options: opts({ accessibility: true }),
    });
    assert.ok(
      result.diagnostics.issues.some(
        (issue) => issue.type === "ACCESSIBILITY_VIOLATION",
      ),
    );
    assert.equal(JSON.stringify(result).includes("<button"), false);
  });

  await check("desktop and mobile screenshots", async () => {
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/phase6-clean`,
      options: opts({ screenshots: true }),
    });
    assert.equal(result.screenshot.available, true);
    assert.equal(result.mobileScreenshot.available, true);
    assert.equal(result.diagnostics.capabilities.mobileLayout, "NOT_REQUESTED");
    await access(
      path.join(process.cwd(), "public", "scan-results", scanId, "desktop.png"),
    );
    await access(
      path.join(process.cwd(), "public", "scan-results", scanId, "mobile.png"),
    );
    const desktop = await stat(
      path.join(process.cwd(), "public", "scan-results", scanId, "desktop.png"),
    );
    const mobile = await stat(
      path.join(process.cwd(), "public", "scan-results", scanId, "mobile.png"),
    );
    assert.ok(desktop.size > 0);
    assert.ok(mobile.size > 0);
    await rm(path.join(process.cwd(), "public", "scan-results", scanId), {
      recursive: true,
      force: true,
    });
  });

  await check("security-blocked image is not BROKEN_IMAGE", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/blocked-subresource`,
      options: opts({ brokenImages: true, networkErrors: true }),
    });
    assert.ok(result.security.blockedRequestCount > 0);
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "BROKEN_IMAGE")
        .length,
      0,
    );
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
