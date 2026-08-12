import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDiagnosticScope } from "@/lib/scanner/diagnostics/classify-scope";
import { classifySeverity } from "@/lib/scanner/diagnostics/classify-severity";
import { classifyConfidence } from "@/lib/scanner/diagnostics/classify-confidence";
import { finalizeDiagnostics } from "@/lib/scanner/diagnostics/finalize-diagnostics";
import { filterRawDiagnosticEvent } from "@/lib/scanner/diagnostics/filter-event";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeStack } from "@/lib/scanner/diagnostics/sanitize-stack";
import {
  sanitizeDiagnosticUrl,
  UNAVAILABLE_DIAGNOSTIC_URL,
} from "@/lib/scanner/diagnostics/sanitize-url";
import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";

describe("sanitizeDiagnosticText", () => {
  it("removes control characters and truncates", () => {
    const result = sanitizeDiagnosticText("hello\u0000world", 8);
    assert.equal(result.truncated, true);
    assert.match(result.text, /truncated/);
  });
});

describe("sanitizeDiagnosticUrl", () => {
  it("removes credentials query and fragment", () => {
    assert.equal(
      sanitizeDiagnosticUrl(
        "https://user:pass@example.com/path?token=secret#frag",
        1000,
      ),
      "https://example.com/path",
    );
  });

  it("returns a safe placeholder for unparseable values", () => {
    assert.equal(sanitizeDiagnosticUrl("not a url", 1000), UNAVAILABLE_DIAGNOSTIC_URL);
  });
});

describe("sanitizeStack", () => {
  it("redacts query strings inside stack URLs", () => {
    const result = sanitizeStack(
      "Error\n    at foo (https://example.com/app.js?token=secret:10:2)",
      8000,
    );
    assert.equal(result.stack.includes("token=secret"), false);
    assert.match(result.stack, /example\.com\/app\.js/);
  });
});

describe("classifyDiagnosticScope", () => {
  it("classifies same-origin and third-party by full origin", () => {
    assert.equal(
      classifyDiagnosticScope({
        eventUrl: "https://example.com:443/api",
        finalPageUrl: "https://example.com/page",
      }),
      "SAME_ORIGIN",
    );
    assert.equal(
      classifyDiagnosticScope({
        eventUrl: "https://cdn.example.net/a.js",
        finalPageUrl: "https://example.com/page",
      }),
      "THIRD_PARTY",
    );
    assert.equal(
      classifyDiagnosticScope({
        eventUrl: "https://example.com/",
        finalPageUrl: "https://example.com/",
        isNavigationRequest: true,
        isMainFrameRequest: true,
      }),
      "MAIN_DOCUMENT",
    );
  });
});

describe("filterRawDiagnosticEvent", () => {
  it("ignores generic resource-load console messages", () => {
    const decision = filterRawDiagnosticEvent({
      kind: "CONSOLE",
      consoleType: "error",
      message: "Failed to load resource: the server responded with a status of 404",
      timestampMs: 1,
      messageTruncated: false,
    });
    assert.equal(decision.action, "ignore");
  });

  it("ignores favicon HTTP 404", () => {
    const decision = filterRawDiagnosticEvent({
      kind: "HTTP_ERROR",
      method: "GET",
      resourceType: "image",
      requestUrl: "https://example.com/favicon.ico",
      statusCode: 404,
      statusText: "Not Found",
      isNavigationRequest: false,
      isMainFrameRequest: false,
      timestampMs: 1,
    });
    assert.equal(decision.action, "ignore");
  });
});

describe("classifySeverity and confidence", () => {
  it("rates page errors high by default", () => {
    const event: RawDiagnosticEvent = {
      kind: "PAGE_ERROR",
      name: "Error",
      message: "boom",
      timestampMs: 1,
      messageTruncated: false,
      stackTruncated: false,
    };
    assert.equal(classifySeverity(event, "SAME_ORIGIN"), "HIGH");
    assert.ok(classifyConfidence(event, "SAME_ORIGIN", 1) >= 90);
  });

  it("rates third-party console errors conservatively", () => {
    const event: RawDiagnosticEvent = {
      kind: "CONSOLE",
      consoleType: "error",
      message: "third party",
      timestampMs: 1,
      messageTruncated: false,
    };
    assert.equal(classifySeverity(event, "THIRD_PARTY"), "LOW");
  });
});

