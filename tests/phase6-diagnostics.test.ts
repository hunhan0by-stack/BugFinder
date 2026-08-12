import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import {
  buildAccessibilityIssuesFromViolations,
  mapAxeImpactToSeverity,
} from "@/lib/scanner/diagnostics/accessibility-analysis";
import {
  classifyBrokenImage,
  isVisibleImageElement,
  suppressDuplicateImageNetworkIssues,
  type InspectedImageElement,
} from "@/lib/scanner/diagnostics/broken-image-analysis";
import {
  createTypeSummary,
  deriveOverallDiagnosticStatus,
  sortDiagnosticIssues,
} from "@/lib/scanner/diagnostics/create-summary";
import type { ImageNetworkOutcome } from "@/lib/scanner/diagnostics/image-outcome-observer";
import { classifyOverflowSeverity } from "@/lib/scanner/diagnostics/mobile-layout-analysis";
import type { DiagnosticIssue } from "@/types/scan";

function testConfig(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  return {
    pageTimeoutMs: 30_000,
    totalTimeoutMs: 90_000,
    screenshotTimeoutMs: 15_000,
    maxRedirects: 5,
    maxRequests: 400,
    maxUniqueHosts: 40,
    maxBlockedRequestRecords: 20,
    maxConcurrentScans: 1,
    allowedPorts: [80, 443],
    maxFullPageHeight: 20_000,
    dnsTimeoutMs: 5_000,
    stabilizationMs: 100,
    diagnosticSettleMs: 100,
    maxDiagnosticEvents: 500,
    maxDiagnosticIssues: 100,
    maxConsoleMessageLength: 2000,
    maxPageErrorMessageLength: 2000,
    maxStackLength: 8000,
    maxEvidenceLength: 4000,
    maxDiagnosticUrlLength: 1000,
    brokenImageTimeoutMs: 5000,
    maxImageElements: 2000,
    maxImageNetworkOutcomes: 2000,
    maxBrokenImageIssues: 100,
    maxImageSelectorSamples: 3,
    mobileViewportWidth: 390,
    mobileViewportHeight: 844,
    mobileDeviceScaleFactor: 1,
    mobileAnalysisTimeoutMs: 10_000,
    maxLayoutElements: 5000,
    maxMobileLayoutIssues: 50,
    layoutOverflowTolerancePx: 3,
    maxLayoutSelectorLength: 500,
    accessibilityTimeoutMs: 15_000,
    maxAccessibilityIssues: 100,
    maxAxeNodesPerRule: 5,
    maxAxeTargetLength: 500,
    maxAxeFailureSummaryLength: 2000,
    interactionDiscoveryTimeoutMs: 5000,
    interactionContextTimeoutMs: 12000,
    interactionSettleMs: 1000,
    interactionPreclickQuietMs: 250,
    maxInteractionCandidates: 100,
    maxSafeClicks: 5,
    maxInteractionIssues: 50,
    maxInteractionSelectorLength: 500,
    maxInteractionMutations: 1000,
    maxInteractionControlledTargets: 20,
    interactionObstructionTolerancePx: 2,
    interactionMinVisibleAreaPx: 16,
    allowLocalFixture: true,
    localFixtureHost: "127.0.0.1",
    localFixturePort: 3100,
    maxRequestBodyBytes: 16_384,
    ...overrides,
  };
}

function visibleImage(
  overrides: Partial<InspectedImageElement> = {},
): InspectedImageElement {
  return {
    correlationKey: "key-a",
    scheme: "http",
    sanitizedUrl: "http://127.0.0.1:3100/missing.png",
    complete: true,
    naturalWidth: 0,
    naturalHeight: 0,
    renderedWidth: 100,
    renderedHeight: 60,
    display: "block",
    visibility: "visible",
    opacity: 1,
    loading: "eager",
    connected: true,
    inViewport: true,
    selector: "body > img:nth-of-type(1)",
    ...overrides,
  };
}

