import type { BasicPageMetadata } from "@/types/scan";

function formatMaybe(value: string | number | null): string {
  if (value === null || value === "") {
    return "Unavailable";
  }
  return String(value);
}

export default function BasicScanMetadata({
  page,
  durationMs,
}: {
  page: BasicPageMetadata;
  durationMs: number;
}) {
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Requested URL", value: page.requestedUrl, mono: true },
    { label: "Final URL", value: page.finalUrl, mono: true },
    { label: "Page title", value: page.title || "(empty title)" },
    {
      label: "Main HTTP status",
      value:
        page.statusCode === null
          ? "Unavailable"
          : `${page.statusCode}${page.statusText ? ` ${page.statusText}` : ""}`,
    },
    { label: "Content type", value: formatMaybe(page.contentType) },
    { label: "Redirect count", value: String(page.redirectCount) },
    {
      label: "Navigation time",
      value: `${page.navigationDurationMs} ms (controlled scanner measurement only)`,
    },
    {
      label: "Total scan processing time",
      value: `${durationMs} ms (controlled scanner measurement only)`,
    },
    { label: "Target contacted", value: "Yes" },
  ];

  return (
    <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold">Navigation metadata</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className={row.mono ? "sm:col-span-2" : undefined}>
            <dt className="text-muted text-xs font-medium">{row.label}</dt>
            <dd
              className={`mt-0.5 text-sm ${row.mono ? "font-mono break-all" : ""}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