describe("finalizeDiagnostics", () => {
  it("returns NOT_REQUESTED when both options are off", () => {
    const result = finalizeDiagnostics({
      events: [],
      finalPageUrl: "https://example.com/",
      collectConsoleErrors: false,
      collectNetworkErrors: false,
      maxIssues: 100,
      maxEvidenceLength: 4000,
      maxUrlLength: 1000,
      droppedEventCount: 0,
      ignoredEventCount: 0,
      messageTruncationOccurred: false,
      stackTruncationOccurred: false,
      markedPartial: false,
      partialReasons: [],
    });
    assert.equal(result.status, "NOT_REQUESTED");
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.typeSummary, {
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
    });
    assert.deepEqual(result.capabilities, {
      console: "NOT_REQUESTED",
      network: "NOT_REQUESTED",
      brokenImages: "NOT_REQUESTED",
      mobileLayout: "NOT_REQUESTED",
      accessibility: "NOT_REQUESTED",
      safeInteractions: "NOT_REQUESTED",
    });
  });

  it("groups duplicate console errors", () => {
    const events: RawDiagnosticEvent[] = [
      {
        kind: "CONSOLE",
        consoleType: "error",
        message: "Fixture console error",
        sourceUrl: "https://example.com/a.js",
        lineNumber: 1,
        columnNumber: 1,
        timestampMs: 10,
        messageTruncated: false,
      },
      {
        kind: "CONSOLE",
        consoleType: "error",
        message: "Fixture console error",
        sourceUrl: "https://example.com/a.js",
        lineNumber: 1,
        columnNumber: 1,
        timestampMs: 20,
        messageTruncated: false,
      },
      {
        kind: "CONSOLE",
        consoleType: "error",
        message: "Fixture console error",
        sourceUrl: "https://example.com/a.js",
        lineNumber: 1,
        columnNumber: 1,
        timestampMs: 30,
        messageTruncated: false,
      },
    ];
    const result = finalizeDiagnostics({
      events,
      finalPageUrl: "https://example.com/",
      collectConsoleErrors: true,
      collectNetworkErrors: false,
      maxIssues: 100,
      maxEvidenceLength: 4000,
      maxUrlLength: 1000,
      droppedEventCount: 0,
      ignoredEventCount: 0,
      messageTruncationOccurred: false,
      stackTruncationOccurred: false,
      markedPartial: false,
      partialReasons: [],
      createId: () => "fixed-id",
    });
    assert.equal(result.status, "COMPLETE");
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.occurrenceCount, 3);
    assert.equal(result.issues[0]?.firstSeenMs, 10);
    assert.equal(result.issues[0]?.lastSeenMs, 30);
    assert.equal(result.issues[0]?.profile, "DESKTOP");
    assert.equal(result.severitySummary.total, 1);
  });

  it("marks PARTIAL when raw events were dropped", () => {
    const result = finalizeDiagnostics({
      events: [
        {
          kind: "CONSOLE",
          consoleType: "error",
          message: "one",
          timestampMs: 1,
          messageTruncated: false,
        },
      ],
      finalPageUrl: "https://example.com/",
      collectConsoleErrors: true,
      collectNetworkErrors: false,
      maxIssues: 100,
      maxEvidenceLength: 4000,
      maxUrlLength: 1000,
      droppedEventCount: 5,
      ignoredEventCount: 0,
      messageTruncationOccurred: false,
      stackTruncationOccurred: false,
      markedPartial: false,
      partialReasons: [],
      createId: () => "id-1",
    });
    assert.equal(result.status, "PARTIAL");
    assert.ok(result.droppedEventCount >= 5);
  });

  it("keeps HTTP errors and suppresses generic resource console noise", () => {
    const result = finalizeDiagnostics({
      events: [
        {
          kind: "CONSOLE",
          consoleType: "error",
          message:
            "Failed to load resource: the server responded with a status of 404",
          timestampMs: 1,
          messageTruncated: false,
        },
        {
          kind: "HTTP_ERROR",
          method: "GET",
          resourceType: "script",
          requestUrl: "https://example.com/missing.js",
          statusCode: 404,
          statusText: "Not Found",
          isNavigationRequest: false,
          isMainFrameRequest: false,
          timestampMs: 2,
        },
      ],
      finalPageUrl: "https://example.com/",
      collectConsoleErrors: true,
      collectNetworkErrors: true,
      maxIssues: 100,
      maxEvidenceLength: 4000,
      maxUrlLength: 1000,
      droppedEventCount: 0,
      ignoredEventCount: 0,
      messageTruncationOccurred: false,
      stackTruncationOccurred: false,
      markedPartial: false,
      partialReasons: [],
      createId: () => "http-1",
    });
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.type, "HTTP_ERROR");
    assert.equal(result.issues[0]?.profile, "DESKTOP");
    assert.ok(result.ignoredEventCount >= 1);
  });
});