function baseIssue(overrides: Partial<DiagnosticIssue>): DiagnosticIssue {
  return {
    id: "1",
    type: "CONSOLE_ERROR",
    severity: "MEDIUM",
    confidence: 90,
    title: "t",
    description: "d",
    observedBehavior: "o",
    potentialUserImpact: "p",
    technicalEvidence: "e",
    suggestedInvestigation: "s",
    scope: "SAME_ORIGIN",
    profile: "DESKTOP",
    pageUrl: "http://example.com/",
    occurrenceCount: 1,
    firstSeenMs: 0,
    lastSeenMs: 0,
    metadata: {},
    ...overrides,
  };
}

describe("Phase 6 broken-image helpers", () => {
  it("detects visible images and ignores display none", () => {
    assert.equal(isVisibleImageElement(visibleImage()), true);
    assert.equal(
      isVisibleImageElement(visibleImage({ display: "none" })),
      false,
    );
    assert.equal(isVisibleImageElement(visibleImage({ opacity: 0 })), false);
  });

  it("classifies HTTP, request failure, and DOM-only failures", () => {
    const httpOutcome: ImageNetworkOutcome = {
      correlationKey: "key-a",
      sanitizedUrl: "http://127.0.0.1:3100/missing.png",
      kind: "HTTP_4XX",
      statusCode: 404,
    };
    assert.equal(
      classifyBrokenImage(visibleImage(), httpOutcome)?.confidence,
      99,
    );
    assert.equal(
      classifyBrokenImage(visibleImage(), {
        correlationKey: "key-a",
        sanitizedUrl: "http://127.0.0.1:3100/missing.png",
        kind: "REQUEST_FAILED",
        failureReason: "net::ERR_CONNECTION_RESET",
      })?.confidence,
      97,
    );
    assert.equal(classifyBrokenImage(visibleImage(), undefined)?.confidence, 92);
    assert.equal(
      classifyBrokenImage(
        visibleImage({ complete: true, naturalWidth: 40 }),
        undefined,
      ),
      null,
    );
  });

  it("suppresses matching image HTTP and request-failed issues", () => {
    const broken = [
      baseIssue({
        id: "b",
        type: "BROKEN_IMAGE",
        resourceUrl: "http://127.0.0.1:3100/missing.png",
      }),
    ];
    const issues = [
      baseIssue({
        id: "h",
        type: "HTTP_ERROR",
        resourceUrl: "http://127.0.0.1:3100/missing.png",
        metadata: { resourceType: "image" },
      }),
      baseIssue({
        id: "r",
        type: "REQUEST_FAILED",
        resourceUrl: "http://127.0.0.1:3100/other.js",
        metadata: { resourceType: "script" },
      }),
    ];
    const filtered = suppressDuplicateImageNetworkIssues(issues, broken);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "r");
  });
});

describe("Phase 6 mobile overflow severity", () => {
  it("maps overflow magnitudes conservatively", () => {
    assert.equal(classifyOverflowSeverity(4, 390), "LOW");
    assert.equal(classifyOverflowSeverity(20, 390), "MEDIUM");
    assert.equal(classifyOverflowSeverity(130, 390), "HIGH");
    assert.equal(classifyOverflowSeverity(50, 390), "MEDIUM");
    assert.equal(classifyOverflowSeverity(98, 390), "HIGH");
  });
});

