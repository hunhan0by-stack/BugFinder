import type { Browser, Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import {
  attachBrowserSafetyHandlers,
  attachPageSafetyHandlers,
  createScanContext,
} from "@/lib/scanner/browser-context";
import { isEligibleForActualClick } from "@/lib/scanner/interaction/candidate-types";
import type { InteractionCandidate } from "@/lib/scanner/interaction/candidate-types";
import { discoverInteractionCandidates } from "@/lib/scanner/interaction/discover-candidates";
import { attachStrictInteractionGate } from "@/lib/scanner/interaction/interaction-gate";
import { classifyObstructionFromPoints } from "@/lib/scanner/interaction/obstruction";
import {
  hasMeaningfulResponse,
  type ControlStateSnapshot,
} from "@/lib/scanner/interaction/state-snapshot";
import { navigateForBasicScan } from "@/lib/scanner/navigation";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type { DnsLookupFn } from "@/lib/security/dns-policy";
import { RequestGuard } from "@/lib/security/request-guard";
import { validateScanTarget } from "@/lib/security/target-policy";
import type {
  DiagnosticIssue,
  SafeInteractionAnalysis,
} from "@/types/scan";

export function emptySafeInteractionAnalysis(
  status: SafeInteractionAnalysis["status"] = "NOT_REQUESTED",
): SafeInteractionAnalysis {
  return {
    status,
    requested: status !== "NOT_REQUESTED",
    discoveredCandidateCount: 0,
    eligibleCandidateCount: 0,
    trialCheckedCount: 0,
    actualClickCount: 0,
    responsiveControlCount: 0,
    deadClickIssueCount: 0,
    obstructionIssueCount: 0,
    formStateIssueCount: 0,
    skippedUnsafeCount: 0,
    skippedNavigationCount: 0,
    skippedFormSubmissionCount: 0,
    skippedDestructiveCount: 0,
    skippedNetworkCount: 0,
    skippedPopupCount: 0,
    skippedDownloadCount: 0,
    skippedOffscreenCount: 0,
    skippedUnstableCount: 0,
    skippedUnknownRiskCount: 0,
    candidateLimitReached: false,
    clickLimitReached: false,
    mutationLimitReached: false,
    issueLimitReached: false,
    notices:
      status === "NOT_REQUESTED"
        ? ["Safe interaction analysis was not selected for this scan."]
        : [],
  };
}

function tallySkips(
  analysis: SafeInteractionAnalysis,
  candidate: InteractionCandidate,
): void {
  const c = candidate.classification;
  if (c === "SKIP_NAVIGATION") analysis.skippedNavigationCount += 1;
  else if (c === "SKIP_FORM_SUBMISSION" || c === "SKIP_FORM_RESET") {
    analysis.skippedFormSubmissionCount += 1;
  } else if (
    c === "SKIP_DESTRUCTIVE" ||
    c === "SKIP_ACCOUNT_ACTION" ||
    c === "SKIP_PAYMENT_ACTION" ||
    c === "SKIP_COMMUNICATION_ACTION"
  ) {
    analysis.skippedDestructiveCount += 1;
  } else if (c === "SKIP_NETWORK_PRONE") analysis.skippedNetworkCount += 1;
  else if (c === "SKIP_DOWNLOAD" || c === "SKIP_FILE_UPLOAD") {
    analysis.skippedDownloadCount += 1;
  } else if (c === "SKIP_OFFSCREEN") analysis.skippedOffscreenCount += 1;
  else if (c === "SKIP_UNKNOWN_RISK") analysis.skippedUnknownRiskCount += 1;
  else analysis.skippedUnsafeCount += 1;
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
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const ariaControls = el.getAttribute("aria-controls");
      let controlledVisible: boolean | null = null;
      if (ariaControls) {
        const target = document.getElementById(ariaControls);
        if (!target) controlledVisible = false;
        else {
          const style = window.getComputedStyle(target);
          controlledVisible =
            style.display !== "none" && style.visibility !== "hidden";
        }
      }
      const details = el.closest("details");
      const rect = el.getBoundingClientRect();
      return {
        disabled: Boolean((el as HTMLButtonElement).disabled),
        ariaDisabled: el.getAttribute("aria-disabled") === "true",
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaChecked: el.getAttribute("aria-checked"),
        ariaBusy: el.getAttribute("aria-busy") === "true",
        nativeChecked:
          "checked" in el ? Boolean((el as HTMLInputElement).checked) : null,
        detailsOpen: details ? details.open : null,
        focused: document.activeElement === el,
        controlledVisible,
        dialogCount: document.querySelectorAll('[role="dialog"]').length,
        menuCount: document.querySelectorAll('[role="menu"]').length,
        listboxCount: document.querySelectorAll('[role="listbox"]').length,
        popoverCount: document.querySelectorAll("[popover]").length,
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

async function measureObstruction(
  page: Page,
  selector: string,
): Promise<ReturnType<typeof classifyObstructionFromPoints>> {
  const points = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return [];
    const rect = el.getBoundingClientRect();
    const inset = 2;
    const samples = [
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: rect.left + inset, y: rect.top + inset },
      { x: rect.right - inset, y: rect.top + inset },
      { x: rect.left + inset, y: rect.bottom - inset },
      { x: rect.right - inset, y: rect.bottom - inset },
    ];
    return samples.map((point) => {
      const top = document.elementFromPoint(point.x, point.y);
      if (!top) return { blocked: true, byChildOrLabel: false };
      if (top === el || el.contains(top)) {
        return { blocked: false, byChildOrLabel: true };
      }
      if (top.tagName.toLowerCase() === "label") {
        const htmlFor = top.getAttribute("for");
        if ((htmlFor && htmlFor === el.id) || top.contains(el)) {
          return { blocked: false, byChildOrLabel: true };
        }
      }
      return { blocked: true, byChildOrLabel: false };
    });
  }, selector);
  return classifyObstructionFromPoints(points);
}

