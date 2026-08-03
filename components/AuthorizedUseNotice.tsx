export default function AuthorizedUseNotice() {
  return (
    <aside
      aria-labelledby="authorized-use-heading"
      className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:p-5"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 7.75h.01" />
      </svg>

      <div className="min-w-0">
        <h2 id="authorized-use-heading" className="font-semibold">
          Scan only websites you are allowed to test
        </h2>
        <p className="mt-1 text-sm leading-relaxed">
          Use Frontend Bug Finder on pages you own, or on pages where the owner
          has given you permission in writing. A scan loads the page the same
          way a visitor would, so it still creates real traffic on the target
          server.
        </p>
      </div>
    </aside>
  );
}
