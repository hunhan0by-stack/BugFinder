import type { DiagnosticScope, Severity } from "@/types/scan";
import type { RawDiagnosticEvent } from "@/lib/scanner/diagnostics/raw-event-types";

/**
 * Conservative severity rules. Prefer under-calling severity over claiming
 * definite user-facing breakage.
 */
export function classifySeverity(
  event: RawDiagnosticEvent,
  scope: DiagnosticScope,
): Severity {
  if (event.kind === "PAGE_ERROR") {
    if (scope === "THIRD_PARTY") {
      return "MEDIUM";
    }
    return "HIGH";
  }

  if (event.kind === "CONSOLE") {
    if (scope === "THIRD_PARTY" || scope === "BROWSER") {
      return "LOW";
    }
    if (scope === "UNKNOWN") {
      return "INFO";
    }
    return "MEDIUM";
  }

  if (event.kind === "REQUEST_FAILED") {
    return classifyRequestFailureSeverity(event.resourceType, scope);
  }

  return classifyHttpSeverity(event.statusCode, event.resourceType, scope);
}

function classifyRequestFailureSeverity(
  resourceType: string,
  scope: DiagnosticScope,
): Severity {
  if (scope === "MAIN_DOCUMENT") {
    return "HIGH";
  }
  if (scope === "THIRD_PARTY") {
    if (resourceType === "script" || resourceType === "stylesheet") {
      return "LOW";
    }
    return "INFO";
  }
  if (resourceType === "xhr" || resourceType === "fetch") {
    return "HIGH";
  }
  if (resourceType === "script" || resourceType === "stylesheet") {
    return "HIGH";
  }
  if (resourceType === "image") {
    return "MEDIUM";
  }
  if (resourceType === "font") {
    return "LOW";
  }
  return "MEDIUM";
}

function classifyHttpSeverity(
  statusCode: number,
  resourceType: string,
  scope: DiagnosticScope,
): Severity {
  if (scope === "MAIN_DOCUMENT") {
    return "HIGH";
  }

  if (statusCode === 401 || statusCode === 403) {
    if (scope === "THIRD_PARTY") {
      return "INFO";
    }
    return "MEDIUM";
  }

  if (statusCode === 429) {
    return scope === "THIRD_PARTY" ? "INFO" : "MEDIUM";
  }

  if (statusCode >= 500) {
    if (scope === "THIRD_PARTY") {
      return resourceType === "script" ? "MEDIUM" : "LOW";
    }
    if (
      resourceType === "xhr" ||
      resourceType === "fetch" ||
      resourceType === "script" ||
      resourceType === "stylesheet"
    ) {
      return "HIGH";
    }
    return "MEDIUM";
  }

  // 4xx
  if (scope === "THIRD_PARTY") {
    return "LOW";
  }
  if (resourceType === "script" || resourceType === "stylesheet") {
    return statusCode === 404 ? "HIGH" : "MEDIUM";
  }
  if (resourceType === "xhr" || resourceType === "fetch") {
    return statusCode === 404 ? "MEDIUM" : "MEDIUM";
  }
  if (resourceType === "image") {
    return "MEDIUM";
  }
  return "MEDIUM";
}