async function analyzeStaticFormState(
  page: Page,
  config: ScannerConfig,
  pageUrl: string,
  scanRelativeMs: number,
  createId: () => string,
  analysis: SafeInteractionAnalysis,
  issues: DiagnosticIssue[],
): Promise<void> {
  const orphans = await page.evaluate((max) => {
    const submits = Array.from(
      document.querySelectorAll(
        'button[type="submit"], input[type="submit"]',
      ),
    ).slice(0, max);
    return submits
      .map((el, index) => {
        const button = el as HTMLButtonElement;
        const hasForm = Boolean(button.form);
        const formAttr = button.getAttribute("form");
        const formTarget = formAttr
          ? document.getElementById(formAttr)
          : null;
        if (hasForm || formTarget) return null;
        const style = window.getComputedStyle(button);
        if (style.display === "none" || style.visibility === "hidden") {
          return null;
        }
        return {
          selector: `orphan-submit:${index}`,
          structuralHint: button.tagName.toLowerCase(),
        };
      })
      .filter(Boolean) as Array<{ selector: string; structuralHint: string }>;
  }, config.maxInteractionCandidates);

  for (const orphan of orphans) {
    if (issues.length >= config.maxInteractionIssues) {
      analysis.issueLimitReached = true;
      break;
    }
    issues.push({
      id: createId(),
      type: "FORM_STATE_ISSUE",
      severity: "INFO",
      confidence: 80,
      title: "Native submit control is not associated with a form",
      description:
        "A visible native submit control did not have a form owner during this scan. JavaScript may still handle it intentionally.",
      observedBehavior:
        "The control had type=submit but no form owner or matching form attribute target.",
      potentialUserImpact:
        "Users may expect form submission behavior that is not wired through a native form association.",
      technicalEvidence: sanitizeDiagnosticText(
        `Control kind: ${orphan.structuralHint}\nSubtype: ORPHANED_SUBMIT_CONTROL`,
        config.maxEvidenceLength,
      ).text,
      suggestedInvestigation:
        "Confirm whether the control should be associated with a form element or is intentionally handled by script.",
      scope: "SAME_ORIGIN",
      profile: "DESKTOP",
      pageUrl,
      occurrenceCount: 1,
      firstSeenMs: scanRelativeMs,
      lastSeenMs: scanRelativeMs,
      metadata: {
        subtype: "ORPHANED_SUBMIT_CONTROL",
        selector: orphan.selector,
      },
    });
    analysis.formStateIssueCount += 1;
  }
}

/**
 * Discovers candidates on the open desktop page, then runs bounded actual
 * clicks in fresh isolated contexts after the caller closes discovery.
 */
