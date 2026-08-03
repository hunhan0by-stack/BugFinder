/**
 * Builds a download filename from the configured target hostname only.
 * Never uses the full URL.
 */
export function basicScanExportFileName(targetUrl: string): string {
  let hostname = "";
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    hostname = "";
  }

  const slug = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (!slug) {
    return "frontend-bug-finder-basic-scan-report.json";
  }

  return `frontend-bug-finder-basic-scan-${slug}.json`;
}
