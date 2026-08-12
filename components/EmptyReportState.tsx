export default function EmptyReportState() {
  return (
    <section aria-labelledby="report-heading">
      <h2 id="report-heading" className="text-xl font-semibold">
        Basic scan result
      </h2>

      <div className="border-line bg-panel mt-3 rounded-2xl border border-dashed p-8 text-center sm:p-12">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted mx-auto h-8 w-8"
          aria-hidden="true"
        >
          <path d="M14 3v5h5" />
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>

        <p className="mt-4 font-medium">No basic scan has been run yet</p>
        <p className="text-muted mx-auto mt-2 max-w-md text-sm leading-relaxed">
          Choose your checks and select <strong>Scan Website</strong> to open one
          authorized page in Chromium and collect navigation metadata and
          selected diagnostics here.
        </p>
        <p className="text-muted mx-auto mt-3 max-w-md text-sm leading-relaxed">
          Phase 6 can report console errors, uncaught exceptions, failed
          requests, HTTP error responses, broken images, mobile layout issues,
          and accessibility violations when those options are selected.
        </p>
      </div>
    </section>
  );
}
