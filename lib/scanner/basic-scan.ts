import "server-only";

import type { Browser, BrowserContext, Page } from "playwright";
import {
  getScannerConfig,
  type ScannerConfig,
} from "@/lib/config/scanner-config";
import { launchScannerBrowser } from "@/lib/scanner/browser";
import {
  attachBrowserSafetyHandlers,
  attachPageSafetyHandlers,
  createMobileScanContext,
  createScanContext,
} from "@/lib/scanner/browser-context";
import {
  analyzeAccessibility,
  emptyAccessibilityAnalysis,
} from "@/lib/scanner/diagnostics/accessibility-analysis";
import {
  analyzeBrokenImages,
  emptyBrokenImageAnalysis,
  suppressDuplicateImageNetworkIssues,
} from "@/lib/scanner/diagnostics/broken-image-analysis";
import {
  emptySafeInteractionAnalysis,
  runSafeInteractionAnalysis,
} from "@/lib/scanner/interaction/run-safe-interactions";
import {
  createEvidenceBudget,
  emptyIssueEvidenceAnalysis,
  captureClippedEvidence,
} from "@/lib/scanner/evidence/capture-evidence";
import {
  emptyReversibleWorkflowAnalysis,
  runReversibleWorkflows,
} from "@/lib/scanner/workflow/run-reversible-workflows";
import type { InteractionCandidate } from "@/lib/scanner/interaction/candidate-types";
import { normalizeScanOptions } from "@/lib/utils/scan-options";
import {
  createDiagnosticLimitsFromConfig,
  DiagnosticCollector,
} from "@/lib/scanner/diagnostics/collector";
import {
  createSeveritySummary,
  createTypeSummary,
  deriveOverallDiagnosticStatus,
  sortDiagnosticIssues,
} from "@/lib/scanner/diagnostics/create-summary";
import { ImageOutcomeObserver } from "@/lib/scanner/diagnostics/image-outcome-observer";
import {
  analyzeMobileLayout,
  emptyMobileLayoutAnalysis,
} from "@/lib/scanner/diagnostics/mobile-layout-analysis";
import { navigateForBasicScan } from "@/lib/scanner/navigation";
import { isScanError, ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import { scanLimiter } from "@/lib/scanner/scan-limiter";
import { removeScanDirectoryIfEmpty } from "@/lib/scanner/scan-storage";
import {
  captureDesktopScreenshot,
  captureMobileScreenshot,
} from "@/lib/scanner/screenshot";
import type { DnsLookupFn } from "@/lib/security/dns-policy";
import { RequestGuard } from "@/lib/security/request-guard";
import { validateScanTarget } from "@/lib/security/target-policy";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import { redactUrl } from "@/lib/utils/redact-url";
import type {
  AccessibilityAnalysis,
  BasicScanResult,
  BasicScreenshotResult,
  BrokenImageAnalysis,
  DeferredCheck,
  DiagnosticCapabilityStatuses,
  DiagnosticIssue,
  DiagnosticResult,
  IssueEvidenceAnalysis,
  MobileLayoutAnalysis,
  ReversibleWorkflowAnalysis,
  SafeInteractionAnalysis,
  ScanOptions,
} from "@/types/scan";

export type BasicScanInput = {
  scanId: string;
  url: string;
  options: ScanOptions;
};

export type BasicScanDependencies = {
  config?: ScannerConfig;
  lookupFn?: DnsLookupFn;
  now?: () => Date;
};

async function closeQuietly(
  resource: { close: () => Promise<void> } | null | undefined,
): Promise<void> {
  if (!resource) {
    return;
  }
  try {
    await resource.close();
  } catch {
    // Cleanup must not hide the original error.
  }
}

function buildDeferredChecks(): DeferredCheck[] {
  return [];
}

function buildExecutedCapabilities(
  options: ScanOptions,
  desktopScreenshot: boolean,
  mobileScreenshot: boolean,
): string[] {
  const capabilities = ["basicNavigation"];
  if (options.consoleErrors) {
    capabilities.push("consoleErrorDiagnostics");
    capabilities.push("uncaughtExceptionDiagnostics");
  }
  if (options.networkErrors) {
    capabilities.push("failedRequestDiagnostics");
    capabilities.push("httpErrorResponseDiagnostics");
  }
  if (options.brokenImages) {
    capabilities.push("brokenImageAnalysis");
  }
  if (options.mobileLayout) {
    capabilities.push("mobileLayoutAnalysis");
  }
  if (options.accessibility) {
    capabilities.push("accessibilityAnalysis");
  }
  if (options.safeInteractions) {
    capabilities.push("safeInteractionAnalysis");
  }
  if (options.issueEvidence) {
    capabilities.push("issueEvidenceAnalysis");
  }
  if (options.reversibleWorkflows) {
    capabilities.push("reversibleWorkflowAnalysis");
  }
  if (options.screenshots && desktopScreenshot) {
    capabilities.push("desktopScreenshot");
  }
  if (options.screenshots && mobileScreenshot) {
    capabilities.push("mobileScreenshot");
  }
  return capabilities;
}

async function attachSelectorEvidence(input: {
  budget: NonNullable<ReturnType<typeof createEvidenceBudget>>;
  page: Page;
  profile: "DESKTOP" | "MOBILE";
  issues: DiagnosticIssue[];
  scanRelativeMs: () => number;
  kinds?: Partial<
    Record<
      DiagnosticIssue["type"],
      "ELEMENT_SCREENSHOT" | "CONTEXT_SCREENSHOT"
    >
  >;
}): Promise<void> {
  const priority: DiagnosticIssue["type"][] = [
    "STATE_TRANSITION_ISSUE",
    "OBSTRUCTED_CONTROL",
    "DEAD_CLICK",
    "FORM_STATE_ISSUE",
    "BROKEN_IMAGE",
    "MOBILE_OVERFLOW",
    "ACCESSIBILITY_VIOLATION",
  ];
  const sorted = [...input.issues].sort((a, b) => {
    const pa = priority.indexOf(a.type);
    const pb = priority.indexOf(b.type);
    const rankA = pa === -1 ? 99 : pa;
    const rankB = pb === -1 ? 99 : pb;
    if (rankA !== rankB) return rankA - rankB;
    return a.firstSeenMs - b.firstSeenMs;
  });

  for (const issue of sorted) {
    if (issue.evidenceIds && issue.evidenceIds.length > 0) continue;
    if (!priority.includes(issue.type)) continue;
    const selector =
      typeof issue.metadata.selector === "string"
        ? issue.metadata.selector
        : undefined;
    if (!selector || selector.startsWith("orphan-submit:")) continue;
    try {
      const box = await input.page.locator(selector).first().boundingBox({
        timeout: 1_000,
      });
      if (!box) {
        input.budget.analysis.status = "PARTIAL";
        continue;
      }
      const artifact = await captureClippedEvidence({
        budget: input.budget,
        page: input.page,
        profile: input.profile,
        kind: input.kinds?.[issue.type] ?? "CONTEXT_SCREENSHOT",
        issueId: issue.id,
        selector,
        box,
        scanRelativeMs: input.scanRelativeMs,
      });
      if (artifact) {
        issue.evidenceIds = [...(issue.evidenceIds ?? []), artifact.id];
      }
    } catch {
      input.budget.analysis.status = "PARTIAL";
    }
  }
}

function emptyScreenshot(reason: string): BasicScreenshotResult {
  return { requested: false, available: false, reason };
}

function mergeDiagnostics(input: {
  phase5: DiagnosticResult;
  phase6Issues: DiagnosticIssue[];
  capabilities: DiagnosticCapabilityStatuses;
  extraNotices: string[];
}): DiagnosticResult {
  const issues = sortDiagnosticIssues([
    ...input.phase5.issues,
    ...input.phase6Issues,
  ]);
  const anyRequested = Object.values(input.capabilities).some(
    (status) => status !== "NOT_REQUESTED",
  );
  const notices = Array.from(
    new Set([...input.phase5.notices, ...input.extraNotices]),
  );
  if (anyRequested && issues.length === 0) {
    notices.push(
      "No reportable findings were captured by the selected automated checks during these page states.",
    );
    notices.push(
      "This does not prove that the page is bug-free, responsive at every size, or fully accessible. Some problems require user interaction, authenticated states, longer sessions, different content, or manual review.",
    );
  }
  return {
    status: deriveOverallDiagnosticStatus(input.capabilities, anyRequested),
    capabilities: input.capabilities,
    issues,
    severitySummary: createSeveritySummary(issues),
    typeSummary: createTypeSummary(issues),
    capturedEventCount: input.phase5.capturedEventCount,
    groupedIssueCount: issues.length,
    ignoredEventCount: input.phase5.ignoredEventCount,
    droppedEventCount: input.phase5.droppedEventCount,
    limits: input.phase5.limits,
    notices,
  };
}

/**
 * Runs one secure single-page scan with Phase 5–6 diagnostics.
 * Always releases the concurrency slot and closes browser resources in finally.
 */
export async function runBasicScan(
  input: BasicScanInput,
  dependencies: BasicScanDependencies = {},
): Promise<BasicScanResult> {
  const config = dependencies.config ?? getScannerConfig();
  const options = normalizeScanOptions(input.options);
  const now = dependencies.now ?? (() => new Date());
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const deadline = startedAtDate.getTime() + config.totalTimeoutMs;
  const scanMonotonicStart = performance.now();
  let clicksUsed = 0;
  const remainingClickBudget = () =>
    Math.max(0, config.maxTotalActualClicks - clicksUsed);
  const consumeClicks = (count: number) => {
    clicksUsed += count;
  };

  const release = scanLimiter.tryAcquire(config);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let mobileContext: BrowserContext | null = null;
  let mobilePage: Page | null = null;
  let collector: DiagnosticCollector | null = null;
  let imageObserver: ImageOutcomeObserver | null = null;
  let createdScreenshotDir = false;
  const notices: string[] = [
    "Single-page frontend scan completed. Results represent the page states observed during this controlled scan.",
    "This result is not a full website assessment, WCAG certification, or proof of complete responsiveness.",
    "Desktop and mobile screenshots are stored locally in this project’s scan-results directory. Do not scan pages containing sensitive information unless you are authorized to store the resulting images.",
    "Application-level network checks reduce SSRF risk but do not replace an operating-system or container-level network sandbox.",
    "Screenshots show the page state during the scan but are not automatically linked to each diagnostic finding.",
  ];

  const ensureTimeRemaining = (): void => {
    if (Date.now() > deadline) {
      throw new ScanError({
        code: "SCAN_TIMEOUT",
        httpStatus: 504,
        publicMessage: SCAN_ERROR_MESSAGES.SCAN_TIMEOUT,
      });
    }
  };

  const relativeMs = (): number =>
    Math.max(0, Math.round(performance.now() - scanMonotonicStart));

  try {
    ensureTimeRemaining();
    console.info(`[scan ${input.scanId}] validating target ${redactUrl(input.url)}`);

    const target = await validateScanTarget(input.url, {
      config,
      lookupFn: dependencies.lookupFn,
    });

    ensureTimeRemaining();
    console.info(`[scan ${input.scanId}] navigation started ${redactUrl(target.href)}`);

    browser = await launchScannerBrowser();
    context = await createScanContext(browser);
    attachBrowserSafetyHandlers(context, notices);

    // Shared guard across desktop and mobile so request/host budgets aggregate.
    const guard = new RequestGuard(config, dependencies.lookupFn);
    await guard.attach(context);

    page = await context.newPage();
    attachPageSafetyHandlers(page, notices);

    const phase5Requested =
      options.consoleErrors || options.networkErrors;

    if (phase5Requested) {
      collector = new DiagnosticCollector({
        collectConsoleErrors: options.consoleErrors,
        collectNetworkErrors: options.networkErrors,
        limits: createDiagnosticLimitsFromConfig(config),
        scanStartedAt: scanMonotonicStart,
        intentionalAborts: guard.intentionalAborts,
      });
      collector.attach(page);
    }

    if (options.brokenImages) {
      imageObserver = new ImageOutcomeObserver(
        config,
        guard.intentionalAborts,
      );
      imageObserver.attach(page);
    }

    const navigation = await navigateForBasicScan(page, target.href, config);

    const guardFailure = guard.getFailure();
    if (guardFailure) {
      throw guardFailure;
    }

    let redirectCount = guard.stats.redirectCount;
    if (navigation.response) {
      let current = navigation.response.request();
      let chainCount = 0;
      while (current.redirectedFrom()) {
        chainCount += 1;
        current = current.redirectedFrom()!;
      }
      redirectCount = Math.max(redirectCount, chainCount);
    }

    await validateScanTarget(navigation.finalUrl, {
      config,
      lookupFn: dependencies.lookupFn,
    });

    if (redirectCount > config.maxRedirects) {
      throw new ScanError({
        code: "REDIRECT_LIMIT_EXCEEDED",
        httpStatus: 403,
        publicMessage: SCAN_ERROR_MESSAGES.REDIRECT_LIMIT_EXCEEDED,
      });
    }

    if (navigation.statusCode !== null && navigation.statusCode >= 400) {
      notices.push(
        `The main response status was HTTP ${navigation.statusCode}. When network diagnostics are selected, this status may also appear as an HTTP diagnostic issue.`,
      );
    }

    if (!navigation.contentType) {
      notices.push(
        "The main response did not include a Content-Type header. The page still rendered in the browser.",
      );
    }

    let screenshot = emptyScreenshot("Screenshot capture was not requested.");
    if (options.screenshots) {
      createdScreenshotDir = true;
      ensureTimeRemaining();
      screenshot = await captureDesktopScreenshot(page, input.scanId, config);
      if (!screenshot.available) {
        notices.push(
          "The page opened successfully, but the desktop screenshot could not be created.",
        );
      }
    }

    if (phase5Requested && config.diagnosticSettleMs > 0) {
      ensureTimeRemaining();
      await new Promise((resolve) => {
        setTimeout(resolve, config.diagnosticSettleMs);
      });
    }

    // Stop Phase 5 listeners before scanner-created analysis (axe/DOM).
    let phase5Diagnostics: DiagnosticResult = {
      status: "NOT_REQUESTED",
      capabilities: {
        console: "NOT_REQUESTED",
        network: "NOT_REQUESTED",
        brokenImages: "NOT_REQUESTED",
        mobileLayout: "NOT_REQUESTED",
        accessibility: "NOT_REQUESTED",
        safeInteractions: "NOT_REQUESTED",
        issueEvidence: "NOT_REQUESTED",
        reversibleWorkflows: "NOT_REQUESTED",
      },
      issues: [],
      severitySummary: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
      typeSummary: {
        consoleErrors: 0,
        pageErrors: 0,
        failedRequests: 0,
        httpErrors: 0,
        brokenImages: 0,
        mobileLayoutIssues: 0,
        accessibilityViolations: 0,
        deadClicks: 0,
        obstructedControls: 0,
        formStateIssues: 0,
        stateTransitionIssues: 0,
      },
      capturedEventCount: 0,
      groupedIssueCount: 0,
      ignoredEventCount: 0,
      droppedEventCount: 0,
      limits: {
        rawEventLimitReached: false,
        issueLimitReached: false,
        messageTruncationOccurred: false,
        stackTruncationOccurred: false,
      },
      notices: phase5Requested
        ? []
        : ["Console and network diagnostics were not selected for this scan."],
    };

    if (collector) {
      collector.dispose();
      phase5Diagnostics = collector.finalize(navigation.finalUrl);
      collector = null;
    }

    if (imageObserver) {
      imageObserver.dispose();
    }

    let brokenImageAnalysis: BrokenImageAnalysis = emptyBrokenImageAnalysis();
    let brokenImageIssues: DiagnosticIssue[] = [];
    if (options.brokenImages) {
      ensureTimeRemaining();
      const broken = await analyzeBrokenImages({
        page,
        finalPageUrl: navigation.finalUrl,
        config,
        outcomes: imageObserver?.getOutcomes() ?? [],
        outcomeLimitReached: imageObserver?.wasOutcomeLimitReached() ?? false,
        scanRelativeMs: relativeMs(),
      });
      brokenImageAnalysis = broken.analysis;
      brokenImageIssues = broken.issues;
      imageObserver?.clear();
      imageObserver = null;
      notices.push(...broken.analysis.notices);
    }

    let accessibilityAnalysis: AccessibilityAnalysis =
      emptyAccessibilityAnalysis();
    let accessibilityIssues: DiagnosticIssue[] = [];
    if (options.accessibility) {
      ensureTimeRemaining();
      const axe = await analyzeAccessibility({
        page,
        finalPageUrl: navigation.finalUrl,
        config,
        scanRelativeMs: relativeMs(),
      });
      accessibilityAnalysis = axe.analysis;
      accessibilityIssues = axe.issues;
      notices.push(...axe.analysis.notices);
    }

    phase5Diagnostics = {
      ...phase5Diagnostics,
      issues: suppressDuplicateImageNetworkIssues(
        phase5Diagnostics.issues,
        brokenImageIssues,
      ),
    };

    let safeInteractionAnalysis: SafeInteractionAnalysis =
      emptySafeInteractionAnalysis();
    let safeInteractionIssues: DiagnosticIssue[] = [];
    let interactionCandidates: InteractionCandidate[] = [];
    let issueEvidenceAnalysis: IssueEvidenceAnalysis =
      emptyIssueEvidenceAnalysis(
        options.issueEvidence ? "COMPLETE" : "NOT_REQUESTED",
      );
    let reversibleWorkflowAnalysis: ReversibleWorkflowAnalysis =
      emptyReversibleWorkflowAnalysis();
    let reversibleWorkflowIssues: DiagnosticIssue[] = [];
    const evidenceBudget = options.issueEvidence
      ? createEvidenceBudget(input.scanId, config)
      : null;

    if (evidenceBudget && page) {
      await attachSelectorEvidence({
        budget: evidenceBudget,
        page,
        profile: "DESKTOP",
        issues: [...brokenImageIssues, ...accessibilityIssues],
        scanRelativeMs: relativeMs,
        kinds: {
          BROKEN_IMAGE: "CONTEXT_SCREENSHOT",
          ACCESSIBILITY_VIOLATION: "ELEMENT_SCREENSHOT",
        },
      });
    }

    if ((options.safeInteractions || options.reversibleWorkflows) && page && browser) {
      ensureTimeRemaining();
      try {
        const interaction = await runSafeInteractionAnalysis({
          browser,
          targetHref: target.href,
          discoveryPage: page,
          config,
          guard,
          lookupFn: dependencies.lookupFn,
          scanRelativeMs: relativeMs,
          ensureTimeRemaining,
          remainingClickBudget,
          consumeClicks,
          evidenceBudget,
        });
        safeInteractionAnalysis = options.safeInteractions
          ? interaction.analysis
          : emptySafeInteractionAnalysis();
        safeInteractionIssues = options.safeInteractions
          ? interaction.issues
          : [];
        interactionCandidates = interaction.candidates;
        notices.push(...(options.safeInteractions ? interaction.analysis.notices : []));

        if (evidenceBudget && page && options.safeInteractions) {
          await attachSelectorEvidence({
            budget: evidenceBudget,
            page,
            profile: "DESKTOP",
            issues: safeInteractionIssues,
            scanRelativeMs: relativeMs,
            kinds: {
              OBSTRUCTED_CONTROL: "CONTEXT_SCREENSHOT",
              DEAD_CLICK: "CONTEXT_SCREENSHOT",
              FORM_STATE_ISSUE: "CONTEXT_SCREENSHOT",
            },
          });
        }
      } catch {
        if (options.safeInteractions) {
          safeInteractionAnalysis = emptySafeInteractionAnalysis("PARTIAL");
          safeInteractionAnalysis.notices = [
            "Safe interaction analysis could not complete for this page state.",
          ];
          notices.push(
            "Desktop Phase 5–6 results were preserved after safe interaction analysis could not complete.",
          );
        }
      }
    }

    await closeQuietly(page);
    page = null;
    await closeQuietly(context);
    context = null;

    if (options.reversibleWorkflows && browser) {
      ensureTimeRemaining();
      try {
        const excluded = new Set(
          safeInteractionIssues
            .map((issue) =>
              typeof issue.metadata.selector === "string"
                ? issue.metadata.selector
                : "",
            )
            .filter(Boolean),
        );
        const workflow = await runReversibleWorkflows({
          browser,
          targetHref: target.href,
          candidates: interactionCandidates,
          excludedSelectors: excluded,
          config,
          guard,
          lookupFn: dependencies.lookupFn,
          scanRelativeMs: relativeMs,
          ensureTimeRemaining,
          remainingClickBudget,
          consumeClicks,
          evidenceBudget,
        });
        reversibleWorkflowAnalysis = workflow.analysis;
        reversibleWorkflowIssues = workflow.issues;
        notices.push(...workflow.analysis.notices);
      } catch {
        reversibleWorkflowAnalysis = emptyReversibleWorkflowAnalysis("PARTIAL");
        reversibleWorkflowAnalysis.notices = [
          "Reversible workflow analysis could not complete for this page state.",
        ];
      }
    } else if (!options.reversibleWorkflows) {
      reversibleWorkflowAnalysis = emptyReversibleWorkflowAnalysis();
    }

    if (evidenceBudget) {
      issueEvidenceAnalysis = evidenceBudget.analysis;
    }

    let mobileLayoutAnalysis: MobileLayoutAnalysis = emptyMobileLayoutAnalysis(
      config,
    );
    let mobileLayoutIssues: DiagnosticIssue[] = [];
    let mobileScreenshot = emptyScreenshot(
      "Mobile screenshot capture was not requested.",
    );
    const needsMobile =
      options.mobileLayout || options.screenshots;

    if (needsMobile && browser) {
      ensureTimeRemaining();
      try {
        mobileContext = await createMobileScanContext(browser, config);
        attachBrowserSafetyHandlers(mobileContext, notices);
        await guard.attach(mobileContext);
        mobilePage = await mobileContext.newPage();
        attachPageSafetyHandlers(mobilePage, notices);

        const mobileNav = await navigateForBasicScan(
          mobilePage,
          target.href,
          config,
        );
        const mobileGuardFailure = guard.getFailure();
        if (mobileGuardFailure) {
          throw mobileGuardFailure;
        }
        await validateScanTarget(mobileNav.finalUrl, {
          config,
          lookupFn: dependencies.lookupFn,
        });

        if (options.mobileLayout) {
          ensureTimeRemaining();
          const layout = await analyzeMobileLayout({
            page: mobilePage,
            finalPageUrl: mobileNav.finalUrl,
            config,
            scanRelativeMs: relativeMs(),
          });
          mobileLayoutAnalysis = layout.analysis;
          mobileLayoutIssues = layout.issues;
          notices.push(...layout.analysis.notices);
          if (evidenceBudget && mobilePage) {
            await attachSelectorEvidence({
              budget: evidenceBudget,
              page: mobilePage,
              profile: "MOBILE",
              issues: mobileLayoutIssues,
              scanRelativeMs: relativeMs,
              kinds: {
                MOBILE_OVERFLOW: "CONTEXT_SCREENSHOT",
              },
            });
          }
        }

        if (options.screenshots) {
          createdScreenshotDir = true;
          ensureTimeRemaining();
          mobileScreenshot = await captureMobileScreenshot(
            mobilePage,
            input.scanId,
            config,
          );
          if (!mobileScreenshot.available) {
            notices.push(
              "The mobile page opened, but the mobile screenshot could not be created.",
            );
          }
        }
      } catch (mobileError) {
        if (isScanError(mobileError) && !options.mobileLayout) {
          // Screenshot-only mobile failure stays soft.
          notices.push(
            "Mobile screenshot capture could not complete for this scan.",
          );
          mobileScreenshot = {
            requested: options.screenshots,
            available: false,
            reason: "The mobile screenshot could not be created.",
          };
        } else if (isScanError(mobileError)) {
          mobileLayoutAnalysis = {
            ...emptyMobileLayoutAnalysis(config, "PARTIAL"),
            notices: [
              "Mobile layout analysis could not complete because mobile navigation was blocked or timed out.",
            ],
          };
          notices.push(
            "Desktop results were preserved after mobile analysis could not complete safely.",
          );
        } else {
          mobileLayoutAnalysis = {
            ...emptyMobileLayoutAnalysis(
              config,
              options.mobileLayout ? "PARTIAL" : "NOT_REQUESTED",
            ),
            notices: options.mobileLayout
              ? [
                  "Mobile layout analysis could not complete for this page state.",
                ]
              : mobileLayoutAnalysis.notices,
          };
          if (options.screenshots) {
            mobileScreenshot = {
              requested: true,
              available: false,
              reason: "The mobile screenshot could not be created.",
            };
          }
          notices.push(
            "Desktop results were preserved after mobile analysis could not complete safely.",
          );
        }
      } finally {
        await closeQuietly(mobilePage);
        mobilePage = null;
        await closeQuietly(mobileContext);
        mobileContext = null;
      }
    }

    if (guard.stats.blockedRequestCount > 0) {
      notices.push(
        "The browser blocked one or more requests because their destinations were not permitted by the scanner’s network policy.",
      );
    }

    const capabilities: DiagnosticCapabilityStatuses = {
      console: options.consoleErrors
        ? phase5Diagnostics.capabilities.console
        : "NOT_REQUESTED",
      network: options.networkErrors
        ? phase5Diagnostics.capabilities.network
        : "NOT_REQUESTED",
      brokenImages: options.brokenImages
        ? brokenImageAnalysis.status
        : "NOT_REQUESTED",
      mobileLayout: options.mobileLayout
        ? mobileLayoutAnalysis.status
        : "NOT_REQUESTED",
      accessibility: options.accessibility
        ? accessibilityAnalysis.status
        : "NOT_REQUESTED",
      safeInteractions: options.safeInteractions
        ? safeInteractionAnalysis.status
        : "NOT_REQUESTED",
      issueEvidence: options.issueEvidence
        ? issueEvidenceAnalysis.status
        : "NOT_REQUESTED",
      reversibleWorkflows: options.reversibleWorkflows
        ? reversibleWorkflowAnalysis.status
        : "NOT_REQUESTED",
    };

    const diagnostics = mergeDiagnostics({
      phase5: phase5Diagnostics,
      phase6Issues: [
        ...brokenImageIssues,
        ...mobileLayoutIssues,
        ...accessibilityIssues,
        ...safeInteractionIssues,
        ...reversibleWorkflowIssues,
      ],
      capabilities,
      extraNotices: [],
    });

    const completedAtDate = now();
    const completedAt = completedAtDate.toISOString();
    const durationMs =
      Math.round((completedAtDate.getTime() - startedAtDate.getTime()) * 100) /
      100;

    console.info(
      `[scan ${input.scanId}] navigation completed ${redactUrl(navigation.finalUrl)}`,
    );

    return {
      success: true,
      mode: "BASIC_SCAN",
      scanId: input.scanId,
      targetUrl: sanitizeDiagnosticUrl(
        target.href,
        config.maxDiagnosticUrlLength,
      ),
      targetWasContacted: true,
      startedAt,
      completedAt,
      durationMs,
      page: {
        requestedUrl: sanitizeDiagnosticUrl(
          target.href,
          config.maxDiagnosticUrlLength,
        ),
        finalUrl: sanitizeDiagnosticUrl(
          navigation.finalUrl,
          config.maxDiagnosticUrlLength,
        ),
        title: navigation.title,
        statusCode: navigation.statusCode,
        statusText: navigation.statusText,
        contentType: navigation.contentType,
        redirectCount,
        navigationDurationMs: navigation.navigationDurationMs,
      },
      screenshot,
      mobileScreenshot,
      brokenImageAnalysis,
      mobileLayoutAnalysis,
      accessibilityAnalysis,
      safeInteractionAnalysis,
      issueEvidenceAnalysis,
      reversibleWorkflowAnalysis,
      executedCapabilities: buildExecutedCapabilities(
        options,
        options.screenshots,
        options.screenshots && mobileScreenshot.requested,
      ),
      deferredChecks: buildDeferredChecks(),
      security: {
        inspectedRequestCount: guard.stats.inspectedRequestCount,
        uniqueHostCount: guard.stats.uniqueHostCount,
        blockedRequestCount: guard.stats.blockedRequestCount,
        blockedRequests: guard.stats.blockedRequests,
      },
      diagnostics,
      notices: Array.from(new Set([...notices, ...diagnostics.notices])),
    };
  } catch (error) {
    if (collector) {
      collector.dispose();
      collector = null;
    }
    if (imageObserver) {
      imageObserver.dispose();
      imageObserver = null;
    }
    if (createdScreenshotDir) {
      await removeScanDirectoryIfEmpty(input.scanId);
    }

    if (isScanError(error)) {
      console.warn(
        `[scan ${input.scanId}] failed: ${error.code} ${error.details?.hostname ?? ""}`.trim(),
      );
      throw error;
    }

    console.error(`[scan ${input.scanId}] failed: INTERNAL_ERROR`);
    throw new ScanError({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      publicMessage: SCAN_ERROR_MESSAGES.INTERNAL_ERROR,
      cause: error,
    });
  } finally {
    if (collector) {
      collector.dispose();
    }
    if (imageObserver) {
      imageObserver.dispose();
    }
    await closeQuietly(mobilePage);
    await closeQuietly(mobileContext);
    await closeQuietly(page);
    await closeQuietly(context);
    await closeQuietly(browser);
    release();
  }
}
