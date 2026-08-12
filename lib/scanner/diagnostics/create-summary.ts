import type {
  DiagnosticCapabilityStatuses,
  DiagnosticIssue,
  DiagnosticSeveritySummary,
  DiagnosticStatus,
  DiagnosticTypeSummary,
  Severity,
} from "@/types/scan";

const SEVERITY_ORDER: Record<Severity, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  INFO: 3,
};

const TYPE_ORDER: Record<DiagnosticIssue["type"], number> = {
  PAGE_ERROR: 0,
  CONSOLE_ERROR: 1,
  REQUEST_FAILED: 2,
  HTTP_ERROR: 3,
  BROKEN_IMAGE: 4,
  DEAD_CLICK: 5,
  OBSTRUCTED_CONTROL: 6,
  FORM_STATE_ISSUE: 7,
  MOBILE_VIEWPORT: 8,
  MOBILE_OVERFLOW: 9,
  ACCESSIBILITY_VIOLATION: 10,
};

/**
 * Sorts a copy of issues: severity, then type, preserving first-seen order
 * within equal groups.
 */
export function sortDiagnosticIssues(
  issues: readonly DiagnosticIssue[],
): DiagnosticIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const severityDelta =
        SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity];
      if (severityDelta !== 0) return severityDelta;
      const typeDelta = TYPE_ORDER[a.issue.type] - TYPE_ORDER[b.issue.type];
      if (typeDelta !== 0) return typeDelta;
      return a.index - b.index;
    })
    .map((entry) => entry.issue);
}

export function createSeveritySummary(
  issues: readonly DiagnosticIssue[],
): DiagnosticSeveritySummary {
  const summary: DiagnosticSeveritySummary = {
    total: issues.length,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const issue of issues) {
    if (issue.severity === "HIGH") summary.high += 1;
    else if (issue.severity === "MEDIUM") summary.medium += 1;
    else if (issue.severity === "LOW") summary.low += 1;
    else summary.info += 1;
  }
  return summary;
}

/** Type counts are grouped-issue counts, not raw event occurrences. */
export function createTypeSummary(
  issues: readonly DiagnosticIssue[],
): DiagnosticTypeSummary {
  const summary: DiagnosticTypeSummary = {
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
  };
  for (const issue of issues) {
    if (issue.type === "CONSOLE_ERROR") summary.consoleErrors += 1;
    else if (issue.type === "PAGE_ERROR") summary.pageErrors += 1;
    else if (issue.type === "REQUEST_FAILED") summary.failedRequests += 1;
    else if (issue.type === "HTTP_ERROR") summary.httpErrors += 1;
    else if (issue.type === "BROKEN_IMAGE") summary.brokenImages += 1;
    else if (
      issue.type === "MOBILE_OVERFLOW" ||
      issue.type === "MOBILE_VIEWPORT"
    ) {
      summary.mobileLayoutIssues += 1;
    } else if (issue.type === "ACCESSIBILITY_VIOLATION") {
      summary.accessibilityViolations += 1;
    } else if (issue.type === "DEAD_CLICK") {
      summary.deadClicks += 1;
    } else if (issue.type === "OBSTRUCTED_CONTROL") {
      summary.obstructedControls += 1;
    } else if (issue.type === "FORM_STATE_ISSUE") {
      summary.formStateIssues += 1;
    }
  }
  return summary;
}

/** Overall diagnostics status from capability statuses. */
export function deriveOverallDiagnosticStatus(
  capabilities: DiagnosticCapabilityStatuses,
  anyDiagnosticRequested: boolean,
): DiagnosticStatus {
  if (!anyDiagnosticRequested) {
    return "NOT_REQUESTED";
  }
  const requested = Object.values(capabilities).filter(
    (status) => status !== "NOT_REQUESTED",
  );
  if (requested.some((status) => status === "PARTIAL")) {
    return "PARTIAL";
  }
  return "COMPLETE";
}
