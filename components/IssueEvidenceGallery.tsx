import type {
  DiagnosticEvidenceArtifact,
  DiagnosticIssue,
  IssueEvidenceAnalysis,
} from "@/types/scan";

function kindLabel(kind: DiagnosticEvidenceArtifact["kind"]): string {
  if (kind === "BEFORE_INTERACTION") return "Before interaction";
  if (kind === "AFTER_INTERACTION") return "After first click";
  if (kind === "AFTER_REVERSAL") return "After reversal";
  if (kind === "ELEMENT_SCREENSHOT") return "Element screenshot";
  return "Context screenshot";
}

function stateLabel(
  label: DiagnosticEvidenceArtifact["stateLabel"],
): string | null {
  if (label === "BASELINE") return "Before";
  if (label === "AFTER_FIRST_CLICK") return "After first click";
  if (label === "AFTER_REVERSAL") return "After reversal";
  return null;
}

function altForArtifact(
  artifact: DiagnosticEvidenceArtifact,
  issueType: string | undefined,
): string {
  if (artifact.kind === "BEFORE_INTERACTION") return "Before interaction evidence";
  if (artifact.kind === "AFTER_INTERACTION") return "After interaction evidence";
  if (artifact.kind === "AFTER_REVERSAL") return "After reversal evidence";
  if (issueType === "OBSTRUCTED_CONTROL") {
    return "Evidence for obstructed control issue";
  }
  if (issueType === "DEAD_CLICK") return "Evidence for dead click issue";
  if (issueType === "BROKEN_IMAGE") return "Evidence for broken image issue";
  if (issueType === "MOBILE_OVERFLOW") {
    return "Evidence for mobile overflow issue";
  }
  if (issueType === "STATE_TRANSITION_ISSUE") {
    return "Evidence for state transition issue";
  }
  return "Issue evidence screenshot";
}

export function IssueEvidenceThumbs({
  artifacts,
  issue,
}: {
  artifacts: DiagnosticEvidenceArtifact[];
  issue: DiagnosticIssue;
}) {
  if (artifacts.length === 0) return null;
  const ordered = [...artifacts].sort((a, b) => {
    const order = ["BASELINE", "AFTER_FIRST_CLICK", "AFTER_REVERSAL"] as const;
    const ai = a.stateLabel ? order.indexOf(a.stateLabel) : 99;
    const bi = b.stateLabel ? order.indexOf(b.stateLabel) : 99;
    if (ai !== bi) return ai - bi;
    return a.capturedAtMs - b.capturedAtMs;
  });

  return (
    <div className="mt-4 space-y-2">
      <h5 className="text-sm font-medium">Evidence</h5>
      <p className="text-muted text-xs leading-relaxed">
        Evidence screenshots show the visible page region captured during the
        bounded diagnostic. They are supporting evidence, not a pixel-perfect
        proof of the bug.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ordered.map((artifact) => {
          const label = stateLabel(artifact.stateLabel) ?? kindLabel(artifact.kind);
          return (
            <li key={artifact.id} className="border-line rounded-xl border p-2">
              <p className="mb-1 text-xs font-medium">{label}</p>
              <a
                href={artifact.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:ring-accent block focus-visible:ring-2 focus-visible:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={artifact.publicUrl}
                  alt={altForArtifact(artifact, issue.type)}
                  width={artifact.width}
                  height={artifact.height}
                  className="max-h-48 w-full object-contain"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function IssueEvidenceGallery({
  analysis,
  issues,
}: {
  analysis: IssueEvidenceAnalysis;
  issues: DiagnosticIssue[];
}) {
  if (analysis.status === "NOT_REQUESTED") {
    return (
      <section
        aria-labelledby="issue-evidence-heading"
        className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
      >
        <h3 id="issue-evidence-heading" className="text-sm font-semibold">
          Issue evidence
        </h3>
        <p className="text-sm leading-relaxed">
          Issue-specific evidence was not selected for this scan.
        </p>
      </section>
    );
  }

  const issueById = new Map(issues.map((issue) => [issue.id, issue]));

  return (
    <section
      aria-labelledby="issue-evidence-heading"
      className="border-line bg-panel space-y-3 rounded-2xl border p-5 shadow-sm sm:p-6"
    >
      <div>
        <h3 id="issue-evidence-heading" className="text-sm font-semibold">
          Issue evidence
        </h3>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          Status:{" "}
          {analysis.status === "PARTIAL" ? "Partial" : "Complete"}. Artifacts:{" "}
          {analysis.artifactCount}. Storage:{" "}
          {Math.round(analysis.totalBytes / 1024)} KB.
        </p>
      </div>
      <p className="text-sm leading-relaxed">
        Issue evidence may contain visible content surrounding the affected
        interface element. Screenshots are opt-in supporting evidence, not proof
        of root cause, and are not pixel-diff analysis.
      </p>
      {analysis.artifactCount === 0 ? (
        <p className="text-sm leading-relaxed">
          No evidence-eligible findings produced bounded artifacts for this scan
          state.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analysis.artifacts.map((artifact) => {
            const issue = artifact.issueId
              ? issueById.get(artifact.issueId)
              : undefined;
            return (
              <li
                key={artifact.id}
                className="border-line rounded-xl border p-3"
              >
                <p className="text-xs font-semibold tracking-wide uppercase">
                  {kindLabel(artifact.kind)} · {artifact.profile}
                </p>
                {issue ? (
                  <p className="mt-1 text-sm font-medium wrap-break-word">
                    {issue.title}
                  </p>
                ) : null}
                <a
                  href={artifact.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-visible:ring-accent mt-2 block focus-visible:ring-2 focus-visible:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={artifact.publicUrl}
                    alt={altForArtifact(artifact, issue?.type)}
                    width={artifact.width}
                    height={artifact.height}
                    className="max-h-40 w-full object-contain"
                  />
                </a>
                <p className="text-muted mt-2 text-xs">
                  {artifact.width}×{artifact.height} · {artifact.byteSize} bytes
                </p>
              </li>
            );
          })}
        </ul>
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
