import { useEffect, useRef } from "react";
import BasicScanBanner from "./BasicScanBanner";
import BasicScanMetadata from "./BasicScanMetadata";
import CapabilityStatusPanel from "./CapabilityStatusPanel";
import DeferredChecksNotice from "./DeferredChecksNotice";
import DiagnosticReport from "./DiagnosticReport";
import ExportButton from "./ExportButton";
import ScreenshotEvidence from "./ScreenshotEvidence";
import type {
  AccessibilityAnalysis,
  BasicScanResult,
  BrokenImageAnalysis,
  DiagnosticStatus,
  MobileLayoutAnalysis,
  SafeInteractionAnalysis,
} from "@/types/scan";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "") || "the target";
  } catch {
    return "the target";
  }
}

function analysisStatusLabel(status: DiagnosticStatus): string {
  if (status === "NOT_REQUESTED") return "Not requested";
  if (status === "PARTIAL") return "Partial";
  return "Complete";
}

function BrokenImageAnalysisSection({
  analysis,
}: {
  analysis: BrokenImageAnalysis;
}) {
  const showZeroResultNotice =
    analysis.status === "COMPLETE" && analysis.issueCount === 0;
  const filteredNotices = showZeroResultNotice
    ? analysis.notices.filter(
        (notice) =>
          !notice.startsWith("No visible") &&
          !notice.startsWith("CSS background images"),
      )
    : analysis.notices;

  return (
    <section
      aria-labelledby="broken-image-analysis-heading"
      className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3 id="broken-image-analysis-heading" className="text-sm font-semibold">
          Broken image analysis
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status: {analysisStatusLabel(analysis.status)}.
        </p>
      </div>
      {analysis.status === "NOT_REQUESTED" ? (
        <p className="text-sm leading-relaxed">
          Broken-image analysis was not selected for this scan.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Inspected</dt>
              <dd className="text-lg font-semibold">
                {analysis.inspectedImageCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Visible</dt>
              <dd className="text-lg font-semibold">
                {analysis.visibleImageCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Skipped</dt>
              <dd className="text-lg font-semibold">
                {analysis.skippedImageCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Issues</dt>
              <dd className="text-lg font-semibold">{analysis.issueCount}</dd>
            </div>
          </dl>
          {showZeroResultNotice ? (
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                No visible &lt;img&gt; elements met the broken-image detection
                criteria during this desktop page state.
              </p>
              <p className="text-muted">
                CSS background images, SVG image elements, and images that were
                not attempted because of lazy loading are outside this Phase 6
                check.
              </p>
            </div>
          ) : null}
        </>
      )}
      {filteredNotices.length > 0 ? (
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          {filteredNotices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MobileLayoutAnalysisSection({
  analysis,
}: {
  analysis: MobileLayoutAnalysis;
}) {
  return (
    <section
      aria-labelledby="mobile-layout-analysis-heading"
      className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3
          id="mobile-layout-analysis-heading"
          className="text-sm font-semibold"
        >
          Mobile layout analysis
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status: {analysisStatusLabel(analysis.status)}. Viewport{" "}
          {analysis.viewport.width}×{analysis.viewport.height}.
        </p>
      </div>
      {analysis.status === "NOT_REQUESTED" ? (
        <p className="text-sm leading-relaxed">
          Mobile layout analysis was not selected for this scan.
        </p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Elements analyzed</dt>
            <dd className="text-lg font-semibold">
              {analysis.analyzedElementCount}
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Overflowing</dt>
            <dd className="text-lg font-semibold">
              {analysis.overflowingElementCount}
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Horizontal overflow</dt>
            <dd className="text-lg font-semibold">
              {analysis.horizontalOverflowPx ?? 0} px
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Issues</dt>
            <dd className="text-lg font-semibold">{analysis.issueCount}</dd>
          </div>
        </dl>
      )}
      {analysis.notices.length > 0 ? (
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          {analysis.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AccessibilityAnalysisSection({
  analysis,
}: {
  analysis: AccessibilityAnalysis;
}) {
  return (
    <section
      aria-labelledby="accessibility-analysis-heading"
      className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3
          id="accessibility-analysis-heading"
          className="text-sm font-semibold"
        >
          Accessibility analysis
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status: {analysisStatusLabel(analysis.status)}. Engine:{" "}
          {analysis.engine}
          {analysis.engineVersion ? ` ${analysis.engineVersion}` : ""}.
        </p>
      </div>
      {analysis.status === "NOT_REQUESTED" ? (
        <p className="text-sm leading-relaxed">
          Accessibility analysis was not selected for this scan.
        </p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Violation rules</dt>
            <dd className="text-lg font-semibold">
              {analysis.violationRuleCount}
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Affected nodes</dt>
            <dd className="text-lg font-semibold">
              {analysis.affectedNodeCount}
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Reported issues</dt>
            <dd className="text-lg font-semibold">
              {analysis.reportedIssueCount}
            </dd>
          </div>
          <div className="border-line rounded-xl border px-3 py-2">
            <dt className="text-muted text-xs font-medium">Standards</dt>
            <dd className="text-sm font-semibold wrap-break-word">
              {analysis.standards.join(", ") || "—"}
            </dd>
          </div>
        </dl>
      )}
      {analysis.notices.length > 0 ? (
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          {analysis.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SafeInteractionAnalysisSection({
  analysis,
}: {
  analysis: SafeInteractionAnalysis;
}) {
  return (
    <section
      aria-labelledby="safe-interaction-analysis-heading"
      className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3
          id="safe-interaction-analysis-heading"
          className="text-sm font-semibold"
        >
          Safe interaction analysis
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status: {analysisStatusLabel(analysis.status)}.
        </p>
      </div>
      {analysis.status === "NOT_REQUESTED" ? (
        <p className="text-sm leading-relaxed">
          Safe interaction analysis was not selected for this scan.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Discovered</dt>
              <dd className="text-lg font-semibold">
                {analysis.discoveredCandidateCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Eligible</dt>
              <dd className="text-lg font-semibold">
                {analysis.eligibleCandidateCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Actual clicks</dt>
              <dd className="text-lg font-semibold">
                {analysis.actualClickCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Responsive</dt>
              <dd className="text-lg font-semibold">
                {analysis.responsiveControlCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Dead clicks</dt>
              <dd className="text-lg font-semibold">
                {analysis.deadClickIssueCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Obstructions</dt>
              <dd className="text-lg font-semibold">
                {analysis.obstructionIssueCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Form-state</dt>
              <dd className="text-lg font-semibold">
                {analysis.formStateIssueCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Skipped unsafe</dt>
              <dd className="text-lg font-semibold">
                {analysis.skippedUnsafeCount +
                  analysis.skippedNavigationCount +
                  analysis.skippedFormSubmissionCount +
                  analysis.skippedDestructiveCount +
                  analysis.skippedNetworkCount}
              </dd>
            </div>
          </dl>
          <p className="text-muted text-sm leading-relaxed">
            Only controls that passed strict non-destructive safety checks were
            eligible for an actual click. Each actual click ran in a fresh
            isolated browser context. Interaction findings are based on one
            isolated pointer click per eligible control. The scanner blocks
            navigation, network requests, submissions, popups, downloads, and
            other side effects. Controls requiring a server response or workflow
            state are skipped rather than labeled as broken.
          </p>
          {analysis.deadClickIssueCount === 0 &&
          analysis.obstructionIssueCount === 0 &&
          analysis.formStateIssueCount === 0 ? (
            <div className="text-sm leading-relaxed">
              {analysis.actualClickCount === 0 ? (
                <p>
                  No controls met the strict safety requirements for an actual
                  click during this page state.
                </p>
              ) : (
                <p>
                  No reportable dead-click, obstruction, or form-state findings
                  were captured from the controls that were eligible for the
                  bounded safe-interaction check.
                </p>
              )}
              <p className="text-muted mt-2">
                This does not prove that every control works. Navigation,
                submissions, network actions, offscreen controls, destructive
                actions, mobile interactions, and multi-step workflows were
                intentionally excluded.
              </p>
            </div>
          ) : null}
        </>
      )}
      {analysis.notices.length > 0 ? (
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          {analysis.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function BasicScanReport({ result }: { result: BasicScanResult }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const diagnosticsRequested = result.diagnostics.status !== "NOT_REQUESTED";

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

      <BasicScanBanner
        notices={result.notices}
        diagnosticsRequested={diagnosticsRequested}
      />
      <BasicScanMetadata page={result.page} durationMs={result.durationMs} />
      <ScreenshotEvidence
        screenshot={result.screenshot}
        mobileScreenshot={result.mobileScreenshot}
        hostname={hostnameFromUrl(result.targetUrl)}
      />
      <CapabilityStatusPanel
        capabilities={result.diagnostics.capabilities}
        screenshot={result.screenshot}
        mobileScreenshot={result.mobileScreenshot}
      />
      <DiagnosticReport diagnostics={result.diagnostics} />
      <BrokenImageAnalysisSection analysis={result.brokenImageAnalysis} />
      <MobileLayoutAnalysisSection analysis={result.mobileLayoutAnalysis} />
      <AccessibilityAnalysisSection analysis={result.accessibilityAnalysis} />
      <SafeInteractionAnalysisSection
        analysis={result.safeInteractionAnalysis}
      />
      <DeferredChecksNotice
        deferredChecks={result.deferredChecks}
        executedCapabilities={result.executedCapabilities}
        security={result.security}
      />

      <div className="border-line bg-panel rounded-2xl border p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold">Export</h3>
        <p className="text-muted mt-1 mb-3 text-sm leading-relaxed">
          The exported file contains navigation metadata and selected diagnostic
          findings from this scan. It does not include cookies, request bodies,
          or response bodies.
        </p>
        <ExportButton result={result} />
      </div>
    </section>
  );
}
