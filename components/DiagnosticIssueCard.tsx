import { IssueEvidenceThumbs } from "./IssueEvidenceGallery";
import type {
  DiagnosticEvidenceArtifact,
  DiagnosticIssue,
  DiagnosticIssueType,
  ScanProfile,
} from "@/types/scan";

const TYPE_LABELS: Record<DiagnosticIssueType, string> = {
  CONSOLE_ERROR: "Console error",
  PAGE_ERROR: "Uncaught page exception",
  REQUEST_FAILED: "Failed request",
  HTTP_ERROR: "HTTP error response",
  BROKEN_IMAGE: "Broken image",
  DEAD_CLICK: "Dead click",
  STATE_TRANSITION_ISSUE: "State transition issue",
  OBSTRUCTED_CONTROL: "Obstructed control",
  FORM_STATE_ISSUE: "Form state issue",
  MOBILE_OVERFLOW: "Mobile overflow",
  MOBILE_VIEWPORT: "Mobile viewport",
  ACCESSIBILITY_VIOLATION: "Accessibility violation",
};

function profileLabel(profile: ScanProfile): string {
  return profile === "MOBILE" ? "Mobile" : "Desktop";
}

export default function DiagnosticIssueCard({
  issue,
  evidenceArtifacts = [],
}: {
  issue: DiagnosticIssue;
  evidenceArtifacts?: DiagnosticEvidenceArtifact[];
}) {
  const typeLabel = TYPE_LABELS[issue.type];
  const linkedEvidence = evidenceArtifacts.filter(
    (artifact) =>
      artifact.issueId === issue.id ||
      (issue.evidenceIds ?? []).includes(artifact.id),
  );

  const scopeLabel =
    issue.scope === "MAIN_DOCUMENT"
      ? "Main document"
      : issue.scope === "SAME_ORIGIN"
        ? "Same origin"
        : issue.scope === "THIRD_PARTY"
          ? "Third party"
          : issue.scope === "BROWSER"
            ? "Browser"
            : "Unknown";

  return (
    <article className="border-line rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-wide uppercase">
          {issue.severity} · {typeLabel} · {profileLabel(issue.profile)}
        </p>
        <h4 className="text-base font-semibold wrap-break-word">{issue.title}</h4>
      </header>

      <dl className="text-muted mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-neutral-700">Scope</dt>
          <dd>{scopeLabel}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-700">Profile</dt>
          <dd>{profileLabel(issue.profile)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-700">Diagnostic confidence</dt>
          <dd>
            {issue.confidence}%
            <span className="mt-1 block text-xs leading-relaxed">
              This value reflects the strength of the collected technical
              evidence, not certainty about user impact.
            </span>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-700">Occurrences</dt>
          <dd>{issue.occurrenceCount}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-700">First / last seen</dt>
          <dd>
            {issue.firstSeenMs} ms / {issue.lastSeenMs} ms
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-3 text-sm leading-relaxed">
        <p>{issue.description}</p>
        <p>
          <span className="font-medium">Observed behavior:</span>{" "}
          <span className="wrap-break-word">{issue.observedBehavior}</span>
        </p>
        <p>
          <span className="font-medium">Potential user impact:</span>{" "}
          {issue.potentialUserImpact}
        </p>
        <p>
          <span className="font-medium">Suggested investigation:</span>{" "}
          {issue.suggestedInvestigation}
        </p>
        {issue.resourceUrl ? (
          <p className="wrap-break-word">
            <span className="font-medium">Resource:</span>{" "}
            <span className="font-mono text-xs">{issue.resourceUrl}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <h5 className="text-sm font-medium">Technical evidence</h5>
        <pre className="border-line mt-2 max-h-64 overflow-auto rounded-lg border bg-neutral-50 p-3 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {issue.technicalEvidence}
        </pre>
        {issue.type === "PAGE_ERROR" && issue.metadata.hasStack ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium">
              Additional stack details
            </summary>
            <pre className="border-line mt-2 overflow-auto rounded-lg border bg-neutral-50 p-3 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
              {issue.technicalEvidence}
            </pre>
          </details>
        ) : null}
      </div>
      {linkedEvidence.length > 0 ? (
        <IssueEvidenceThumbs artifacts={linkedEvidence} issue={issue} />
      ) : null}
    </article>
  );
}
