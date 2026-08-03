import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { access, rm, stat } from "node:fs/promises";
import path from "node:path";
import { resetScannerConfigCache } from "@/lib/config/scanner-config";
import { runBasicScan } from "@/lib/scanner/basic-scan";
import { isScanError } from "@/lib/scanner/scan-errors";
import { scanLimiter } from "@/lib/scanner/scan-limiter";
import { startLocalFixtureServer } from "./helpers/local-fixture-server.mjs";

const previousEnv = { ...process.env };

describe("runBasicScan local fixture integration", { concurrency: 1 }, () => {
  let fixture;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOW_LOCAL_FIXTURE = "true";
    process.env.LOCAL_FIXTURE_HOST = "127.0.0.1";
    process.env.LOCAL_FIXTURE_PORT = "3100";
    process.env.SCAN_STABILIZATION_MS = "100";
    process.env.SCAN_PAGE_TIMEOUT_MS = "5000";
    process.env.SCAN_TOTAL_TIMEOUT_MS = "20000";
    process.env.SCAN_MAX_CONCURRENT_SCANS = "1";
    resetScannerConfigCache();
    scanLimiter.reset();
    fixture = await startLocalFixtureServer(3100);
    process.env.LOCAL_FIXTURE_PORT = String(fixture.port);
    resetScannerConfigCache();
  });

  after(async () => {
    if (fixture) {
      await fixture.close();
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, previousEnv);
    resetScannerConfigCache();
    scanLimiter.reset();
  });

  it("scans a simple HTML page", async () => {
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/ok`,
      options: {
        consoleErrors: true,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.mode, "BASIC_SCAN");
    assert.equal(result.targetWasContacted, true);
    assert.equal(result.page.title, "Fixture OK");
    assert.equal(result.page.statusCode, 200);
    assert.match(result.page.contentType ?? "", /text\/html/);
    assert.equal(result.page.redirectCount, 0);
    assert.equal(result.diagnostics.status, "NOT_RUN");
    assert.deepEqual(result.diagnostics.issues, []);
    assert.equal(result.screenshot.available, false);
    assert.ok(result.deferredChecks.includes("consoleErrors"));
  });

  it("captures a desktop screenshot when requested", async () => {
    const scanId = crypto.randomUUID();
    const result = await runBasicScan({
      scanId,
      url: `${fixture.origin}/ok`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: true,
      },
    });

    assert.equal(result.screenshot.requested, true);
    assert.equal(result.screenshot.available, true);
    assert.ok(result.screenshot.publicUrl?.startsWith("/scan-results/"));
    assert.equal(result.screenshot.publicUrl?.includes(".."), false);

    const absolute = path.join(
      process.cwd(),
      "public",
      "scan-results",
      scanId,
      "desktop.png",
    );
    const info = await stat(absolute);
    assert.ok(info.size > 0);
    await rm(path.join(process.cwd(), "public", "scan-results", scanId), {
      recursive: true,
      force: true,
    });
  });

  it("follows a safe redirect", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/redirect-safe`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });
    assert.equal(result.page.finalUrl.endsWith("/ok"), true);
    assert.ok(result.page.redirectCount >= 1);
  });

  it("rejects an unsafe private redirect", async () => {
    try {
      await runBasicScan({
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/redirect-private`,
        options: {
          consoleErrors: false,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        },
      });
      assert.fail("expected unsafe redirect failure");
    } catch (error) {
      assert.equal(isScanError(error), true);
      if (isScanError(error)) {
        assert.ok(
          error.code === "UNSAFE_REDIRECT" ||
            error.code === "BLOCKED_TARGET" ||
            error.code === "WEBSITE_UNAVAILABLE" ||
            error.code === "BLOCKED_IP",
        );
      }
    }
  });

  it("blocks a private subresource while allowing the main page", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/blocked-subresource`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });
    assert.equal(result.success, true);
    assert.ok(result.security.blockedRequestCount > 0);
    for (const entry of result.security.blockedRequests) {
      assert.equal(entry.hostname.includes("?"), false);
      assert.equal(entry.hostname.includes("token="), false);
    }
  });

  it("rejects non-HTML content", async () => {
    try {
      await runBasicScan({
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/pdf`,
        options: {
          consoleErrors: false,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        },
      });
      assert.fail("expected unsupported content type");
    } catch (error) {
      assert.equal(isScanError(error), true);
      if (isScanError(error)) {
        assert.equal(error.code, "UNSUPPORTED_CONTENT_TYPE");
      }
    }
  });

  it("times out a slow page", async () => {
    const { getScannerConfig } = await import("@/lib/config/scanner-config");
    const config = {
      ...getScannerConfig(),
      pageTimeoutMs: 500,
      totalTimeoutMs: 3000,
      stabilizationMs: 0,
    };

    try {
      await runBasicScan(
        {
          scanId: crypto.randomUUID(),
          url: `${fixture.origin}/slow`,
          options: {
            consoleErrors: false,
            networkErrors: false,
            brokenImages: false,
            mobileLayout: false,
            accessibility: false,
            screenshots: false,
          },
        },
        { config },
      );
      assert.fail("expected timeout");
    } catch (error) {
      if (
        error instanceof assert.AssertionError &&
        /expected timeout/i.test(String(error.message))
      ) {
        throw error;
      }
      assert.equal(
        isScanError(error),
        true,
        `unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      if (isScanError(error)) {
        assert.ok(
          error.code === "NAVIGATION_TIMEOUT" || error.code === "SCAN_TIMEOUT",
          `unexpected code ${error.code}`,
        );
      }
    }
  });

  it("rejects a second concurrent scan with SCAN_BUSY", async () => {
    process.env.SCAN_PAGE_TIMEOUT_MS = "5000";
    process.env.SCAN_STABILIZATION_MS = "800";
    resetScannerConfigCache();

    const first = runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/slow`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      await runBasicScan({
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/ok`,
        options: {
          consoleErrors: false,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        },
      });
      assert.fail("expected SCAN_BUSY");
    } catch (error) {
      assert.equal(isScanError(error), true);
      if (isScanError(error)) {
        assert.equal(error.code, "SCAN_BUSY");
      }
    }

    try {
      await first;
    } catch {
      // Slow scan may time out depending on remaining budget; slot must still release.
    }

    assert.equal(scanLimiter.getActiveCount(), 0);

    const later = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/ok`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });
    assert.equal(later.success, true);
  });

  it("does not leave a screenshot directory when screenshots are not requested", async () => {
    const scanId = crypto.randomUUID();
    await runBasicScan({
      scanId,
      url: `${fixture.origin}/ok`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });

    await assert.rejects(
      access(path.join(process.cwd(), "public", "scan-results", scanId)),
    );
  });
});
