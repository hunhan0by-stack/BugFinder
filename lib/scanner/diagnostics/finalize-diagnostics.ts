import type { DiagnosticIssue } from "@/types/scan";
import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";
import { classifyDiagnosticScope } from "@/lib/scanner/diagnostics/classify-scope";
import { classifySeverity } from "@/lib/scanner/diagnostics/classify-severity";
import { classifyConfidence } from "@/lib/scanner/diagnostics/classify-confidence";
import { createDiagnosticIssue } from "@/lib/scanner/diagnostics/create-issue";
import { filterRawDiagnosticEvent } from "@/lib/scanner/diagnostics/filter-event";
import {
  createSeveritySummary,
  createTypeSummary,
  sortDiagnosticIssues,
} from "@/lib/scanner/diagnostics/create-summary";
import type { DiagnosticResult } from "@/types/scan";

export type FinalizeDiagnosticsInput = {
  events: readonly RawDiagnosticEvent[];
  finalPageUrl: string;
  collectConsoleErrors: boolean;
  collectNetworkErrors: boolean;
  maxIssues: number;
  maxEvidenceLength: number;
  maxUrlLength: number;
  droppedEventCount: number;
  ignoredEventCount: number;
  messageTruncationOccurred: boolean;
  stackTruncationOccurred: boolean;
  markedPartial: boolean;
  partialReasons: string[];
  createId?: () => string;
};

export type GroupState = {
  key: string;
  event: RawDiagnosticEvent;
  occurrenceCount: number;
  firstSeenMs: number;
  lastSeenMs: number;
};

export function groupingKey(event: RawDiagnosticEvent): string {
  if (event.kind === "CONSOLE") {
    return [
      "CONSOLE",
      event.message,
      event.sourceUrl ?? "",
      String(event.lineNumber ?? ""),
      String(event.columnNumber ?? ""),
    ].join("|");
  }
  if (event.kind === "PAGE_ERROR") {
    return [
      "PAGE_ERROR",
      event.name,
      event.message,
      event.topFrame ?? "",
    ].join("|");
  }
  if (event.kind === "REQUEST_FAILED") {
    return [
      "REQUEST_FAILED",
      event.method,
      event.requestUrl,
      event.resourceType,
      normalizeFailureReason(event.failureReason),
    ].join("|");
  }
  return [
    "HTTP_ERROR",
    event.method,
    event.requestUrl,
    event.resourceType,
    String(event.statusCode),
  ].join("|");
}

function normalizeFailureReason(reason: string): string {
  return reason.replace(/^net::/i, "net::").trim().toLowerCase();
}

/**
 * Filters, deduplicates, classifies, and summarizes diagnostic events into
 * the public DiagnosticResult.
 */
