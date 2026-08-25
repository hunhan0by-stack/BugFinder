import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { startLocalFixtureServer } from "./helpers/local-fixture-server.mjs";
import { runBasicScan } from "@/lib/scanner/basic-scan";
import { resetScannerConfigCache } from "@/lib/config/scanner-config";
import {
  logScanEvent,
  resetScanLogSink,
  setScanLogSink,
} from "@/lib/observability/scan-logger";

const SECRETS = [
  "PHASE9_SECRET_QUERY",
  "PHASE9_SECRET_PASSWORD",
  "PHASE9_SECRET_FORM",
  "PHASE9_SECRET_BUTTON",
  "PHASE9_SECRET_AUTH",
];

describe("phase 9 privacy", () => {
  const previousEnv = { ...process.env };
  let fixture: Awaited<ReturnType<typeof startLocalFixtureServer>>;
  const lines: string[] = [];

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOW_LOCAL_FIXTURE = "true";
    process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
    process.env.SCAN_STABILIZATION_MS = "100";
    process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "200";
    process.env.SCAN_PAGE_TIMEOUT_MS = "8000";
    process.env.SCAN_TOTAL_TIMEOUT_MS = "45000";
    resetScannerConfigCache();
    fixture = await startLocalFixtureServer(0);
    process.env.LOCAL_FIXTURE_PORT = String(fixture.port);
    resetScannerConfigCache();
    setScanLogSink((line) => lines.push(line));
  });

  after(async () => {
    resetScanLogSink();
    await fixture.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, previousEnv);
    resetScannerConfigCache();
  });

  it("omits fixture secrets from API JSON and logs", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase9/secret-privacy?secret=PHASE9_SECRET_QUERY`,
      options: {
        consoleErrors: true,
        networkErrors: true,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
        issueEvidence: false,
        reversibleWorkflows: false,
      },
    });

    logScanEvent({
      level: "info",
      event: "scan.completed",
      scanId: result.scanId,
      target: `${fixture.origin}/phase9/secret-privacy?secret=PHASE9_SECRET_QUERY`,
    });

    const serialized = JSON.stringify(result);
    const logs = lines.join("\n");
    for (const secret of SECRETS) {
      assert.equal(serialized.includes(secret), false, `JSON leaked ${secret}`);
      assert.equal(logs.includes(secret), false, `logs leaked ${secret}`);
    }
    assert.equal(serialized.includes("C:\\"), false);
    assert.equal(serialized.includes("/Projects/"), false);

    await rm(path.join(process.cwd(), "public", "scan-results", result.scanId), {
      recursive: true,
      force: true,
    });
  });
});
