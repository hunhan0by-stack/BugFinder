export default function BasicScanBanner({ notices }: { notices: string[] }) {
  return (
    <aside
      aria-label="Basic scan status"
      className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 text-sky-950 sm:px-5"
    >
      <p className="text-sm font-semibold tracking-wide uppercase">
        Basic page scan completed
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        Chromium opened the authorized page and collected navigation metadata.
        Diagnostic bug checks have not been enabled yet.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {notices.slice(0, 4).map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </aside>
  );
}
