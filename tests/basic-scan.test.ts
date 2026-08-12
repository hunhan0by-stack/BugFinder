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
    process.env.SCAN_DIAGNOSTIC_SETTLE_MS = "300";
    process.env.SCAN_PAGE_TIMEOUT_MS = "5000";
    process.env.SCAN_TOTAL_TIMEOUT_MS = "45000";
    process.env.SCAN_MAX_CONCURRENT_SCANS = "1";
    process.env.SCAN_INTERACTION_SETTLE_MS = "400";
    process.env.SCAN_INTERACTION_PRECLICK_QUIET_MS = "100";
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
        safeInteractions: false,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.mode, "BASIC_SCAN");
    assert.equal(result.targetWasContacted, true);
    assert.equal(result.page.title, "Fixture OK");
    assert.equal(result.page.statusCode, 200);
    assert.match(result.page.contentType ?? "", /text\/html/);
    assert.equal(result.page.redirectCount, 0);
    assert.equal(result.diagnostics.status, "COMPLETE");
    assert.deepEqual(result.diagnostics.issues, []);
    assert.equal(result.screenshot.available, false);
    assert.deepEqual(result.deferredChecks, []);
    assert.ok(result.executedCapabilities.includes("consoleErrorDiagnostics"));
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
        safeInteractions: false,
      },
    });

    assert.equal(result.screenshot.requested, true);
    assert.equal(result.screenshot.available, true);
    assert.equal(result.mobileScreenshot.requested, true);
    assert.equal(result.mobileScreenshot.available, true);
    assert.ok(result.screenshot.publicUrl?.startsWith("/scan-results/"));
    assert.ok(result.mobileScreenshot.publicUrl?.endsWith("/mobile.png"));
    assert.equal(result.screenshot.publicUrl?.includes(".."), false);
    assert.equal(result.diagnostics.capabilities.mobileLayout, "NOT_REQUESTED");

    const absolute = path.join(
      process.cwd(),
      "public",
      "scan-results",
      scanId,
      "desktop.png",
    );
    const mobileAbsolute = path.join(
      process.cwd(),
      "public",
      "scan-results",
      scanId,
      "mobile.png",
    );
    const info = await stat(absolute);
    const mobileInfo = await stat(mobileAbsolute);
    assert.ok(info.size > 0);
    assert.ok(mobileInfo.size > 0);
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
        safeInteractions: false,
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
        safeInteractions: false,
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
        networkErrors: true,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.equal(result.success, true);
    assert.ok(result.security.blockedRequestCount > 0);
    for (const entry of result.security.blockedRequests) {
      assert.equal(entry.hostname.includes("?"), false);
      assert.equal(entry.hostname.includes("token="), false);
    }
    assert.equal(
      result.diagnostics.issues.some((issue) => issue.type === "REQUEST_FAILED"),
      false,
      "intentional security aborts must not become REQUEST_FAILED issues",
    );
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
        safeInteractions: false,
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
        safeInteractions: false,
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
        safeInteractions: false,
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
        safeInteractions: false,
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
        safeInteractions: false,
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
        safeInteractions: false,
      },
    });

    await assert.rejects(
      access(path.join(process.cwd(), "public", "scan-results", scanId)),
    );
  });

  it("collects a console error from the clean diagnostic fixture path", async () => {
    const result = await runBasicScan(
      {
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/console-error`,
        options: {
          consoleErrors: true,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        safeInteractions: false,
        },
      },
      {
        config: {
          ...(await import("@/lib/config/scanner-config")).getScannerConfig(),
          diagnosticSettleMs: 300,
          stabilizationMs: 100,
        },
      },
    );
    assert.equal(result.diagnostics.status, "COMPLETE");
    assert.ok(
      result.diagnostics.issues.some((issue) => issue.type === "CONSOLE_ERROR"),
    );
  });

  it("groups duplicate console errors", async () => {
    const result = await runBasicScan(
      {
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/console-error-dup`,
        options: {
          consoleErrors: true,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        safeInteractions: false,
        },
      },
      {
        config: {
          ...(await import("@/lib/config/scanner-config")).getScannerConfig(),
          diagnosticSettleMs: 300,
          stabilizationMs: 100,
        },
      },
    );
    const consoleIssue = result.diagnostics.issues.find(
      (issue) => issue.type === "CONSOLE_ERROR",
    );
    assert.ok(consoleIssue);
    assert.equal(consoleIssue?.occurrenceCount, 3);
  });

  it("collects an uncaught page error", async () => {
    const result = await runBasicScan(
      {
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/page-error`,
        options: {
          consoleErrors: true,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        safeInteractions: false,
        },
      },
      {
        config: {
          ...(await import("@/lib/config/scanner-config")).getScannerConfig(),
          diagnosticSettleMs: 400,
          stabilizationMs: 100,
        },
      },
    );
    assert.ok(
      result.diagnostics.issues.some((issue) => issue.type === "PAGE_ERROR"),
    );
  });

  it("collects HTTP 500 and failed-request diagnostics from multi fixture", async () => {
    const result = await runBasicScan(
      {
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/multi`,
        options: {
          consoleErrors: true,
          networkErrors: true,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        safeInteractions: false,
        },
      },
      {
        config: {
          ...(await import("@/lib/config/scanner-config")).getScannerConfig(),
          diagnosticSettleMs: 500,
          stabilizationMs: 100,
        },
      },
    );
    assert.ok(result.diagnostics.groupedIssueCount >= 3);
    assert.ok(result.diagnostics.typeSummary.consoleErrors >= 1);
    assert.ok(result.diagnostics.typeSummary.pageErrors >= 1);
    assert.ok(result.diagnostics.typeSummary.httpErrors >= 1);
  });

  it("marks diagnostics PARTIAL when the flood fixture exceeds event limits", async () => {
    const base = (await import("@/lib/config/scanner-config")).getScannerConfig();
    const result = await runBasicScan(
      {
        scanId: crypto.randomUUID(),
        url: `${fixture.origin}/flood`,
        options: {
          consoleErrors: true,
          networkErrors: false,
          brokenImages: false,
          mobileLayout: false,
          accessibility: false,
          screenshots: false,
        safeInteractions: false,
        },
      },
      {
        config: {
          ...base,
          diagnosticSettleMs: 200,
          stabilizationMs: 50,
          maxDiagnosticEvents: 10,
          maxDiagnosticIssues: 5,
        },
      },
    );
    assert.equal(result.diagnostics.status, "PARTIAL");
    assert.ok(result.diagnostics.droppedEventCount > 0);
    assert.ok(result.diagnostics.issues.length <= 5);
  });

  it("returns NOT_REQUESTED when diagnostics are disabled", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/clean`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: true,
        safeInteractions: false,
      },
    });
    assert.equal(result.diagnostics.status, "NOT_REQUESTED");
    assert.deepEqual(result.diagnostics.issues, []);
    assert.equal(result.screenshot.available, true);
    assert.equal(result.mobileScreenshot.available, true);
    assert.equal(result.diagnostics.capabilities.brokenImages, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.mobileLayout, "NOT_REQUESTED");
    assert.equal(result.diagnostics.capabilities.accessibility, "NOT_REQUESTED");
    await rm(
      path.join(process.cwd(), "public", "scan-results", result.scanId),
      { recursive: true, force: true },
    );
  });

  it("runs a clean Phase 6 diagnostic scan", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/phase6-clean`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: true,
        mobileLayout: true,
        accessibility: true,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.equal(result.brokenImageAnalysis.status, "COMPLETE");
    assert.equal(result.mobileLayoutAnalysis.status, "COMPLETE");
    assert.equal(result.accessibilityAnalysis.status, "COMPLETE");
    assert.equal(result.diagnostics.status, "COMPLETE");
    assert.equal(result.diagnostics.typeSummary.brokenImages, 0);
    assert.equal(result.diagnostics.typeSummary.mobileLayoutIssues, 0);
    assert.equal(result.diagnostics.typeSummary.accessibilityViolations, 0);
    assert.equal(result.mobileScreenshot.requested, false);
  });

  it("reports a visible broken image", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/broken-image`,
      options: {
        consoleErrors: false,
        networkErrors: true,
        brokenImages: true,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    const broken = result.diagnostics.issues.filter(
      (issue) => issue.type === "BROKEN_IMAGE",
    );
    assert.equal(broken.length, 1);
    assert.equal(broken[0]?.profile, "DESKTOP");
    assert.equal(broken[0]?.occurrenceCount, 1);
    assert.equal(
      result.diagnostics.issues.some(
        (issue) =>
          issue.type === "HTTP_ERROR" &&
          issue.metadata.resourceType === "image" &&
          issue.resourceUrl === broken[0]?.resourceUrl,
      ),
      false,
    );
  });

  it("groups duplicate broken images", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/broken-image-dup`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: true,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    const broken = result.diagnostics.issues.filter(
      (issue) => issue.type === "BROKEN_IMAGE",
    );
    assert.equal(broken.length, 1);
    assert.equal(broken[0]?.occurrenceCount, 3);
  });

  it("ignores hidden broken images", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/broken-image-hidden`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: true,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "BROKEN_IMAGE")
        .length,
      0,
    );
  });

  it("reports mobile overflow", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/mobile-overflow`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: true,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    const overflow = result.diagnostics.issues.filter(
      (issue) => issue.type === "MOBILE_OVERFLOW",
    );
    assert.ok(overflow.length >= 1);
    assert.equal(overflow[0]?.profile, "MOBILE");
    assert.ok((result.mobileLayoutAnalysis.horizontalOverflowPx ?? 0) > 3);
    assert.equal(result.mobileLayoutAnalysis.viewport.width, 390);
  });

  it("reports missing mobile viewport meta", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/mobile-missing-viewport`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: true,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.ok(
      result.diagnostics.issues.some((issue) => issue.type === "MOBILE_VIEWPORT"),
    );
  });

  it("reports accessibility violations without raw HTML", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/a11y-violations`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: true,
        screenshots: false,
        safeInteractions: false,
      },
    });
    const a11y = result.diagnostics.issues.filter(
      (issue) => issue.type === "ACCESSIBILITY_VIOLATION",
    );
    assert.ok(a11y.length >= 1);
    assert.equal(a11y[0]?.profile, "DESKTOP");
    assert.ok(a11y[0]?.metadata.ruleId);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("<button"), false);
    assert.equal(serialized.includes("outerHTML"), false);
  });

  it("does not treat security-blocked images as broken images", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/blocked-subresource`,
      options: {
        consoleErrors: false,
        networkErrors: true,
        brokenImages: true,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.ok(result.security.blockedRequestCount > 0);
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "BROKEN_IMAGE")
        .length,
      0,
    );
  });

  it("clicks a safe toggle without creating issues", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/safe-toggle`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    assert.equal(result.safeInteractionAnalysis.status, "COMPLETE");
    assert.ok(result.safeInteractionAnalysis.actualClickCount >= 1);
    assert.ok(result.safeInteractionAnalysis.responsiveControlCount >= 1);
    assert.equal(result.diagnostics.typeSummary.deadClicks, 0);
  });

  it("reports a dead click for a button without a handler", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/dead-click`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    const dead = result.diagnostics.issues.filter(
      (issue) => issue.type === "DEAD_CLICK",
    );
    assert.ok(dead.length >= 1);
    assert.equal(dead[0]?.profile, "DESKTOP");
    assert.equal(JSON.stringify(result).includes("No handler"), false);
  });

  it("reports an obstructed control without labeling it dead", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/obstructed-button`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    assert.ok(
      result.diagnostics.issues.some(
        (issue) => issue.type === "OBSTRUCTED_CONTROL",
      ),
    );
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "DEAD_CLICK")
        .length,
      0,
    );
  });

  it("blocks network side effects from interaction clicks", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/network-click`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    assert.ok(result.safeInteractionAnalysis.skippedNetworkCount >= 1);
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "DEAD_CLICK")
        .length,
      0,
    );
  });

  it("reports persistent busy as FORM_STATE_ISSUE not DEAD_CLICK", async () => {
    const result = await runBasicScan({
      scanId: crypto.randomUUID(),
      url: `${fixture.origin}/persistent-busy`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    const formIssues = result.diagnostics.issues.filter(
      (issue) => issue.type === "FORM_STATE_ISSUE",
    );
    assert.ok(formIssues.length >= 1);
    assert.equal(
      formIssues[0]?.metadata.subtype,
      "PERSISTENT_BUSY_STATE",
    );
    assert.equal(
      result.diagnostics.issues.filter((issue) => issue.type === "DEAD_CLICK")
        .length,
      0,
    );
  });
});
