import type {
  DiagnosticIssue,
  DiagnosticIssueType,
  DiagnosticScope,
  Severity,
} from "@/types/scan";
import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import {
  sanitizeDiagnosticUrl,
  UNAVAILABLE_DIAGNOSTIC_URL,
} from "@/lib/scanner/diagnostics/sanitize-url";

export type CreateIssueInput = {
  event: RawDiagnosticEvent;
  scope: DiagnosticScope;
  severity: Severity;
  confidence: number;
  occurrenceCount: number;
  firstSeenMs: number;
  lastSeenMs: number;
  pageUrl: string;
  maxEvidenceLength: number;
  maxUrlLength: number;
  id: string;
};

export function createDiagnosticIssue(input: CreateIssueInput): DiagnosticIssue {
  const pageUrl = sanitizeDiagnosticUrl(input.pageUrl, input.maxUrlLength);
  const built = buildCopy(input.event, input.scope, input.maxEvidenceLength, input.maxUrlLength);

  return {
    id: input.id,
    type: built.type,
    severity: input.severity,
    confidence: input.confidence,
    title: built.title,
    description: built.description,
    observedBehavior: built.observedBehavior,
    potentialUserImpact: built.potentialUserImpact,
    technicalEvidence: built.technicalEvidence,
    suggestedInvestigation: built.suggestedInvestigation,
    scope: input.scope,
    profile: "DESKTOP",
    pageUrl,
    resourceUrl: built.resourceUrl,
    sourceLocation: built.sourceLocation,
    occurrenceCount: input.occurrenceCount,
    firstSeenMs: input.firstSeenMs,
    lastSeenMs: input.lastSeenMs,
    metadata: built.metadata,
  };
}

