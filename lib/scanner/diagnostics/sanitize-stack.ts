import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { redactUrlsInsideText } from "@/lib/scanner/diagnostics/sanitize-url";

export type SanitizeStackResult = {
  stack: string;
  truncated: boolean;
  topFrame?: string;
};

/**
 * Sanitizes page-error stack traces for public evidence.
 */
export function sanitizeStack(
  rawStack: string | undefined,
  maxLength: number,
): SanitizeStackResult {
  if (!rawStack || rawStack.trim() === "") {
    return { stack: "", truncated: false };
  }

  const redacted = redactUrlsInsideText(rawStack);
  const sanitized = sanitizeDiagnosticText(redacted, maxLength);
  const topFrame = extractTopFrame(sanitized.text);

  return {
    stack: sanitized.text,
    truncated: sanitized.truncated,
    topFrame,
  };
}

function extractTopFrame(stack: string): string | undefined {
  const lines = stack.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^at\s+/i.test(line) || line.includes("://") || line.includes("(")) {
      return line.slice(0, 400);
    }
  }
  return lines[1]?.slice(0, 400);
}
