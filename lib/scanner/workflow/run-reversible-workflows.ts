import "server-only";

import type { Browser, Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import {
  attachBrowserSafetyHandlers,
  attachPageSafetyHandlers,
  createScanContext,
} from "@/lib/scanner/browser-context";
import type { InteractionCandidate } from "@/lib/scanner/interaction/candidate-types";
import { isEligibleForActualClick } from "@/lib/scanner/interaction/candidate-types";
import { attachStrictInteractionGate } from "@/lib/scanner/interaction/interaction-gate";
import { classifyObstructionFromPoints } from "@/lib/scanner/interaction/obstruction";
import {
  type ControlStateSnapshot,
} from "@/lib/scanner/interaction/state-snapshot";
import { navigateForBasicScan } from "@/lib/scanner/navigation";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type { DnsLookupFn } from "@/lib/security/dns-policy";
import { RequestGuard } from "@/lib/security/request-guard";
import { validateScanTarget } from "@/lib/security/target-policy";
import {
  captureClippedEvidence,
  type EvidenceBudget,
} from "@/lib/scanner/evidence/capture-evidence";
import type {
  DiagnosticIssue,
  ReversibleWorkflowAnalysis,
} from "@/types/scan";

export function emptyReversibleWorkflowAnalysis(
  status: ReversibleWorkflowAnalysis["status"] = "NOT_REQUESTED",
): ReversibleWorkflowAnalysis {
  return {
    status,
    requested: status !== "NOT_REQUESTED",
    discoveredReversibleCandidateCount: 0,
    eligibleWorkflowCount: 0,
    attemptedWorkflowCount: 0,
    completedWorkflowCount: 0,
    successfulReversalCount: 0,
    stateTransitionIssueCount: 0,
    skippedUnsafeCount: 0,
    skippedNetworkCount: 0,
    skippedNavigationCount: 0,
    skippedObstructionCount: 0,
    skippedUnstableCount: 0,
    skippedBusyCount: 0,
    workflowLimitReached: false,
    mutationLimitReached: false,
    issueLimitReached: false,
    notices:
      status === "NOT_REQUESTED"
        ? ["Reversible workflow analysis was not selected for this scan."]
        : [],
  };
}

export type ReversibleKind =
  | "checkbox"
  | "details"
  | "aria-pressed"
  | "aria-expanded"
  | "aria-checked"
  | "role-switch";

export function classifyReversibleKind(
  candidate: InteractionCandidate,
): ReversibleKind | null {
  if (!isEligibleForActualClick(candidate.classification)) return null;
  const fp = candidate.fingerprint;
  if (fp.tagName === "input" && fp.inputType === "radio") return null;
  if (fp.tagName === "input" && fp.inputType === "checkbox") return "checkbox";
  if (fp.tagName === "summary") return "details";
  if (fp.hasAriaPressed) return "aria-pressed";
  if (fp.hasAriaExpanded) return "aria-expanded";
  if (fp.role === "switch") return "role-switch";
  if (fp.role === "checkbox" || fp.hasAriaChecked) return "aria-checked";
  return null;
}

function primaryState(
  snapshot: ControlStateSnapshot,
  kind: ReversibleKind,
): string | null {
  if (kind === "checkbox") {
    if (snapshot.nativeChecked === null) return null;
    return snapshot.nativeChecked ? "true" : "false";
  }
  if (kind === "details") {
    if (snapshot.detailsOpen === null) return null;
    return snapshot.detailsOpen ? "true" : "false";
  }
  if (kind === "aria-pressed") return snapshot.ariaPressed;
  if (kind === "aria-expanded") return snapshot.ariaExpanded;
  if (kind === "aria-checked" || kind === "role-switch") {
    return snapshot.ariaChecked ?? (snapshot.nativeChecked === null
      ? null
      : snapshot.nativeChecked
        ? "true"
        : "false");
  }
  return null;
}

function isTriState(value: string | null): boolean {
  return value === "mixed";
}

async function closeQuietly(
  resource: { close: () => Promise<void> } | null,
): Promise<void> {
  if (!resource) return;
  try {
    await resource.close();
  } catch {
    // ignore
  }
}

async function captureState(
  page: Page,
  selector: string,
): Promise<ControlStateSnapshot | null> {
  try {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) return null;
      const ariaBusy = el.getAttribute("aria-busy");
      const ariaControls = el.getAttribute("aria-controls");
      let controlledVisible: boolean | null = null;
      if (ariaControls) {
        const target = document.getElementById(ariaControls);
        if (!target) controlledVisible = false;
        else {
          const style = window.getComputedStyle(target);
          controlledVisible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !target.hasAttribute("hidden");
        }
      }
      const details = el.closest("details");
      const rect = el.getBoundingClientRect();
      return {
        disabled:
          el instanceof HTMLButtonElement || el instanceof HTMLInputElement
            ? el.disabled
            : el.hasAttribute("disabled"),
        ariaDisabled: el.getAttribute("aria-disabled") === "true",
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaChecked: el.getAttribute("aria-checked"),
        ariaBusy: ariaBusy === "true",
        nativeChecked:
          el instanceof HTMLInputElement &&
          (el.type === "checkbox" || el.type === "radio")
            ? el.checked
            : null,
        detailsOpen: details ? (details as HTMLDetailsElement).open : null,
        focused: document.activeElement === el,
        controlledVisible,
        dialogCount: document.querySelectorAll(
          '[role="dialog"]:not([hidden]), dialog[open]',
        ).length,
        menuCount: document.querySelectorAll('[role="menu"]:not([hidden])')
          .length,
        listboxCount: document.querySelectorAll(
          '[role="listbox"]:not([hidden])',
        ).length,
        popoverCount: document.querySelectorAll(":popover-open").length,
        openDetailsCount: document.querySelectorAll("details[open]").length,
        childListMutations: 0,
        attributeMutations: 0,
        width: rect.width,
        height: rect.height,
      };
    }, selector);
  } catch {
    return null;
  }
}

