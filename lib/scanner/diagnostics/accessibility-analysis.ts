import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type {
  AccessibilityAnalysis,
  DiagnosticIssue,
  Severity,
} from "@/types/scan";

/** WCAG A/AA tags commonly supported by axe-core 4.x. */
export const AXE_WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

export type AxeViolationLike = {
  id: string;
  impact?: string | null;
  description?: string;
  help?: string;
  helpUrl?: string;
  tags?: string[];
  nodes: Array<{
    target?: unknown[];
    failureSummary?: string;
    html?: string;
  }>;
};

/**
 * Builds public accessibility issues from axe-like violation data.
 * Never copies node HTML into the result.
 */
export function buildAccessibilityIssuesFromViolations(input: {
  violations: readonly AxeViolationLike[];
  config: ScannerConfig;
  finalPageUrl: string;
  scanRelativeMs: number;
  createId?: () => string;
  engineVersion?: string;
  analysisFailed?: boolean;
}): { analysis: AccessibilityAnalysis; issues: DiagnosticIssue[] } {
  const notices: string[] = [];
  let partial = Boolean(input.analysisFailed);
  let issueLimitReached = false;
  let nodeEvidenceLimitReached = false;
  let affectedNodeCount = 0;

  if (input.analysisFailed) {
    notices.push(
      "Accessibility analysis could not complete for this page state.",
    );
  }

  const createId = input.createId ?? (() => crypto.randomUUID());
  const pageUrl = sanitizeDiagnosticUrl(
    input.finalPageUrl,
    input.config.maxDiagnosticUrlLength,
  );
  const sorted = [...input.violations].sort((a, b) => {
    const severityDelta = impactRank(a.impact) - impactRank(b.impact);
    if (severityDelta !== 0) return severityDelta;
    return a.id.localeCompare(b.id);
  });

  const issues: DiagnosticIssue[] = [];
  for (const violation of sorted) {
    if (issues.length >= input.config.maxAccessibilityIssues) {
      issueLimitReached = true;
      partial = true;
      continue;
    }

    const nodeCount = violation.nodes.length;
    affectedNodeCount += nodeCount;
    if (nodeCount > input.config.maxAxeNodesPerRule) {
      nodeEvidenceLimitReached = true;
      partial = true;
    }

    const samples = violation.nodes
      .slice(0, input.config.maxAxeNodesPerRule)
      .map((node, index) => {
        const target = sanitizeDiagnosticText(
          flattenTarget(node.target),
          input.config.maxAxeTargetLength,
        ).text;
        const summary = sanitizeDiagnosticText(
          node.failureSummary ?? "",
          input.config.maxAxeFailureSummaryLength,
        ).text;
        return `#${index + 1} ${target}${summary ? ` — ${summary}` : ""}`;
      });

    const omitted = Math.max(0, nodeCount - input.config.maxAxeNodesPerRule);
    const helpUrl = safeHelpUrl(violation.helpUrl);
    const tags = (violation.tags ?? [])
      .filter((tag) => typeof tag === "string")
      .slice(0, 20)
      .join(", ");

    issues.push({
      id: createId(),
      type: "ACCESSIBILITY_VIOLATION",
      severity: mapAxeImpactToSeverity(violation.impact),
      confidence: violation.impact ? 99 : 96,
      title: `Accessibility: ${sanitizeDiagnosticText(violation.help || violation.id, 200).text}`,
      description: sanitizeDiagnosticText(
        `Axe-core reported that one or more elements violated the ${violation.id} accessibility rule during this desktop page state.`,
        input.config.maxEvidenceLength,
      ).text,
      observedBehavior: `${nodeCount} element${nodeCount === 1 ? "" : "s"} matched axe rule ${violation.id}.`,
      potentialUserImpact:
        "Users of assistive technologies may not be able to determine the purpose of the affected controls or content.",
      technicalEvidence: sanitizeDiagnosticText(
        [
          `Rule: ${violation.id}`,
          `Impact: ${violation.impact ?? "unknown"}`,
          `Affected nodes: ${nodeCount}`,
          samples.length > 0 ? `Samples:\n${samples.join("\n")}` : null,
          omitted > 0 ? `Omitted node samples: ${omitted}` : null,
          helpUrl ? `Help: ${helpUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        input.config.maxEvidenceLength,
      ).text,
      suggestedInvestigation:
        "Review the affected elements and provide an accessible name, label, or other appropriate accessible mechanism as required by the reported rule. Manual confirmation is recommended.",
      scope: "SAME_ORIGIN",
      profile: "DESKTOP",
      pageUrl,
      occurrenceCount: Math.max(1, nodeCount),
      firstSeenMs: input.scanRelativeMs,
      lastSeenMs: input.scanRelativeMs,
      metadata: {
        ruleId: violation.id,
        axeImpact: violation.impact ?? null,
        affectedNodeCount: nodeCount,
        helpUrl,
        standards: tags || null,
        reportedNodeSampleCount: samples.length,
        omittedNodeCount: omitted,
      },
    });
  }

  if (issueLimitReached) {
    notices.push(
      "Accessibility output may be incomplete because the analysis exceeded configured evidence limits.",
    );
  }
  if (nodeEvidenceLimitReached) {
    notices.push(
      "Some accessibility node evidence samples were omitted because of configured limits.",
    );
  }
  if (!partial && issues.length === 0) {
    notices.push(
      "No reportable accessibility violations were returned by the selected axe-core rule set for this desktop page state.",
    );
    notices.push(
      "This is not a WCAG certification. Automated tools cannot detect every accessibility problem, and different application states may produce different results.",
    );
  }

  return {
    analysis: {
      status: partial ? "PARTIAL" : "COMPLETE",
      engine: "axe-core",
      engineVersion: input.engineVersion,
      standards: [...AXE_WCAG_TAGS],
      violationRuleCount: input.violations.length,
      affectedNodeCount,
      reportedIssueCount: issues.length,
      issueLimitReached,
      nodeEvidenceLimitReached,
      notices: Array.from(new Set(notices)),
    },
    issues,
  };
}

/**
 * Runs axe-core on the desktop page after Phase 5 listeners have stopped.
 * Returns only violations; never returns raw HTML or full axe output.
 */
export async function analyzeAccessibility(input: {
  page: Page;
  finalPageUrl: string;
  config: ScannerConfig;
  scanRelativeMs: number;
  createId?: () => string;
}): Promise<{ analysis: AccessibilityAnalysis; issues: DiagnosticIssue[] }> {
  let engineVersion: string | undefined;
  let violations: AxeViolationLike[] = [];
  let analysisFailed = false;

  try {
    const builder = new AxeBuilder({ page: input.page }).withTags([
      ...AXE_WCAG_TAGS,
    ]);

    const result = await Promise.race([
      builder.analyze(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("ACCESSIBILITY_TIMEOUT")),
          input.config.accessibilityTimeoutMs,
        );
      }),
    ]);

    engineVersion =
      typeof result.testEngine?.version === "string"
        ? result.testEngine.version
        : undefined;
    violations = (result.violations ?? []) as AxeViolationLike[];
  } catch {
    analysisFailed = true;
  }

  return buildAccessibilityIssuesFromViolations({
    violations,
    config: input.config,
    finalPageUrl: input.finalPageUrl,
    scanRelativeMs: input.scanRelativeMs,
    createId: input.createId,
    engineVersion,
    analysisFailed,
  });
}

export function mapAxeImpactToSeverity(
  impact: string | null | undefined,
): Severity {
  if (impact === "critical" || impact === "serious") return "HIGH";
  if (impact === "moderate") return "MEDIUM";
  if (impact === "minor") return "LOW";
  return "INFO";
}

function impactRank(impact: string | null | undefined): number {
  if (impact === "critical") return 0;
  if (impact === "serious") return 1;
  if (impact === "moderate") return 2;
  if (impact === "minor") return 3;
  return 4;
}

function flattenTarget(target: unknown[] | undefined): string {
  if (!target || target.length === 0) return "Unavailable diagnostic URL";
  return target
    .map((part) => {
      if (typeof part === "string") return part;
      if (Array.isArray(part)) return part.map(String).join(" ");
      return String(part);
    })
    .join(" ");
}

function safeHelpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function emptyAccessibilityAnalysis(
  status: AccessibilityAnalysis["status"] = "NOT_REQUESTED",
): AccessibilityAnalysis {
  return {
    status,
    engine: "axe-core",
    standards: [...AXE_WCAG_TAGS],
    violationRuleCount: 0,
    affectedNodeCount: 0,
    reportedIssueCount: 0,
    issueLimitReached: false,
    nodeEvidenceLimitReached: false,
    notices:
      status === "NOT_REQUESTED"
        ? ["Accessibility analysis was not selected for this scan."]
        : [],
  };
}
