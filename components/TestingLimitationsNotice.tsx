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
        A successful Phase 4 result means Chromium opened the authorized page and
        collected basic navigation metadata. It does not mean the website is
        healthy, free of bugs, or ready for release.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Phase 4 does not inspect console errors, classify failed requests, detect
        broken images, measure mobile overflow, or run accessibility analysis.
        Those diagnostic checks arrive in later phases.
      </p>

      <p className="text-muted mt-3 leading-relaxed">
        Automated checks still cannot judge business rules, pricing logic, or
        whether a visitor can finish a flow. Manual testing remains necessary.
      </p>
    </section>
  );
}
