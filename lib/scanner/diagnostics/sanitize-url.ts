/**
 * Public diagnostic URL sanitation. Never returns credentials, query strings,
 * or fragments.
 */

export const UNAVAILABLE_DIAGNOSTIC_URL = "Unavailable diagnostic URL";

export function sanitizeDiagnosticUrl(
  rawUrl: string | undefined | null,
  maxLength: number,
): string {
  if (!rawUrl || rawUrl.trim() === "") {
    return UNAVAILABLE_DIAGNOSTIC_URL;
  }

  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith("chrome-extension:") ||
    trimmed.startsWith("devtools:") ||
    trimmed.startsWith("chrome:")
  ) {
    return UNAVAILABLE_DIAGNOSTIC_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return `${parsed.protocol}//[inline-resource]`.slice(0, maxLength);
    }

    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";

    let result = parsed.toString();
    if (result.length > maxLength) {
      result = `${result.slice(0, Math.max(0, maxLength - 15))}… [truncated]`;
    }
    return result;
  } catch {
    return UNAVAILABLE_DIAGNOSTIC_URL;
  }
}

/**
 * Redacts query/fragment/credentials inside free-form stack text without
 * requiring every line to be a complete URL.
 */
export function redactUrlsInsideText(raw: string): string {
  return raw.replace(
    /\b((?:https?|file):\/\/[^\s)\]}'"]+)/gi,
    (match) => {
      try {
        const parsed = new URL(match);
        parsed.username = "";
        parsed.password = "";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return "[unparseable-url]";
      }
    },
  );
}
