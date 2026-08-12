/**
 * Phase 8 artifact + browser/context cleanup matrix.
 * Uses runBasicScan directly (no Next.js required).
 */
import assert from "node:assert/strict";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

process.env.NODE_ENV = "test";
process.env.ALLOW_LOCAL_FIXTURE = "true";
process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
process.env.LOCAL_FIXTURE_PORT = "3112";
process.env.SCAN_STABILIZATION_MS = "100";
process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "200";
process.env.SCAN_PAGE_TIMEOUT_MS = "8000";
process.env.SCAN_TOTAL_TIMEOUT_MS = "90000";
process.env.SCAN_MAX_CONCURRENT_SCANS = "1";
process.env.SCAN_INTERACTION_SETTLE_MS = "400";
process.env.SCAN_MAX_EVIDENCE_ARTIFACTS = "2";
process.env.SCAN_MAX_EVIDENCE_BYTES = "100000";
process.env.SCAN_MAX_EVIDENCE_PER_ISSUE = "2";

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
const { getScanDirectory } = await import(
  pathToFileURL(path.join(process.cwd(), "lib/scanner/scan-storage.ts")).href
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

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

resetScannerConfigCache();
scanLimiter.reset();
const fixture = await startLocalFixtureServer(3112);
process.env.LOCAL_FIXTURE_PORT = String(fixture.port);
resetScannerConfigCache();

const off = {
  consoleErrors: false,
  networkErrors: false,
  brokenImages: false,
  mobileLayout: false,
  accessibility: false,
  screenshots: false,
  safeInteractions: false,
  issueEvidence: false,
  reversibleWorkflows: false,
};

try {
  await check("successful evidence artifacts are PNG and referenced", async () => {
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/phase8/obstructed`,
      options: {
        ...off,
        safeInteractions: true,
        issueEvidence: true,
      },
    });
    assert.ok(result.issueEvidenceAnalysis.artifactCount > 0);
    const evidenceDir = path.join(getScanDirectory(scanId), "evidence");
    const files = await readdir(evidenceDir);
    assert.ok(files.every((name) => name.endsWith(".png")));
    assert.equal(files.some((name) => name.endsWith(".tmp")), false);
    for (const artifact of result.issueEvidenceAnalysis.artifacts) {
      assert.ok(result.diagnostics.issues.some((issue) =>
        (issue.evidenceIds ?? []).includes(artifact.id),
      ));
      const absolute = path.join(process.cwd(), "public", artifact.relativePath);
      assert.equal(await pathExists(absolute), true);
      const info = await stat(absolute);
      assert.ok(info.size > 0);
      assert.equal(artifact.publicUrl.startsWith("/scan-results/"), true);
      assert.equal(artifact.relativePath.includes(".."), false);
    }
  });

  await check("issueEvidence=false creates no evidence files", async () => {
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/phase8/obstructed`,
      options: {
        ...off,
        safeInteractions: true,
        issueEvidence: false,
      },
    });
    assert.equal(result.issueEvidenceAnalysis.artifactCount, 0);
    const evidenceDir = path.join(getScanDirectory(scanId), "evidence");
    assert.equal(await pathExists(evidenceDir), false);
  });

  await check("evidence count limit does not leave tmp files", async () => {
    process.env.SCAN_MAX_EVIDENCE_ARTIFACTS = "1";
    resetScannerConfigCache();
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/phase8/dead-click`,
      options: {
        ...off,
        safeInteractions: true,
        issueEvidence: true,
      },
    });
    assert.ok(result.issueEvidenceAnalysis.artifactCount <= 1);
    if (result.issueEvidenceAnalysis.artifactLimitReached) {
      assert.equal(result.issueEvidenceAnalysis.status, "PARTIAL");
    }
    const evidenceDir = path.join(getScanDirectory(scanId), "evidence");
    if (await pathExists(evidenceDir)) {
      const files = await readdir(evidenceDir);
      assert.equal(files.some((name) => name.includes(".tmp")), false);
      assert.ok(files.every((name) => name.endsWith(".png")));
    }
  });

  await check("scan limiter released after Phase 8 scans", async () => {
    assert.equal(scanLimiter.getActiveCount(), 0);
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase8/reversible-checkbox`,
      options: {
        ...off,
        safeInteractions: true,
        reversibleWorkflows: true,
      },
    });
    assert.equal(result.success, true);
    assert.equal(scanLimiter.getActiveCount(), 0);
  });
} finally {
  await fixture.close();
  scanLimiter.reset();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
