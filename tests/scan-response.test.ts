import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicScanExportFileName } from "@/lib/utils/basic-scan-export-filename";
import {
  parseScanErrorResponse,
  parseScanResult,
} from "@/lib/validation/scan-response";
import type { BasicScanResult, DiagnosticResult } from "@/types/scan";

function emptyDiagnostics(
  overrides: Partial<DiagnosticResult> = {},
): DiagnosticResult {
  return {
    status: "NOT_REQUESTED",
    capabilities: {
      console: "NOT_REQUESTED",
      network: "NOT_REQUESTED",
      brokenImages: "NOT_REQUESTED",
      mobileLayout: "NOT_REQUESTED",
      accessibility: "NOT_REQUESTED",
      safeInteractions: "NOT_REQUESTED",
    },
    issues: [],
    severitySummary: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
    typeSummary: {
      consoleErrors: 0,
      pageErrors: 0,
      failedRequests: 0,
      httpErrors: 0,
      brokenImages: 0,
      mobileLayoutIssues: 0,
      accessibilityViolations: 0,
      deadClicks: 0,
      obstructedControls: 0,
      formStateIssues: 0,
    },
    capturedEventCount: 0,
    groupedIssueCount: 0,
    ignoredEventCount: 0,
    droppedEventCount: 0,
    limits: {
      rawEventLimitReached: false,
      issueLimitReached: false,
      messageTruncationOccurred: false,
      stackTruncationOccurred: false,
    },
    notices: [
      "Console and network diagnostics were not selected for this scan.",
    ],
    ...overrides,
  };
}

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
    mobileScreenshot: {
      requested: false,
      available: false,
      reason: "Mobile screenshot capture was not requested.",
    },
    brokenImageAnalysis: {
      status: "NOT_REQUESTED",
      inspectedImageCount: 0,
      visibleImageCount: 0,
      skippedImageCount: 0,
      skippedLazyImageCount: 0,
      networkOutcomeCount: 0,
      issueCount: 0,
      elementLimitReached: false,
      outcomeLimitReached: false,
      notices: ["Broken-image analysis was not selected for this scan."],
    },
    mobileLayoutAnalysis: {
      status: "NOT_REQUESTED",
      requested: false,
      viewport: {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
      viewportMetaPresent: null,
      analyzedElementCount: 0,
      overflowingElementCount: 0,
      elementLimitReached: false,
      issueCount: 0,
      notices: ["Mobile layout analysis was not selected for this scan."],
    },
    accessibilityAnalysis: {
      status: "NOT_REQUESTED",
      engine: "axe-core",
      standards: [
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22a",
        "wcag22aa",
      ],
      violationRuleCount: 0,
      affectedNodeCount: 0,
      reportedIssueCount: 0,
      issueLimitReached: false,
      nodeEvidenceLimitReached: false,
      notices: ["Accessibility analysis was not selected for this scan."],
    },
    safeInteractionAnalysis: {
      status: "NOT_REQUESTED",
      requested: false,
      discoveredCandidateCount: 0,
      eligibleCandidateCount: 0,
      trialCheckedCount: 0,
      actualClickCount: 0,
      responsiveControlCount: 0,
      deadClickIssueCount: 0,
      obstructionIssueCount: 0,
      formStateIssueCount: 0,
      skippedUnsafeCount: 0,
      skippedNavigationCount: 0,
      skippedFormSubmissionCount: 0,
      skippedDestructiveCount: 0,
      skippedNetworkCount: 0,
      skippedPopupCount: 0,
      skippedDownloadCount: 0,
      skippedOffscreenCount: 0,
      skippedUnstableCount: 0,
      skippedUnknownRiskCount: 0,
      candidateLimitReached: false,
      clickLimitReached: false,
      mutationLimitReached: false,
      issueLimitReached: false,
      notices: ["Safe interaction analysis was not selected for this scan."],
    },
    executedCapabilities: ["basicNavigation"],
    deferredChecks: [],
    security: {
      inspectedRequestCount: 1,
      uniqueHostCount: 1,
      blockedRequestCount: 0,
      blockedRequests: [],
    },
    diagnostics: emptyDiagnostics(),
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

  it("rejects NOT_REQUESTED diagnostics that include issues", () => {
    assert.equal(
      parseScanResult(
        sampleResult({
          diagnostics: emptyDiagnostics({
            status: "NOT_REQUESTED",
            issues: [
              {
                id: "x",
                type: "CONSOLE_ERROR",
                severity: "MEDIUM",
                confidence: 80,
                title: "t",
                description: "d",
                observedBehavior: "o",
                potentialUserImpact: "p",
                technicalEvidence: "e",
                suggestedInvestigation: "s",
                scope: "SAME_ORIGIN",
                profile: "DESKTOP",
                pageUrl: "https://example.com/",
                occurrenceCount: 1,
                firstSeenMs: 1,
                lastSeenMs: 1,
                metadata: {},
              },
            ],
            severitySummary: {
              total: 1,
              high: 0,
              medium: 1,
              low: 0,
              info: 0,
            },
            groupedIssueCount: 1,
          }),
        }),
      ),
      null,
    );
  });

  it("accepts COMPLETE diagnostics with a real issue", () => {
    const parsed = parseScanResult(
      sampleResult({
        diagnostics: emptyDiagnostics({
          status: "COMPLETE",
          capabilities: {
            console: "COMPLETE",
            network: "NOT_REQUESTED",
            brokenImages: "NOT_REQUESTED",
            mobileLayout: "NOT_REQUESTED",
            accessibility: "NOT_REQUESTED",
            safeInteractions: "NOT_REQUESTED",
          },
          issues: [
            {
              id: "issue-1",
              type: "CONSOLE_ERROR",
              severity: "MEDIUM",
              confidence: 90,
              title: "JavaScript console error",
              description: "The browser console recorded an error.",
              observedBehavior: "console error",
              potentialUserImpact: "may affect UI",
              technicalEvidence: "TypeError",
              suggestedInvestigation: "inspect script",
              scope: "SAME_ORIGIN",
              profile: "DESKTOP",
              pageUrl: "https://example.com/",
              occurrenceCount: 1,
              firstSeenMs: 10,
              lastSeenMs: 10,
              metadata: { consoleType: "error" },
            },
          ],
          severitySummary: {
            total: 1,
            high: 0,
            medium: 1,
            low: 0,
            info: 0,
          },
          typeSummary: {
            consoleErrors: 1,
            pageErrors: 0,
            failedRequests: 0,
            httpErrors: 0,
            brokenImages: 0,
            mobileLayoutIssues: 0,
            accessibilityViolations: 0,
            deadClicks: 0,
            obstructedControls: 0,
            formStateIssues: 0,
          },
          capturedEventCount: 1,
          groupedIssueCount: 1,
          notices: [],
        }),
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed?.diagnostics.issues.length, 1);
    assert.equal(parsed?.diagnostics.issues[0]?.profile, "DESKTOP");
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