describe("Phase 6 accessibility helpers", () => {
  it("maps axe impact to severity", () => {
    assert.equal(mapAxeImpactToSeverity("critical"), "HIGH");
    assert.equal(mapAxeImpactToSeverity("serious"), "HIGH");
    assert.equal(mapAxeImpactToSeverity("moderate"), "MEDIUM");
    assert.equal(mapAxeImpactToSeverity("minor"), "LOW");
    assert.equal(mapAxeImpactToSeverity(null), "INFO");
  });

  it("groups by rule, bounds samples, and omits HTML", () => {
    const result = buildAccessibilityIssuesFromViolations({
      violations: [
        {
          id: "button-name",
          impact: "critical",
          help: "Buttons must have discernible text",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
          tags: ["wcag2a", "wcag21a"],
          nodes: Array.from({ length: 8 }, (_, index) => ({
            target: [`button:nth-of-type(${index + 1})`],
            failureSummary: "Fix this button",
            html: `<button secret="${index}">bad</button>`,
          })),
        },
        {
          id: "label",
          impact: "serious",
          help: "Form elements must have labels",
          tags: ["wcag2a"],
          nodes: [{ target: ["input"], failureSummary: "no label" }],
        },
      ],
      config: testConfig({ maxAxeNodesPerRule: 3, maxAccessibilityIssues: 10 }),
      finalPageUrl: "http://127.0.0.1:3100/a11y-violations",
      scanRelativeMs: 12,
      createId: () => "fixed-id",
    });

    assert.equal(result.issues.length, 2);
    assert.equal(result.issues[0]?.type, "ACCESSIBILITY_VIOLATION");
    assert.equal(result.issues[0]?.profile, "DESKTOP");
    assert.equal(result.issues[0]?.occurrenceCount, 8);
    assert.equal(result.issues[0]?.metadata.reportedNodeSampleCount, 3);
    assert.equal(result.issues[0]?.metadata.omittedNodeCount, 5);
    assert.equal(result.analysis.nodeEvidenceLimitReached, true);
    assert.equal(result.analysis.status, "PARTIAL");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("<button"), false);
    assert.equal(serialized.includes("secret="), false);
  });

  it("marks PARTIAL when analysisFailed", () => {
    const result = buildAccessibilityIssuesFromViolations({
      violations: [],
      config: testConfig(),
      finalPageUrl: "http://127.0.0.1:3100/a11y-clean",
      scanRelativeMs: 1,
      analysisFailed: true,
    });
    assert.equal(result.analysis.status, "PARTIAL");
    assert.equal(result.issues.length, 0);
  });
});

describe("Phase 6 summaries and capability status", () => {
  it("counts Phase 6 types and sorts stably", () => {
    const issues = sortDiagnosticIssues([
      baseIssue({ id: "a", type: "ACCESSIBILITY_VIOLATION", severity: "HIGH" }),
      baseIssue({
        id: "b",
        type: "MOBILE_OVERFLOW",
        severity: "HIGH",
        profile: "MOBILE",
      }),
      baseIssue({ id: "c", type: "BROKEN_IMAGE", severity: "MEDIUM" }),
      baseIssue({
        id: "d",
        type: "MOBILE_VIEWPORT",
        severity: "MEDIUM",
        profile: "MOBILE",
      }),
    ]);
    assert.equal(issues[0]?.type, "MOBILE_OVERFLOW");
    assert.equal(issues[1]?.type, "ACCESSIBILITY_VIOLATION");
    assert.equal(issues[2]?.type, "BROKEN_IMAGE");
    assert.equal(issues[3]?.type, "MOBILE_VIEWPORT");

    const summary = createTypeSummary(issues);
    assert.equal(summary.brokenImages, 1);
    assert.equal(summary.mobileLayoutIssues, 2);
    assert.equal(summary.accessibilityViolations, 1);
  });

  it("derives overall capability status", () => {
    assert.equal(
      deriveOverallDiagnosticStatus(
        {
          console: "NOT_REQUESTED",
          network: "NOT_REQUESTED",
          brokenImages: "NOT_REQUESTED",
          mobileLayout: "NOT_REQUESTED",
          accessibility: "NOT_REQUESTED",
          safeInteractions: "NOT_REQUESTED",
        },
        false,
      ),
      "NOT_REQUESTED",
    );
    assert.equal(
      deriveOverallDiagnosticStatus(
        {
          console: "COMPLETE",
          network: "NOT_REQUESTED",
          brokenImages: "COMPLETE",
          mobileLayout: "PARTIAL",
          accessibility: "COMPLETE",
          safeInteractions: "COMPLETE",
        },
        true,
      ),
      "PARTIAL",
    );
    assert.equal(
      deriveOverallDiagnosticStatus(
        {
          console: "COMPLETE",
          network: "COMPLETE",
          brokenImages: "COMPLETE",
          mobileLayout: "COMPLETE",
          accessibility: "COMPLETE",
          safeInteractions: "COMPLETE",
        },
        true,
      ),
      "COMPLETE",
    );
  });
});
