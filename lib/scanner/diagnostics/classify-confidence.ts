import type { DiagnosticScope } from "@/types/scan";
import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";

/**
 * Confidence reflects technical evidence strength, not user-impact certainty.
 */
export function classifyConfidence(
  event: RawDiagnosticEvent,
  scope: DiagnosticScope,
  occurrenceCount: number,
): number {
  let confidence: number;

  if (event.kind === "PAGE_ERROR") {
    confidence = event.stack ? 98 : 92;
    if (scope === "THIRD_PARTY" || scope === "UNKNOWN") {
      confidence = Math.min(confidence, 90);
    }
  } else if (event.kind === "HTTP_ERROR") {
    confidence = 98;
    if (scope === "THIRD_PARTY") {
      confidence = 95;
    }
  } else if (event.kind === "REQUEST_FAILED") {
    confidence = scope === "SAME_ORIGIN" || scope === "MAIN_DOCUMENT" ? 95 : 85;
    if (/unknown|aborted/i.test(event.failureReason)) {
      confidence = Math.min(confidence, 80);
    }
  } else {
    // CONSOLE
    if (scope === "SAME_ORIGIN" || scope === "MAIN_DOCUMENT") {
      confidence = event.sourceUrl ? 90 : 80;
    } else if (scope === "THIRD_PARTY" || scope === "BROWSER") {
      confidence = 70;
    } else {
      confidence = 65;
    }
  }

  if (occurrenceCount >= 3) {
    confidence = Math.min(100, confidence + 2);
  }

  return Math.max(0, Math.min(100, Math.round(confidence)));
}
