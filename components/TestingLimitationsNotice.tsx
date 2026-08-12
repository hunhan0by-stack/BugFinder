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
        A successful Phase 6 result means Chromium opened the authorized page and
        collected the selected frontend diagnostics. It does not mean the website
        is healthy, free of bugs, or ready for release.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Phase 6 does not click through flows, fill forms, or prove every image
        and layout state. Zero captured diagnostic findings does not prove the
        page is bug-free.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Automated checks still cannot judge business rules, pricing logic, or
        whether a visitor can finish a flow. Manual testing remains necessary.
      </p>
    </section>
  );
}
