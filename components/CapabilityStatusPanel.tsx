import type {
  BasicScreenshotResult,
  DiagnosticCapabilityStatuses,
  DiagnosticStatus,
} from "@/types/scan";

function diagnosticCapabilityStatusLabel(status: DiagnosticStatus): string {
  if (status === "NOT_REQUESTED") return "Not selected";
  if (status === "PARTIAL") return "Partial";
  return "Complete";
}

function screenshotCapabilityStatusLabel(
  screenshot: BasicScreenshotResult,
): string {
  if (!screenshot.requested) return "Not selected";
  if (screenshot.available) return "Available";
  return "Unavailable";
}

type CapabilityRow = {
  id: string;
  label: string;
  status: string;
};

function buildCapabilityRows(input: {
  capabilities: DiagnosticCapabilityStatuses;
  screenshot: BasicScreenshotResult;
  mobileScreenshot: BasicScreenshotResult;
}): CapabilityRow[] {
  return [
    {
      id: "console",
      label: "Console and JavaScript diagnostics",
      status: diagnosticCapabilityStatusLabel(input.capabilities.console),
    },
    {
      id: "network",
      label: "Network and HTTP diagnostics",
      status: diagnosticCapabilityStatusLabel(input.capabilities.network),
    },
    {
      id: "broken-images",
      label: "Broken-image analysis",
      status: diagnosticCapabilityStatusLabel(input.capabilities.brokenImages),
    },
    {
      id: "mobile-layout",
      label: "Mobile layout analysis",
      status: diagnosticCapabilityStatusLabel(input.capabilities.mobileLayout),
    },
    {
      id: "accessibility",
      label: "Accessibility analysis",
      status: diagnosticCapabilityStatusLabel(input.capabilities.accessibility),
    },
    {
      id: "safe-interactions",
      label: "Safe interaction checks",
      status: diagnosticCapabilityStatusLabel(
        input.capabilities.safeInteractions,
      ),
    },
    {
      id: "desktop-screenshot",
      label: "Desktop screenshot",
      status: screenshotCapabilityStatusLabel(input.screenshot),
    },
    {
      id: "mobile-screenshot",
      label: "Mobile screenshot",
      status: screenshotCapabilityStatusLabel(input.mobileScreenshot),
    },
  ];
}

export default function CapabilityStatusPanel({
  capabilities,
  screenshot,
  mobileScreenshot,
}: {
  capabilities: DiagnosticCapabilityStatuses;
  screenshot: BasicScreenshotResult;
  mobileScreenshot: BasicScreenshotResult;
}) {
  const rows = buildCapabilityRows({
    capabilities,
    screenshot,
    mobileScreenshot,
  });

  return (
    <section
      aria-labelledby="capability-status-heading"
      className="border-line bg-panel space-y-4 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3 id="capability-status-heading" className="text-sm font-semibold">
          Capability status
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Selected scan capabilities and their completion state for this run.
          Status labels describe what ran — not whether issues were found.
        </p>
      </div>

      <dl className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="border-line flex flex-col gap-1 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <dt className="text-sm font-medium">{row.label}</dt>
            <dd className="text-sm">
              <span className="sr-only">{row.label} status:</span>
              {row.status}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
