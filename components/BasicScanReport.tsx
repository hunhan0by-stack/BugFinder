import { useEffect, useRef } from "react";
import BasicScanBanner from "./BasicScanBanner";
import BasicScanMetadata from "./BasicScanMetadata";
import DeferredChecksNotice from "./DeferredChecksNotice";
import ExportButton from "./ExportButton";
import ScreenshotEvidence from "./ScreenshotEvidence";
import type { BasicScanResult } from "@/types/scan";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "") || "the target";
  } catch {
    return "the target";
  }
}

export default function BasicScanReport({ result }: { result: BasicScanResult }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [result.scanId]);

  return (
    <section aria-labelledby="basic-scan-report-heading" className="space-y-5">
      <h2
        id="basic-scan-report-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        Basic scan result
      </h2>

      <div role="status" aria-live="polite" className="sr-only">
        Basic page scan completed for {hostnameFromUrl(result.targetUrl)}.
      </div>

      <BasicScanBanner notices={result.notices} />
      <BasicScanMetadata page={result.page} durationMs={result.durationMs} />
      <ScreenshotEvidence
        screenshot={result.screenshot}
        hostname={hostnameFromUrl(result.targetUrl)}
      />
      <DeferredChecksNotice
        deferredChecks={result.deferredChecks}
        executedCapabilities={result.executedCapabilities}
        security={result.security}
      />

      <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Export</h3>
        <p className="text-muted mt-1 mb-3 text-sm leading-relaxed">
          The exported file contains navigation metadata from this basic scan. It
          does not include diagnostic bug findings.
        </p>
        <ExportButton result={result} />
      </div>
    </section>
  );
}
