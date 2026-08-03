import type { DeferredCheck, ScanSecuritySummary } from "@/types/scan";

const DEFERRED_LABELS: Record<DeferredCheck, string> = {
  consoleErrors: "Console and JavaScript diagnostics",
  networkErrors: "Network and HTTP diagnostics",
  brokenImages: "Broken image detection",
  mobileLayout: "Mobile layout measurement",
  accessibility: "Accessibility analysis",
};

export default function DeferredChecksNotice({
  deferredChecks,
  executedCapabilities,
  security,
}: {
  deferredChecks: DeferredCheck[];
  executedCapabilities: string[];
  security: ScanSecuritySummary;
}) {
  return (
    <div className="space-y-4">
      <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Executed in this phase</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {executedCapabilities.map((capability) => (
            <li key={capability}>
              {capability === "basicNavigation"
                ? "Basic navigation and metadata collection"
                : capability === "desktopScreenshot"
                  ? "Desktop screenshot capture"
                  : capability}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">
          Selected checks scheduled for later phases
        </h3>
        {deferredChecks.length === 0 ? (
          <p className="text-muted mt-2 text-sm">
            No deferred diagnostic checks were selected.
          </p>
        ) : (
          <>
            <p className="text-muted mt-2 text-sm leading-relaxed">
              These options were included in the requested configuration but were
              not executed by the Phase 4 scanner.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {deferredChecks.map((check) => (
                <li key={check}>{DEFERRED_LABELS[check]}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Network safety summary</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted text-xs font-medium">Inspected requests</dt>
            <dd className="text-sm font-semibold">
              {security.inspectedRequestCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium">Unique hosts</dt>
            <dd className="text-sm font-semibold">{security.uniqueHostCount}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium">Blocked requests</dt>
            <dd className="text-sm font-semibold">
              {security.blockedRequestCount}
            </dd>
          </div>
        </dl>
        {security.blockedRequests.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {security.blockedRequests.map((entry, index) => (
              <li
                key={`${entry.hostname}-${entry.reason}-${index}`}
                className="border-line rounded-lg border px-3 py-2"
              >
                <span className="font-mono break-all">{entry.hostname}</span>
                <span className="text-muted">
                  {" "}
                  · {entry.reason} · {entry.resourceType}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