export async function runReversibleWorkflows(input: {
  browser: Browser;
  targetHref: string;
  candidates: InteractionCandidate[];
  excludedSelectors: Set<string>;
  config: ScannerConfig;
  guard: RequestGuard;
  lookupFn?: DnsLookupFn;
  scanRelativeMs: () => number;
  ensureTimeRemaining: (reserveMs?: number) => void;
  remainingClickBudget: () => number;
  consumeClicks: (count: number) => void;
  evidenceBudget?: EvidenceBudget | null;
}): Promise<{
  analysis: ReversibleWorkflowAnalysis;
  issues: DiagnosticIssue[];
}> {
  const analysis = emptyReversibleWorkflowAnalysis("COMPLETE");
  const issues: DiagnosticIssue[] = [];
  const pageUrl = sanitizeDiagnosticUrl(
    input.targetHref,
    input.config.maxDiagnosticUrlLength,
  );

  const reversible = input.candidates
    .map((candidate) => ({
      candidate,
      kind: classifyReversibleKind(candidate),
    }))
    .filter(
      (entry): entry is { candidate: InteractionCandidate; kind: ReversibleKind } =>
        entry.kind !== null &&
        !input.excludedSelectors.has(
          entry.candidate.fingerprint.structuralSelector,
        ),
    );

  analysis.discoveredReversibleCandidateCount = reversible.length;
  const selected = reversible.slice(0, input.config.maxReversibleWorkflows);
  analysis.eligibleWorkflowCount = selected.length;
  if (reversible.length > selected.length) {
    analysis.workflowLimitReached = true;
    analysis.status = "PARTIAL";
    analysis.notices.push(
      "Reversible workflow candidate limit was reached. Not every eligible control was tested.",
    );
  }

  for (const { candidate, kind } of selected) {
    if (input.remainingClickBudget() < 2) {
      analysis.status = "PARTIAL";
      analysis.notices.push(
        "Global click budget was exhausted before remaining reversible workflows.",
      );
      break;
    }
    try {
      input.ensureTimeRemaining(input.config.workflowContextTimeoutMs);
    } catch {
      analysis.status = "PARTIAL";
      analysis.notices.push(
        "Total scan deadline prevented additional reversible workflows.",
      );
      break;
    }

    analysis.attemptedWorkflowCount += 1;
    let context = null;
    let page = null;
    try {
      context = await createScanContext(input.browser);
      page = await context.newPage();
      const safetyNotices: string[] = [];
      attachBrowserSafetyHandlers(context, safetyNotices);
      attachPageSafetyHandlers(page, safetyNotices);
      await input.guard.attach(context);
      const navigation = await navigateForBasicScan(
        page,
        input.targetHref,
        input.config,
      );
      await validateScanTarget(navigation.finalUrl, {
        config: input.config,
        lookupFn: input.lookupFn,
      });

      const matches = await page.locator(candidate.fingerprint.structuralSelector).count();
      if (matches !== 1) {
        analysis.skippedUnstableCount += 1;
        continue;
      }
      const locator = page.locator(candidate.fingerprint.structuralSelector).first();
      const baseline = await captureState(
        page,
        candidate.fingerprint.structuralSelector,
      );
      if (!baseline) {
        analysis.skippedUnstableCount += 1;
        continue;
      }
      const baselinePrimary = primaryState(baseline, kind);
      if (!baselinePrimary || isTriState(baselinePrimary)) {
        analysis.skippedUnsafeCount += 1;
        continue;
      }
      if (baseline.disabled || baseline.ariaDisabled || baseline.ariaBusy) {
        analysis.skippedBusyCount += 1;
        continue;
      }

      const points = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement)) return null;
        const rect = el.getBoundingClientRect();
        const samples = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + 4, rect.top + 4],
          [rect.right - 4, rect.top + 4],
          [rect.left + 4, rect.bottom - 4],
          [rect.right - 4, rect.bottom - 4],
        ] as const;
        return samples.map(([x, y]) => {
          const top = document.elementFromPoint(x, y);
          const ok =
            top === el ||
            (top instanceof Node && el.contains(top)) ||
            (top instanceof HTMLLabelElement &&
              top.control instanceof HTMLElement &&
              (top.control === el || el.contains(top.control)));
          return { blocked: !ok };
        });
      }, candidate.fingerprint.structuralSelector);
      const obstruction = classifyObstructionFromPoints(
        points?.map((point) => ({
          blocked: point.blocked,
          byChildOrLabel: false,
        })) ?? [],
      );
      if (obstruction.kind === "full") {
        analysis.skippedObstructionCount += 1;
        continue;
      }

      await locator.click({
        trial: true,
        timeout: Math.min(3_000, input.config.workflowContextTimeoutMs),
      });

      const gate1 = await attachStrictInteractionGate(
        page,
        input.guard.intentionalAborts,
      );
      input.consumeClicks(1);
      await locator.click({
        timeout: Math.min(5_000, input.config.workflowContextTimeoutMs),
      });
      await new Promise((resolve) => {
        setTimeout(resolve, input.config.workflowSettleMs);
      });
      const afterFirst = await captureState(
        page,
        candidate.fingerprint.structuralSelector,
      );
      const gate1Stats = gate1.getStats();
      await gate1.dispose();

      if (
        gate1Stats.networkAttempts > 0 ||
        gate1Stats.navigationAttempts > 0 ||
        gate1Stats.popupAttempts > 0 ||
        gate1Stats.downloadAttempts > 0 ||
        gate1Stats.submitAttempts > 0
      ) {
        if (gate1Stats.networkAttempts > 0) analysis.skippedNetworkCount += 1;
        if (gate1Stats.navigationAttempts > 0) {
          analysis.skippedNavigationCount += 1;
        }
        continue;
      }
      if (!afterFirst) {
        analysis.skippedUnstableCount += 1;
        continue;
      }
      const afterFirstPrimary = primaryState(afterFirst, kind);
      if (!afterFirstPrimary || afterFirstPrimary === baselinePrimary) {
        // First click did not change state — prefer existing DEAD_CLICK; skip duplicate.
        continue;
      }
      if (afterFirst.ariaBusy || afterFirst.disabled || afterFirst.ariaDisabled) {
        analysis.skippedBusyCount += 1;
        continue;
      }

      // Second click eligibility
      try {
        await locator.click({
          trial: true,
          timeout: Math.min(3_000, input.config.workflowContextTimeoutMs),
        });
      } catch {
        if (issues.length < input.config.maxWorkflowIssues) {
          issues.push({
            id: crypto.randomUUID(),
            type: "STATE_TRANSITION_ISSUE",
            severity: "MEDIUM",
            confidence: 96,
            title: "Control could not reverse its local state",
            description:
              "The control entered a new local state, but the reversal click could not be completed safely.",
            observedBehavior:
              "After a successful local state transition, the second trial click failed due to obstruction, disablement, or instability.",
            potentialUserImpact:
              "Users may be unable to return the control to its previous local state.",
            technicalEvidence: sanitizeDiagnosticText(
              [
                `Selector: ${candidate.fingerprint.structuralSelector}`,
                "Subtype: REVERSAL_OBSTRUCTED",
              ].join("\n"),
              input.config.maxEvidenceLength,
            ).text,
            suggestedInvestigation:
              "Inspect overlays and disabled transitions that appear after the first activation.",
            scope: "SAME_ORIGIN",
            profile: "DESKTOP",
            pageUrl,
            occurrenceCount: 1,
            firstSeenMs: input.scanRelativeMs(),
            lastSeenMs: input.scanRelativeMs(),
            metadata: {
              subtype: "REVERSAL_OBSTRUCTED",
              selector: candidate.fingerprint.structuralSelector,
            },
          });
        }
        continue;
      }

      const gate2 = await attachStrictInteractionGate(
        page,
        input.guard.intentionalAborts,
      );
      input.consumeClicks(1);
      await locator.click({
        timeout: Math.min(5_000, input.config.workflowContextTimeoutMs),
      });
      await new Promise((resolve) => {
        setTimeout(resolve, input.config.workflowSettleMs);
      });
      const afterSecond = await captureState(
        page,
        candidate.fingerprint.structuralSelector,
      );
      const gate2Stats = gate2.getStats();
      await gate2.dispose();

      if (
        gate2Stats.networkAttempts > 0 ||
        gate2Stats.navigationAttempts > 0 ||
        gate2Stats.popupAttempts > 0 ||
        gate2Stats.downloadAttempts > 0 ||
        gate2Stats.submitAttempts > 0
      ) {
        if (gate2Stats.networkAttempts > 0) analysis.skippedNetworkCount += 1;
        if (gate2Stats.navigationAttempts > 0) {
          analysis.skippedNavigationCount += 1;
        }
        continue;
      }

      analysis.completedWorkflowCount += 1;
      const restored = afterSecond
        ? primaryState(afterSecond, kind) === baselinePrimary
        : false;

      if (restored) {
        analysis.successfulReversalCount += 1;
        // Controlled target mismatch check for expanded disclosures
        if (
          kind === "aria-expanded" &&
          afterFirst.controlledVisible === false &&
          afterFirstPrimary === "true"
        ) {
          if (issues.length < input.config.maxWorkflowIssues) {
            issues.push({
              id: crypto.randomUUID(),
              type: "STATE_TRANSITION_ISSUE",
              severity: "LOW",
              confidence: 92,
              title: "Expanded control state and panel visibility disagree",
              description:
                "The control reported an expanded state, but the controlled local target did not become visible.",
              observedBehavior:
                "aria-expanded changed while the referenced controlled target remained hidden.",
              potentialUserImpact:
                "Users may believe a panel opened when no visible content changed.",
              technicalEvidence: sanitizeDiagnosticText(
                [
                  `Selector: ${candidate.fingerprint.structuralSelector}`,
                  "Subtype: CONTROLLED_TARGET_STATE_MISMATCH",
                ].join("\n"),
                input.config.maxEvidenceLength,
              ).text,
              suggestedInvestigation:
                "Confirm aria-controls targets the intended same-document panel and that visibility updates with expansion.",
              scope: "SAME_ORIGIN",
              profile: "DESKTOP",
              pageUrl,
              occurrenceCount: 1,
              firstSeenMs: input.scanRelativeMs(),
              lastSeenMs: input.scanRelativeMs(),
              metadata: {
                subtype: "CONTROLLED_TARGET_STATE_MISMATCH",
                selector: candidate.fingerprint.structuralSelector,
              },
            });
          }
        }
        continue;
      }

      if (issues.length >= input.config.maxWorkflowIssues) {
        analysis.issueLimitReached = true;
        analysis.status = "PARTIAL";
        continue;
      }
      const transitionIssue: DiagnosticIssue = {
        id: crypto.randomUUID(),
        type: "STATE_TRANSITION_ISSUE",
        severity: "MEDIUM",
        confidence: 97,
        title: "Control did not return to its baseline state",
        description:
          "The control changed local state after the first click, but the second click did not restore the original reversible state during the bounded observation period.",
        observedBehavior:
          "A reversible local state transition was observed, then the baseline boolean state was not restored after the second isolated click.",
        potentialUserImpact:
          "Users may be unable to toggle the control back to its previous state.",
        technicalEvidence: sanitizeDiagnosticText(
          [
            `Selector: ${candidate.fingerprint.structuralSelector}`,
            `Kind: ${kind}`,
            `Baseline: ${baselinePrimary}`,
            `After first: ${afterFirstPrimary}`,
            `After second: ${afterSecond ? primaryState(afterSecond, kind) : "missing"}`,
            "Subtype: FAILED_TO_RETURN_TO_BASELINE",
          ].join("\n"),
          input.config.maxEvidenceLength,
        ).text,
        suggestedInvestigation:
          "Verify the toggle handler restores the original state and that no overlay or disablement blocks the reversal click.",
        scope: "SAME_ORIGIN",
        profile: "DESKTOP",
        pageUrl,
        occurrenceCount: 1,
        firstSeenMs: input.scanRelativeMs(),
        lastSeenMs: input.scanRelativeMs(),
        metadata: {
          subtype: "FAILED_TO_RETURN_TO_BASELINE",
          selector: candidate.fingerprint.structuralSelector,
          reversibleKind: kind,
        },
      };
      if (input.evidenceBudget && page) {
        try {
          const box = await locator.boundingBox({ timeout: 1_000 });
          if (box) {
            const artifact = await captureClippedEvidence({
              budget: input.evidenceBudget,
              page,
              profile: "DESKTOP",
              kind: "AFTER_REVERSAL",
              issueId: transitionIssue.id,
              selector: candidate.fingerprint.structuralSelector,
              stateLabel: "AFTER_REVERSAL",
              box,
              scanRelativeMs: input.scanRelativeMs,
            });
            if (artifact) {
              transitionIssue.evidenceIds = [artifact.id];
            }
          }
        } catch {
          input.evidenceBudget.analysis.status = "PARTIAL";
        }
      }
      issues.push(transitionIssue);
    } catch {
      analysis.status = "PARTIAL";
      analysis.skippedUnstableCount += 1;
    } finally {
      await closeQuietly(page);
      await closeQuietly(context);
    }
  }

  analysis.stateTransitionIssueCount = issues.length;
  if (selected.length === 0) {
    analysis.notices.push(
      "No controls met the strict reversible-workflow requirements in the scanned page state.",
    );
  }
  return { analysis, issues };
}
