import DiagnosticFilters from "./DiagnosticFilters";
import DiagnosticIssueCard from "./DiagnosticIssueCard";
import type {
  DiagnosticEvidenceArtifact,
  DiagnosticResult,
  Severity,
} from "@/types/scan";

export { DiagnosticIssueCard };

function statusLabel(status: DiagnosticResult["status"]): string {
  if (status === "NOT_REQUESTED") return "Not requested";
  if (status === "PARTIAL") return "Partial";
  return "Complete";
}

export default function DiagnosticReport({
  diagnostics,
  evidenceArtifacts = [],
}: {
  diagnostics: DiagnosticResult;
  evidenceArtifacts?: DiagnosticEvidenceArtifact[];
}) {
  const counts = {
    ALL: diagnostics.issues.length,
    HIGH: diagnostics.severitySummary.high,
    MEDIUM: diagnostics.severitySummary.medium,
    LOW: diagnostics.severitySummary.low,
    INFO: diagnostics.severitySummary.info,
  } satisfies Record<Severity | "ALL", number>;

  return (
    <section
      aria-labelledby="frontend-diagnostics-heading"
      className="border-line bg-panel space-y-4 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3 id="frontend-diagnostics-heading" className="text-sm font-semibold">
          Frontend diagnostics
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status: {statusLabel(diagnostics.status)}. Grouped findings are listed
          below. Controlled scanner measurement only.
        </p>
      </div>

      {diagnostics.status === "NOT_REQUESTED" ? (
        <p className="text-sm leading-relaxed">
          Frontend diagnostics were not selected for this scan.
        </p>
      ) : null}

      {diagnostics.status === "PARTIAL" ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Some diagnostic events may be missing because the collection limit was
          reached or a diagnostic collector could not complete.
        </p>
      ) : null}

      {diagnostics.status !== "NOT_REQUESTED" ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Grouped findings</dt>
              <dd className="text-lg font-semibold">
                {diagnostics.groupedIssueCount}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">High</dt>
              <dd className="text-lg font-semibold">
                {diagnostics.severitySummary.high}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Medium</dt>
              <dd className="text-lg font-semibold">
                {diagnostics.severitySummary.medium}
              </dd>
            </div>
            <div className="border-line rounded-xl border px-3 py-2">
              <dt className="text-muted text-xs font-medium">Low / Info</dt>
              <dd className="text-lg font-semibold">
                {diagnostics.severitySummary.low + diagnostics.severitySummary.info}
              </dd>
            </div>
          </dl>

          <p className="text-muted text-xs leading-relaxed">
            Raw events: {diagnostics.capturedEventCount}. Ignored:{" "}
            {diagnostics.ignoredEventCount}. Dropped:{" "}
            {diagnostics.droppedEventCount}. Type counts are grouped issues
            (console {diagnostics.typeSummary.consoleErrors}, page{" "}
            {diagnostics.typeSummary.pageErrors}, failed{" "}
            {diagnostics.typeSummary.failedRequests}, HTTP{" "}
            {diagnostics.typeSummary.httpErrors}, broken images{" "}
            {diagnostics.typeSummary.brokenImages}, mobile layout{" "}
            {diagnostics.typeSummary.mobileLayoutIssues}, accessibility{" "}
            {diagnostics.typeSummary.accessibilityViolations}, dead clicks{" "}
            {diagnostics.typeSummary.deadClicks}, obstructed{" "}
            {diagnostics.typeSummary.obstructedControls}, form-state{" "}
            {diagnostics.typeSummary.formStateIssues}, state transitions{" "}
            {diagnostics.typeSummary.stateTransitionIssues}).
          </p>

          {diagnostics.issues.length === 0 ? (
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                No reportable findings were captured by the selected automated
                checks during these page states.
              </p>
              <p className="text-muted">
                This does not prove that the page is bug-free, responsive at
                every size, or fully accessible. Some problems require user
                interaction, authenticated states, longer sessions, different
                content, or manual review.
              </p>
            </div>
          ) : (
            <DiagnosticFilters
              issues={diagnostics.issues}
              counts={counts}
              evidenceArtifacts={evidenceArtifacts}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