function buildCopy(
  event: RawDiagnosticEvent,
  scope: DiagnosticScope,
  maxEvidenceLength: number,
  maxUrlLength: number,
): {
  type: DiagnosticIssueType;
  title: string;
  description: string;
  observedBehavior: string;
  potentialUserImpact: string;
  technicalEvidence: string;
  suggestedInvestigation: string;
  resourceUrl?: string;
  sourceLocation?: DiagnosticIssue["sourceLocation"];
  metadata: Record<string, string | number | boolean | null>;
} {
  if (event.kind === "CONSOLE") {
    const sourceUrl = event.sourceUrl
      ? sanitizeDiagnosticUrl(event.sourceUrl, maxUrlLength)
      : undefined;
    const evidenceParts = [
      event.message,
      sourceUrl && sourceUrl !== UNAVAILABLE_DIAGNOSTIC_URL
        ? `Source: ${sourceUrl}`
        : null,
      event.lineNumber !== undefined ? `Line: ${event.lineNumber}` : null,
      event.columnNumber !== undefined ? `Column: ${event.columnNumber}` : null,
    ].filter(Boolean);
    const evidence = sanitizeDiagnosticText(
      evidenceParts.join("\n"),
      maxEvidenceLength,
    ).text;

    return {
      type: "CONSOLE_ERROR",
      title: "JavaScript console error",
      description:
        "The browser console recorded an error while the page was loading or running.",
      observedBehavior: `The browser console produced the message “${truncateInline(event.message, 240)}”.`,
      potentialUserImpact:
        scope === "THIRD_PARTY"
          ? "If this message belongs to a third-party script, the impact on the main interface may be limited."
          : "If this message belongs to the main application, part of the interface may fail to render or respond correctly.",
      technicalEvidence: evidence,
      suggestedInvestigation:
        "Inspect the referenced script location and confirm that required values exist before they are accessed.",
      resourceUrl: sourceUrl,
      sourceLocation:
        sourceUrl || event.lineNumber !== undefined
          ? {
              url: sourceUrl,
              lineNumber: event.lineNumber,
              columnNumber: event.columnNumber,
            }
          : undefined,
      metadata: {
        consoleType: event.consoleType,
      },
    };
  }

  if (event.kind === "PAGE_ERROR") {
    const evidence = sanitizeDiagnosticText(
      [
        `${event.name}: ${event.message}`,
        event.stack ? `Stack:\n${event.stack}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      maxEvidenceLength,
    ).text;

    return {
      type: "PAGE_ERROR",
      title: "Uncaught JavaScript exception",
      description:
        "An uncaught JavaScript exception was thrown while the page was loading or running.",
      observedBehavior: `The page threw “${truncateInline(`${event.name}: ${event.message}`, 240)}”.`,
      potentialUserImpact:
        "This exception may prevent part of the page from rendering or responding correctly.",
      technicalEvidence: evidence,
      suggestedInvestigation:
        "Reproduce the page load, inspect the top stack frame, and verify the failing code path handles missing values safely.",
      metadata: {
        errorName: event.name,
        hasStack: Boolean(event.stack),
      },
    };
  }

  if (event.kind === "REQUEST_FAILED") {
    const resourceUrl = sanitizeDiagnosticUrl(event.requestUrl, maxUrlLength);
    const evidence = sanitizeDiagnosticText(
      `${event.method} ${resourceUrl} failed with ${event.failureReason}.`,
      maxEvidenceLength,
    ).text;

    return {
      type: "REQUEST_FAILED",
      title: scopeLabelPrefix(scope) + "request failed before a response",
      description:
        "The browser could not complete this request. No HTTP status was available for the failure.",
      observedBehavior: `${event.method} ${resourceUrl} failed before receiving an HTTP response.`,
      potentialUserImpact:
        scope === "THIRD_PARTY"
          ? "A third-party resource may be unavailable. The effect on the main page depends on whether the application requires that resource."
          : "Related page content or behavior may be missing or degraded until the request succeeds.",
      technicalEvidence: evidence,
      suggestedInvestigation:
        "Confirm network connectivity for the resource, inspect the failure reason, and verify frontend error handling for unavailable responses.",
      resourceUrl,
      metadata: {
        method: event.method,
        resourceType: event.resourceType,
        failureReason: event.failureReason,
        isNavigationRequest: event.isNavigationRequest,
      },
    };
  }

  const resourceUrl = sanitizeDiagnosticUrl(event.requestUrl, maxUrlLength);
  const authRelated = event.statusCode === 401 || event.statusCode === 403;
  const evidence = sanitizeDiagnosticText(
    `${event.method} ${resourceUrl} returned HTTP ${event.statusCode}${event.statusText ? ` ${event.statusText}` : ""}.`,
    maxEvidenceLength,
  ).text;

  return {
    type: "HTTP_ERROR",
    title: `${scopeLabelPrefix(scope)}resource returned HTTP ${event.statusCode}`,
    description: authRelated
      ? "The request received an authorization-related HTTP response. This may be expected for protected resources."
      : "A request from the page received an HTTP error response.",
    observedBehavior: `${event.method} ${resourceUrl} returned HTTP ${event.statusCode}.`,
    potentialUserImpact: authRelated
      ? "If this resource is supposed to be public, users may be unable to load related content. If it is protected, the response may be expected."
      : "The page may be unable to load or update the related information.",
    technicalEvidence: evidence,
    suggestedInvestigation: authRelated
      ? "Verify whether the resource is intentionally protected and whether the page handles unauthorized responses clearly."
      : "Inspect the server endpoint and the frontend error-handling path. Confirm that users receive an understandable error state.",
    resourceUrl,
    metadata: {
      method: event.method,
      resourceType: event.resourceType,
      statusCode: event.statusCode,
      statusText: event.statusText,
      contentType: event.contentType ?? null,
      isNavigationRequest: event.isNavigationRequest,
    },
  };
}

function scopeLabelPrefix(scope: DiagnosticScope): string {
  if (scope === "MAIN_DOCUMENT") return "Main document ";
  if (scope === "SAME_ORIGIN") return "Same-origin ";
  if (scope === "THIRD_PARTY") return "Third-party ";
  return "";
}

function truncateInline(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
