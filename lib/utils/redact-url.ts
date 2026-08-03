/**
 * Redacts credentials, query strings, and fragments from URLs before logging.
 * Safe for server logs only — still do not put secrets in the pathname.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[unparseable-url]";
  }
}

export function redactHostname(rawHostname: string): string {
  return rawHostname.replace(/[\r\n\t]/g, "").slice(0, 253);
}
