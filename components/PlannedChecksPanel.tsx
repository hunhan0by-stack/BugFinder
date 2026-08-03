const reportContents = [
  {
    title: "Requested and final URL",
    description:
      "The address you submitted and the address Chromium ended on after any allowed redirects.",
  },
  {
    title: "Page title and HTTP status",
    description:
      "The document title plus the main response status and content type from the visit.",
  },
  {
    title: "Timing and redirects",
    description:
      "Controlled scanner measurements for navigation time, total processing time, and redirect count.",
  },
  {
    title: "Desktop screenshot",
    description:
      "Optional evidence of the desktop viewport or full page, stored only under scan-results.",
  },
];

export default function PlannedChecksPanel() {
  return (
    <section
      aria-labelledby="report-contents-heading"
      className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <h2 id="report-contents-heading" className="text-xl font-semibold">
        What a basic scan reports
      </h2>
      <p className="text-muted mt-1 text-sm">
        Phase 4 opens one authorized page and returns navigation metadata. It
        does not produce verified bug findings yet.
      </p>

      <dl className="mt-5 space-y-4">
        {reportContents.map((item) => (
          <div key={item.title}>
            <dt className="font-medium">{item.title}</dt>
            <dd className="text-muted mt-1 text-sm leading-relaxed">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>

      <p className="border-line text-muted mt-6 border-t pt-4 text-sm leading-relaxed">
        Selected diagnostic options stay listed as deferred until later phases.
        JSON export includes the complete basic-scan result with{" "}
        <code className="font-mono text-xs">mode: &quot;BASIC_SCAN&quot;</code>.
      </p>
    </section>
  );
}
