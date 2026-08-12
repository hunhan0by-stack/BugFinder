import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";
import { UNAVAILABLE_DIAGNOSTIC_URL } from "@/lib/scanner/diagnostics/sanitize-url";

const GENERIC_RESOURCE_CONSOLE =
  /^failed to load resource:\s*the server responded with a status of\s+\d+/i;

const ANALYTICS_HOST_HINT =
  /(google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.io|mixpanel)/i;

export type FilterDecision =
  | { action: "keep" }
  | { action: "ignore"; reason: string };

/**
 * Conservative noise filtering before issue creation.
 * ignoredEventCount counts candidate diagnostic events that were intentionally
 * discarded (not routine console.log traffic, which never becomes a candidate).
 */
export function filterRawDiagnosticEvent(
  event: RawDiagnosticEvent,
): FilterDecision {
  if (event.kind === "CONSOLE") {
    if (!event.message.trim()) {
      return { action: "ignore", reason: "empty-console-message" };
    }
    if (
      event.sourceUrl?.startsWith("chrome-extension:") ||
      event.sourceUrl?.startsWith("devtools:")
    ) {
      return { action: "ignore", reason: "browser-extension" };
    }
    if (GENERIC_RESOURCE_CONSOLE.test(event.message.trim())) {
      // Cross-channel preference: structured HTTP/request events win later.
      return { action: "ignore", reason: "generic-resource-console" };
    }
  }

  if (event.kind === "REQUEST_FAILED") {
    const reason = event.failureReason.toLowerCase();
    if (
      reason.includes("blockedbyclient") ||
      reason.includes("net::err_aborted")
    ) {
      // Intentional aborts are excluded earlier; remaining ERR_ABORTED is often
      // navigation replacement or shutdown noise.
      if (!event.isNavigationRequest) {
        return { action: "ignore", reason: "benign-aborted-request" };
      }
    }
    if (isFavicon(event.requestUrl, event.resourceType)) {
      return { action: "ignore", reason: "favicon" };
    }
  }

  if (event.kind === "HTTP_ERROR") {
    if (isFavicon(event.requestUrl, event.resourceType)) {
      return { action: "ignore", reason: "favicon" };
    }
    if (
      event.statusCode === 404 &&
      looksLikeOptionalThirdPartyAnalytics(event.requestUrl) &&
      !event.isNavigationRequest
    ) {
      return { action: "ignore", reason: "optional-third-party-analytics" };
    }
  }

  return { action: "keep" };
}

function isFavicon(url: string, resourceType: string): boolean {
  if (resourceType === "image" || resourceType === "other") {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      return pathname.endsWith("/favicon.ico") || pathname.endsWith("favicon.ico");
    } catch {
      return url.toLowerCase().includes("favicon.ico");
    }
  }
  return false;
}

function looksLikeOptionalThirdPartyAnalytics(url: string): boolean {
  if (url === UNAVAILABLE_DIAGNOSTIC_URL) {
    return false;
  }
  try {
    return ANALYTICS_HOST_HINT.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
