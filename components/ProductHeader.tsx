export default function ProductHeader() {
  return (
    <header className="py-2">
      <div className="text-muted flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <p className="text-xs font-semibold tracking-wide uppercase">
          Frontend quality assurance — Phase 4: Basic scanner
        </p>
      </div>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Frontend Bug Finder
      </h1>

      <p className="text-muted mt-3 max-w-2xl leading-relaxed">
        Frontend Bug Finder opens one of your authorized web pages in Chromium
        and will later report frontend problems a visitor would run into. It is a
        quality assurance tool, not a security scanner.
      </p>

      <p className="text-muted mt-3 max-w-2xl leading-relaxed">
        In this phase the scanner validates the target, opens a single page,
        records navigation metadata, and can capture one desktop screenshot.
        Console, network, image, mobile, and accessibility diagnostics are not
        enabled yet.
      </p>
    </header>
  );
}