export async function runSafeInteractionAnalysis(input: {
  browser: Browser;
  targetHref: string;
  discoveryPage: Page;
  config: ScannerConfig;
  guard: RequestGuard;
  lookupFn?: DnsLookupFn;
  scanRelativeMs: () => number;
  ensureTimeRemaining: () => void;
  createId?: () => string;
}): Promise<{ analysis: SafeInteractionAnalysis; issues: DiagnosticIssue[] }> {
  const createId = input.createId ?? (() => crypto.randomUUID());
  const analysis = emptySafeInteractionAnalysis("COMPLETE");
  analysis.requested = true;
  const issues: DiagnosticIssue[] = [];
  const notices: string[] = [];
  const pageUrl = sanitizeDiagnosticUrl(
    input.targetHref,
    input.config.maxDiagnosticUrlLength,
  );

  let discovered: InteractionCandidate[] = [];
  try {
    input.ensureTimeRemaining();
    const discovery = await discoverInteractionCandidates(
      input.discoveryPage,
      input.config,
    );
    discovered = discovery.candidates;
    analysis.discoveredCandidateCount = discovered.length;
    analysis.candidateLimitReached = discovery.limitReached;
    if (discovery.limitReached) {
      notices.push(
        "Interaction candidate discovery reached the configured limit.",
      );
    }
  } catch {
    notices.push(
      "Safe interaction candidate discovery could not complete for this page state.",
    );
    analysis.status = "PARTIAL";
    analysis.notices = notices;
    return { analysis, issues };
  }

  for (const candidate of discovered) {
    if (!isEligibleForActualClick(candidate.classification)) {
      tallySkips(analysis, candidate);
    }
  }

  const eligible = discovered.filter(
    (candidate) =>
      isEligibleForActualClick(candidate.classification) &&
      candidate.inViewport &&
      candidate.visible &&
      !candidate.disabled &&
      !candidate.ariaDisabled,
  );
  analysis.eligibleCandidateCount = eligible.length;

  await analyzeStaticFormState(
    input.discoveryPage,
    input.config,
    pageUrl,
    input.scanRelativeMs(),
    createId,
    analysis,
    issues,
  );

  const toClick = eligible.slice(0, input.config.maxSafeClicks);
  if (eligible.length > input.config.maxSafeClicks) {
    analysis.clickLimitReached = true;
    notices.push(
      "Safe-click limit reached before every eligible control could be tested.",
    );
  }

  // Discovery page must be closed by the caller before executeCandidateClicks.
  // This function continues with clicks using fresh contexts.
  for (const candidate of toClick) {
    try {
      input.ensureTimeRemaining();
    } catch {
      analysis.status = "PARTIAL";
      notices.push(
        "Safe interaction analysis stopped early because the total scan deadline was near.",
      );
      break;
    }

    let context = null;
    let page = null;
    try {
      context = await createScanContext(input.browser);
      attachBrowserSafetyHandlers(context, notices);
      await input.guard.attach(context);
      page = await context.newPage();
      attachPageSafetyHandlers(page, notices);

      const navigation = await navigateForBasicScan(
        page,
        input.targetHref,
        input.config,
      );
      const guardFailure = input.guard.getFailure();
      if (guardFailure) throw guardFailure;
      await validateScanTarget(navigation.finalUrl, {
        config: input.config,
        lookupFn: input.lookupFn,
      });

      const matchCount = await page.locator(
        candidate.fingerprint.structuralSelector,
      ).count();
      if (matchCount !== 1) {
        analysis.skippedUnstableCount += 1;
        continue;
      }

      const locator = page.locator(candidate.fingerprint.structuralSelector);
      analysis.trialCheckedCount += 1;

      const obstruction = await measureObstruction(
        page,
        candidate.fingerprint.structuralSelector,
      );
      if (obstruction.kind === "full" || obstruction.kind === "partial") {
        if (issues.length >= input.config.maxInteractionIssues) {
          analysis.issueLimitReached = true;
          continue;
        }
        issues.push({
          id: createId(),
          type: "OBSTRUCTED_CONTROL",
          severity: obstruction.kind === "full" ? "MEDIUM" : "LOW",
          confidence: obstruction.kind === "full" ? 99 : 95,
          title: "Interactive control is obstructed",
          description:
            "A visible control could not receive a normal pointer interaction because another rendered element covered its clickable area.",
          observedBehavior:
            obstruction.kind === "full"
              ? "Hit-testing reported that another element intercepted the control’s meaningful click points."
              : "Hit-testing reported that some meaningful click points were intercepted while others remained reachable.",
          potentialUserImpact:
            "Users may be unable to activate the control with a pointer at its visible position.",
          technicalEvidence: sanitizeDiagnosticText(
            [
              `Selector: ${candidate.fingerprint.structuralSelector}`,
              `Obstruction: ${obstruction.kind}`,
              `Blocked points: ${obstruction.blockedPointCount}/${obstruction.testedPointCount}`,
            ].join("\n"),
            input.config.maxEvidenceLength,
          ).text,
          suggestedInvestigation:
            "Inspect overlays, fixed elements, stacking contexts, pointer-events, z-index, and element positioning around the affected control.",
          scope: "SAME_ORIGIN",
          profile: "DESKTOP",
          pageUrl,
          occurrenceCount: 1,
          firstSeenMs: input.scanRelativeMs(),
          lastSeenMs: input.scanRelativeMs(),
          metadata: {
            obstructionKind: obstruction.kind,
            selector: candidate.fingerprint.structuralSelector,
          },
        });
        analysis.obstructionIssueCount += 1;
        if (obstruction.kind === "full") {
          continue;
        }
      }

      try {
        await locator.click({
          trial: true,
          timeout: Math.min(3_000, input.config.interactionContextTimeoutMs),
        });
      } catch {
        // Trial failure without geometry obstruction → skip as unstable/disabled.
        analysis.skippedUnstableCount += 1;
        continue;
      }

      if (input.config.interactionPreclickQuietMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, input.config.interactionPreclickQuietMs);
        });
      }

      const gate = await attachStrictInteractionGate(
        page,
        input.guard.intentionalAborts,
      );
      const before = await captureState(
        page,
        candidate.fingerprint.structuralSelector,
      );
      if (!before) {
        analysis.skippedUnstableCount += 1;
        await gate.dispose();
        continue;
      }

      try {
        await locator.click({
          timeout: Math.min(5_000, input.config.interactionContextTimeoutMs),
        });
        analysis.actualClickCount += 1;
      } catch {
        analysis.skippedUnstableCount += 1;
        await gate.dispose();
        continue;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, input.config.interactionSettleMs);
      });
      const after = await captureState(
        page,
        candidate.fingerprint.structuralSelector,
      );
      const gateStats = gate.getStats();
      await gate.dispose();

      if (
        gateStats.networkAttempts > 0 ||
        gateStats.navigationAttempts > 0 ||
        gateStats.popupAttempts > 0 ||
        gateStats.downloadAttempts > 0 ||
        gateStats.submitAttempts > 0 ||
        gateStats.fileChooserAttempts > 0
      ) {
        if (gateStats.networkAttempts > 0) analysis.skippedNetworkCount += 1;
        if (gateStats.navigationAttempts > 0) {
          analysis.skippedNavigationCount += 1;
        }
        if (gateStats.popupAttempts > 0) analysis.skippedPopupCount += 1;
        if (gateStats.downloadAttempts > 0) analysis.skippedDownloadCount += 1;
        if (gateStats.submitAttempts > 0) {
          analysis.skippedFormSubmissionCount += 1;
        }
        continue;
      }

      if (!after) {
        analysis.skippedUnstableCount += 1;
        continue;
      }

      const diff = hasMeaningfulResponse(before, after);
      if (diff.meaningful) {
        analysis.responsiveControlCount += 1;
        continue;
      }

      if (diff.stayedBusy || diff.stayedDisabled) {
        if (issues.length >= input.config.maxInteractionIssues) {
          analysis.issueLimitReached = true;
          continue;
        }
        issues.push({
          id: createId(),
          type: "FORM_STATE_ISSUE",
          severity: "MEDIUM",
          confidence: 92,
          title: "Control entered a busy or disabled state without recovery",
          description:
            "The control entered a busy or disabled state and did not recover during the configured observation period.",
          observedBehavior:
            "After a safe local click with network and navigation blocked, the control remained busy or disabled without another observable success state.",
          potentialUserImpact:
            "Users may perceive the control as stuck after activation.",
          technicalEvidence: sanitizeDiagnosticText(
            [
              `Selector: ${candidate.fingerprint.structuralSelector}`,
              `Subtype: ${diff.stayedBusy ? "PERSISTENT_BUSY_STATE" : "PERSISTENT_DISABLED_STATE"}`,
            ].join("\n"),
            input.config.maxEvidenceLength,
          ).text,
          suggestedInvestigation:
            "Confirm loading and disabled transitions clear when local work completes, and that success or error feedback is visible.",
          scope: "SAME_ORIGIN",
          profile: "DESKTOP",
          pageUrl,
          occurrenceCount: 1,
          firstSeenMs: input.scanRelativeMs(),
          lastSeenMs: input.scanRelativeMs(),
          metadata: {
            subtype: diff.stayedBusy
              ? "PERSISTENT_BUSY_STATE"
              : "PERSISTENT_DISABLED_STATE",
            selector: candidate.fingerprint.structuralSelector,
          },
        });
        analysis.formStateIssueCount += 1;
        continue;
      }

      if (issues.length >= input.config.maxInteractionIssues) {
        analysis.issueLimitReached = true;
        continue;
      }
      issues.push({
        id: createId(),
        type: "DEAD_CLICK",
        severity: "MEDIUM",
        confidence: 97,
        title: "Interactive control produced no observable response",
        description:
          "The scanner activated a restricted non-destructive control, but no reportable local state or interface change was observed during the bounded observation period.",
        observedBehavior:
          "The control accepted a normal pointer click. Checked, expanded, pressed, controlled-element, geometry, and bounded DOM-mutation signals remained unchanged.",
        potentialUserImpact:
          "Users may perceive the control as unresponsive or may be unable to access the intended interface behavior.",
        technicalEvidence: sanitizeDiagnosticText(
          [
            `Selector: ${candidate.fingerprint.structuralSelector}`,
            `Role: ${candidate.fingerprint.role || "none"}`,
            `Tag: ${candidate.fingerprint.tagName}`,
            "Limitation: This check covers one isolated click without navigation or network access.",
          ].join("\n"),
          input.config.maxEvidenceLength,
        ).text,
        suggestedInvestigation:
          "Confirm that the control has an active event handler, that the handler is not failing silently, and that the expected state or visible feedback is updated after activation.",
        scope: "SAME_ORIGIN",
        profile: "DESKTOP",
        pageUrl,
        occurrenceCount: 1,
        firstSeenMs: input.scanRelativeMs(),
        lastSeenMs: input.scanRelativeMs(),
        metadata: {
          selector: candidate.fingerprint.structuralSelector,
          role: candidate.fingerprint.role || null,
          tagName: candidate.fingerprint.tagName,
        },
      });
      analysis.deadClickIssueCount += 1;
    } catch {
      analysis.status = "PARTIAL";
      notices.push(
        "One or more interaction contexts could not complete safely.",
      );
    } finally {
      await closeQuietly(page);
      await closeQuietly(context);
    }
  }

  if (analysis.candidateLimitReached || analysis.clickLimitReached) {
    analysis.status = "PARTIAL";
  }
  if (analysis.issueLimitReached || analysis.mutationLimitReached) {
    analysis.status = "PARTIAL";
  }

  if (issues.length === 0) {
    if (analysis.actualClickCount === 0 && analysis.eligibleCandidateCount === 0) {
      notices.push(
        "No controls met the strict safety requirements for an actual click during this page state.",
      );
    } else {
      notices.push(
        "No reportable dead-click, obstruction, or form-state findings were captured from the controls that were eligible for the bounded safe-interaction check.",
      );
    }
    notices.push(
      "This does not prove that every control works. Navigation, submissions, network actions, offscreen controls, destructive actions, mobile interactions, and multi-step workflows were intentionally excluded.",
    );
  }

  notices.push(
    "Only controls that passed strict non-destructive safety checks were eligible for an actual click.",
  );
  notices.push(
    "Each actual click ran in a fresh isolated browser context.",
  );

  analysis.notices = Array.from(new Set([...analysis.notices, ...notices]));
  analysis.deadClickIssueCount = issues.filter(
    (issue) => issue.type === "DEAD_CLICK",
  ).length;
  analysis.obstructionIssueCount = issues.filter(
    (issue) => issue.type === "OBSTRUCTED_CONTROL",
  ).length;
  analysis.formStateIssueCount = issues.filter(
    (issue) => issue.type === "FORM_STATE_ISSUE",
  ).length;

  return { analysis, issues };
}
