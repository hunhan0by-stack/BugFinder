import type { DiagnosticScope } from "@/types/scan";
import { UNAVAILABLE_DIAGNOSTIC_URL } from "@/lib/scanner/diagnostics/sanitize-url";

export type ScopeClassificationInput = {
  eventUrl?: string;
  finalPageUrl: string;
  isNavigationRequest?: boolean;
  isMainFrameRequest?: boolean;
};

/**
 * Classifies diagnostic events relative to the final page origin.
 * Origin includes protocol, hostname, and effective port.
 */
export function classifyDiagnosticScope(
  input: ScopeClassificationInput,
): DiagnosticScope {
  if (input.isNavigationRequest && input.isMainFrameRequest) {
    return "MAIN_DOCUMENT";
  }

  const eventUrl = input.eventUrl?.trim();
  if (!eventUrl || eventUrl === UNAVAILABLE_DIAGNOSTIC_URL) {
    return "UNKNOWN";
  }

  if (
    eventUrl.startsWith("chrome-extension:") ||
    eventUrl.startsWith("devtools:") ||
    eventUrl.startsWith("chrome:")
  ) {
    return "BROWSER";
  }

  let eventOrigin: string;
  let pageOrigin: string;
  try {
    eventOrigin = new URL(eventUrl).origin;
    pageOrigin = new URL(input.finalPageUrl).origin;
  } catch {
    return "UNKNOWN";
  }

  if (eventOrigin === pageOrigin) {
    if (input.isMainFrameRequest && input.isNavigationRequest) {
      return "MAIN_DOCUMENT";
    }
    return "SAME_ORIGIN";
  }

  return "THIRD_PARTY";
}
