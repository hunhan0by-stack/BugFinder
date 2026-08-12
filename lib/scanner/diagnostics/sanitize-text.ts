/**
 * Pure text sanitation for diagnostic evidence. Safe for unit tests without
 * Playwright.
 */

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*[A-Za-z]/g;
const PATH_LEAK_PATTERNS: RegExp[] = [
  /[A-Za-z]:\\(?:Users|Program Files|Windows)[^\\\s"']*/gi,
  /\/(?:Users|home)\/[^\s"']+/gi,
  /playwright[-_]?browsers?[^\s"']*/gi,
];

export type SanitizeTextResult = {
  text: string;
  truncated: boolean;
};

export function sanitizeDiagnosticText(
  raw: string,
  maxLength: number,
): SanitizeTextResult {
  let text = raw.replace(ANSI_ESCAPE_PATTERN, "");
  text = text.replace(CONTROL_CHAR_PATTERN, " ");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.trim();

  for (const pattern of PATH_LEAK_PATTERNS) {
    text = text.replace(pattern, "[redacted-path]");
  }

  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  const marker = "… [truncated]";
  const keep = Math.max(0, maxLength - marker.length);
  return {
    text: `${text.slice(0, keep)}${marker}`,
    truncated: true,
  };
}
