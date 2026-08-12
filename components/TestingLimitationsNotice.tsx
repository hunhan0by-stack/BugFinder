export default function TestingLimitationsNotice() {
  return (
    <section
      aria-labelledby="limitations-heading"
      className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <h2 id="limitations-heading" className="text-xl font-semibold">
        What this phase cannot do
      </h2>

      <p className="text-muted mt-3 leading-relaxed">
        A successful Phase 8 result means Chromium opened the authorized page,
        collected the selected diagnostics, and optionally captured bounded
        issue evidence or reversible local toggles. It does not mean the website
        is healthy, free of bugs, or ready for release.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Phase 8 does not crawl pages, authenticate, fill forms, submit forms, or
        test payment flows. Issue screenshots are supporting evidence only — not
        pixel-diff proof. A successful reversible toggle does not prove an entire
        application workflow works. Zero findings does not prove the page is
        bug-free.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Automated checks still cannot judge business rules, pricing logic, or
        whether a visitor can finish a flow. Manual testing remains necessary.
      </p>
    </section>
  );
}