export function finalizeDiagnostics(
  input: FinalizeDiagnosticsInput,
): DiagnosticResult {
  if (!input.collectConsoleErrors && !input.collectNetworkErrors) {
    return emptyNotRequested();
  }

  let ignored = input.ignoredEventCount;
  const groups = new Map<string, GroupState>();
  let issueLimitReached = false;

  for (const event of input.events) {
    if (event.kind === "CONSOLE" || event.kind === "PAGE_ERROR") {
      if (!input.collectConsoleErrors) continue;
    } else if (!input.collectNetworkErrors) {
      continue;
    }

    const filter = filterRawDiagnosticEvent(event);
    if (filter.action === "ignore") {
      ignored += 1;
      continue;
    }

    const key = groupingKey(event);
    const existing = groups.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.firstSeenMs = Math.min(existing.firstSeenMs, event.timestampMs);
      existing.lastSeenMs = Math.max(existing.lastSeenMs, event.timestampMs);
      continue;
    }

    if (groups.size >= input.maxIssues) {
      issueLimitReached = true;
      continue;
    }

    groups.set(key, {
      key,
      event,
      occurrenceCount: 1,
      firstSeenMs: event.timestampMs,
      lastSeenMs: event.timestampMs,
    });
  }

  // Dropped unique groups beyond the issue limit are counted as dropped events.
  let dropped = input.droppedEventCount;
  if (issueLimitReached) {
    // Approximate remaining unique drops as at least one notice trigger.
    dropped += 1;
  }

  const createId = input.createId ?? (() => crypto.randomUUID());
  const issues: DiagnosticIssue[] = [];

  for (const group of groups.values()) {
    const scope = classifyDiagnosticScope({
      eventUrl:
        group.event.kind === "CONSOLE"
          ? group.event.sourceUrl
          : group.event.kind === "PAGE_ERROR"
            ? undefined
            : group.event.requestUrl,
      finalPageUrl: input.finalPageUrl,
      isNavigationRequest:
        group.event.kind === "REQUEST_FAILED" || group.event.kind === "HTTP_ERROR"
          ? group.event.isNavigationRequest
          : false,
      isMainFrameRequest:
        group.event.kind === "REQUEST_FAILED" || group.event.kind === "HTTP_ERROR"
          ? group.event.isMainFrameRequest
          : false,
    });
    const severity = classifySeverity(group.event, scope);
    const confidence = classifyConfidence(
      group.event,
      scope,
      group.occurrenceCount,
    );
    issues.push(
      createDiagnosticIssue({
        event: group.event,
        scope,
        severity,
        confidence,
        occurrenceCount: group.occurrenceCount,
        firstSeenMs: Math.round(group.firstSeenMs),
        lastSeenMs: Math.round(group.lastSeenMs),
        pageUrl: input.finalPageUrl,
        maxEvidenceLength: input.maxEvidenceLength,
        maxUrlLength: input.maxUrlLength,
        id: createId(),
      }),
    );
  }

  const sorted = sortDiagnosticIssues(issues);
  const rawEventLimitReached = input.droppedEventCount > 0;
  const partial =
    input.markedPartial ||
    rawEventLimitReached ||
    issueLimitReached ||
    input.partialReasons.length > 0;

  const notices: string[] = [];
  if (partial) {
    notices.push(
      "Some diagnostic events may be missing because the collection limit was reached or a diagnostic collector could not complete.",
    );
  }
  for (const reason of input.partialReasons) {
    notices.push(reason);
  }
  if (rawEventLimitReached) {
    notices.push(
      "The scanner reached the maximum number of raw diagnostic events for this scan.",
    );
  }
  if (issueLimitReached) {
    notices.push(
      "The scanner reached the maximum number of grouped diagnostic issues for this scan.",
    );
  }
  if (sorted.length === 0) {
    notices.push(
      "No reportable console or network diagnostic events were captured during this single page load.",
    );
    notices.push(
      "This does not prove that the page is bug-free. Some problems require specific user actions, longer sessions, different devices, or manual testing.",
    );
  }

  return {
    status: partial ? "PARTIAL" : "COMPLETE",
    capabilities: {
      console: input.collectConsoleErrors
        ? partial
          ? "PARTIAL"
          : "COMPLETE"
        : "NOT_REQUESTED",
      network: input.collectNetworkErrors
        ? partial
          ? "PARTIAL"
          : "COMPLETE"
        : "NOT_REQUESTED",
      brokenImages: "NOT_REQUESTED",
      mobileLayout: "NOT_REQUESTED",
      accessibility: "NOT_REQUESTED",
      safeInteractions: "NOT_REQUESTED",
      issueEvidence: "NOT_REQUESTED",
      reversibleWorkflows: "NOT_REQUESTED",
    },
    issues: sorted,
    severitySummary: createSeveritySummary(sorted),
    typeSummary: createTypeSummary(sorted),
    capturedEventCount: input.events.length,
    groupedIssueCount: sorted.length,
    ignoredEventCount: ignored,
    droppedEventCount: dropped,
    limits: {
      rawEventLimitReached,
      issueLimitReached,
      messageTruncationOccurred: input.messageTruncationOccurred,
      stackTruncationOccurred: input.stackTruncationOccurred,
    },
    notices: Array.from(new Set(notices)),
  };
}

function emptyNotRequested(): DiagnosticResult {
  return {
    status: "NOT_REQUESTED",
    capabilities: {
      console: "NOT_REQUESTED",
      network: "NOT_REQUESTED",
      brokenImages: "NOT_REQUESTED",
      mobileLayout: "NOT_REQUESTED",
      accessibility: "NOT_REQUESTED",
      safeInteractions: "NOT_REQUESTED",
      issueEvidence: "NOT_REQUESTED",
      reversibleWorkflows: "NOT_REQUESTED",
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
      stateTransitionIssues: 0,
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
  };
}
