import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicScanExportFileName } from "@/lib/utils/basic-scan-export-filename";
import {
  parseScanErrorResponse,
  parseScanResult,
} from "@/lib/validation/scan-response";
import type { BasicScanResult } from "@/types/scan";

function sampleResult(
  overrides: Partial<BasicScanResult> = {},
): BasicScanResult {
  return {
    success: true,
    mode: "BASIC_SCAN",
    scanId: "11111111-1111-4111-8111-111111111111",
    targetUrl: "https://example.com/",
    targetWasContacted: true,
    startedAt: "2026-08-03T12:00:00.000Z",
    completedAt: "2026-08-03T12:00:01.000Z",
    durationMs: 1000,
    page: {
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      title: "Example",
      statusCode: 200,
      statusText: "OK",
      contentType: "text/html",
      redirectCount: 0,
      navigationDurationMs: 100,
    },
    screenshot: {
      requested: false,
      available: false,
      reason: "Screenshot capture was not requested.",
    },
    executedCapabilities: ["basicNavigation"],
    deferredChecks: ["consoleErrors"],
    security: {
      inspectedRequestCount: 1,
      uniqueHostCount: 1,
      blockedRequestCount: 0,
      blockedRequests: [],
    },
    diagnostics: { status: "NOT_RUN", issues: [] },
    notices: ["Basic page scan completed."],
    ...overrides,
  };
}

describe("basicScanExportFileName", () => {
  it("includes basic-scan and a sanitized hostname", () => {
    assert.equal(
      basicScanExportFileName("https://example.com/path"),
      "frontend-bug-finder-basic-scan-example-com.json",
    );
  });

  it("falls back safely", () => {
    assert.equal(
      basicScanExportFileName("not-a-url"),
      "frontend-bug-finder-basic-scan-report.json",
    );
  });
});

describe("parseScanResult", () => {
  it("accepts a valid basic scan result", () => {
    assert.ok(parseScanResult(sampleResult()));
  });

  it("rejects demo-mode payloads", () => {
    assert.equal(
      parseScanResult({
        ...sampleResult(),
        mode: "DEMO",
        targetWasContacted: false,
      }),
      null,
    );
  });

  it("rejects unsafe screenshot paths", () => {
    assert.equal(
      parseScanResult(
        sampleResult({
          screenshot: {
            requested: true,
            available: true,
            publicUrl: "/scan-results/../secret/desktop.png",
            captureMode: "VIEWPORT",
            width: 1366,
            height: 768,
          },
        }),
      ),
      null,
    );
  });

  it("rejects non-empty diagnostic issues", () => {
    assert.equal(
      parseScanResult({
        ...sampleResult(),
        diagnostics: { status: "NOT_RUN", issues: [{ id: "x" }] },
      }),
      null,
    );
  });
});

describe("parseScanErrorResponse", () => {
  it("accepts structured errors", () => {
    const parsed = parseScanErrorResponse({
      success: false,
      error: "Blocked",
      code: "BLOCKED_TARGET",
      scanId: "abc",
    });
    assert.ok(parsed);
    assert.equal(parsed?.code, "BLOCKED_TARGET");
  });
});
