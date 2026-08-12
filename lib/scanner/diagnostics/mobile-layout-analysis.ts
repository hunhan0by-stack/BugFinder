import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type {
  DiagnosticIssue,
  MobileLayoutAnalysis,
  MobileViewport,
  Severity,
} from "@/types/scan";

type LayoutMeasurement = {
  viewportMetaPresent: boolean;
  viewportMetaContent: string;
  documentWidth: number;
  documentHeight: number;
  horizontalOverflowPx: number;
  analyzedElementCount: number;
  elementLimitReached: boolean;
  contributors: Array<{
    selector: string;
    overflowRightPx: number;
    overflowLeftPx: number;
    width: number;
  }>;
};

export function createMobileViewport(config: ScannerConfig): MobileViewport {
  return {
    width: config.mobileViewportWidth,
    height: config.mobileViewportHeight,
    deviceScaleFactor: config.mobileDeviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  };
}

export async function analyzeMobileLayout(input: {
  page: Page;
  finalPageUrl: string;
  config: ScannerConfig;
  scanRelativeMs: number;
  createId?: () => string;
}): Promise<{ analysis: MobileLayoutAnalysis; issues: DiagnosticIssue[] }> {
  const viewport = createMobileViewport(input.config);
  const notices: string[] = [];
  let partial = false;
  let measurement: LayoutMeasurement | null = null;

  try {
    measurement = await Promise.race([
      input.page.evaluate(
        ({ maxElements, tolerance, maxSelectorLength, viewportWidth }) => {
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          const documentWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body ? document.body.scrollWidth : 0,
            document.documentElement.clientWidth,
          );
          const documentHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0,
          );
          const horizontalOverflowPx = Math.max(0, documentWidth - viewportWidth);

          const ignored = new Set([
            "SCRIPT",
            "STYLE",
            "META",
            "LINK",
            "TITLE",
            "NOSCRIPT",
            "HEAD",
          ]);
          const all = Array.from(document.body?.querySelectorAll("*") ?? []);
          const elementLimitReached = all.length > maxElements;
          const candidates = all.slice(0, maxElements);
          const contributors: LayoutMeasurement["contributors"] = [];
          const reportedRects: Array<{ left: number; right: number }> = [];

          function structuralSelector(element: Element): string {
            const parts: string[] = [];
            let current: Element | null = element;
            let depth = 0;
            while (current && depth < 6) {
              const parent: Element | null = current.parentElement;
              if (!parent) {
                parts.unshift(current.tagName.toLowerCase());
                break;
              }
              const siblings = Array.from(parent.children).filter(
                (child) => child.tagName === current!.tagName,
              );
              const index = siblings.indexOf(current) + 1;
              parts.unshift(
                `${current.tagName.toLowerCase()}:nth-of-type(${index})`,
              );
              current = parent;
              depth += 1;
            }
            const selector = parts.join(" > ");
            return selector.length > maxSelectorLength
              ? `${selector.slice(0, maxSelectorLength - 15)}… [truncated]`
              : selector;
          }

          for (const element of candidates) {
            if (ignored.has(element.tagName)) continue;
            const style = window.getComputedStyle(element);
            if (style.display === "none") continue;
            if (style.visibility === "hidden" || style.visibility === "collapse") {
              continue;
            }
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            const overflowRightPx = Math.max(
              0,
              rect.right - viewportWidth - tolerance,
            );
            const overflowLeftPx = Math.max(0, -rect.left - tolerance);
            if (overflowRightPx <= 0 && overflowLeftPx <= 0) continue;

            const contained = reportedRects.some(
              (parent) =>
                rect.left >= parent.left - 1 && rect.right <= parent.right + 1,
            );
            if (contained) continue;

            reportedRects.push({ left: rect.left, right: rect.right });
            contributors.push({
              selector: structuralSelector(element),
              overflowRightPx,
              overflowLeftPx,
              width: rect.width,
            });
          }

          return {
            viewportMetaPresent: Boolean(viewportMeta),
            viewportMetaContent: (
              viewportMeta?.getAttribute("content") ?? ""
            ).slice(0, 300),
            documentWidth,
            documentHeight,
            horizontalOverflowPx,
            analyzedElementCount: candidates.length,
            elementLimitReached,
            contributors: contributors.slice(0, 20),
          };
        },
        {
          maxElements: input.config.maxLayoutElements,
          tolerance: input.config.layoutOverflowTolerancePx,
          maxSelectorLength: input.config.maxLayoutSelectorLength,
          viewportWidth: input.config.mobileViewportWidth,
        },
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("MOBILE_ANALYSIS_TIMEOUT")),
          input.config.mobileAnalysisTimeoutMs,
        );
      }),
    ]);
  } catch {
    partial = true;
    notices.push(
      "Mobile layout analysis could not complete for this page state.",
    );
  }

  const createId = input.createId ?? (() => crypto.randomUUID());
  const issues: DiagnosticIssue[] = [];
  const pageUrl = sanitizeDiagnosticUrl(
    input.finalPageUrl,
    input.config.maxDiagnosticUrlLength,
  );

  if (measurement) {
    if (measurement.elementLimitReached) {
      partial = true;
      notices.push(
        "Mobile layout inspection reached the configured element limit.",
      );
    }

    if (!measurement.viewportMetaPresent) {
      issues.push({
        id: createId(),
        type: "MOBILE_VIEWPORT",
        severity: "MEDIUM",
        confidence: 98,
        title: "Mobile viewport configuration is missing",
        description:
          "The mobile page did not provide a viewport meta declaration during this scan.",
        observedBehavior:
          "No meta[name=\"viewport\"] declaration was found on the mobile page.",
        potentialUserImpact:
          "Mobile browsers may render the page using a wider virtual layout viewport, making content appear zoomed out or difficult to use.",
        technicalEvidence: "viewport meta present: false",
        suggestedInvestigation:
          "Add and verify an appropriate viewport declaration, commonly width=device-width and an initial scale suitable for the application.",
        scope: "MAIN_DOCUMENT",
        profile: "MOBILE",
        pageUrl,
        occurrenceCount: 1,
        firstSeenMs: input.scanRelativeMs,
        lastSeenMs: input.scanRelativeMs,
        metadata: {
          problemCategory: "MISSING_VIEWPORT_META",
        },
      });
    }

    const overflow = measurement.horizontalOverflowPx;
    const tolerance = input.config.layoutOverflowTolerancePx;
    if (overflow > tolerance) {
      const severity = classifyOverflowSeverity(
        overflow,
        input.config.mobileViewportWidth,
      );
      issues.push({
        id: createId(),
        type: "MOBILE_OVERFLOW",
        severity,
        confidence: 99,
        title: "Page overflows the mobile viewport",
        description: `The rendered mobile document was wider than the configured ${input.config.mobileViewportWidth}-pixel viewport.`,
        observedBehavior: `The document width was ${measurement.documentWidth} pixels while the mobile viewport width was ${input.config.mobileViewportWidth} pixels, producing ${overflow} pixels of horizontal overflow.`,
        potentialUserImpact:
          "Users may need to scroll horizontally or may be unable to reach content comfortably on a narrow screen.",
        technicalEvidence: sanitizeDiagnosticText(
          [
            `Viewport: ${input.config.mobileViewportWidth}×${input.config.mobileViewportHeight}`,
            `Document width: ${measurement.documentWidth}`,
            `Document height: ${measurement.documentHeight}`,
            `Overflow: ${overflow}px`,
          ].join("\n"),
          input.config.maxEvidenceLength,
        ).text,
        suggestedInvestigation:
          "Inspect fixed-width containers, tables, media, transformed elements, and minimum-width rules. Use responsive sizing and verify the page at narrow viewport widths.",
        scope: "MAIN_DOCUMENT",
        profile: "MOBILE",
        pageUrl,
        occurrenceCount: 1,
        firstSeenMs: input.scanRelativeMs,
        lastSeenMs: input.scanRelativeMs,
        metadata: {
          overflowPx: overflow,
          documentWidth: measurement.documentWidth,
          viewportWidth: input.config.mobileViewportWidth,
          level: "document",
        },
      });

      let added = 0;
      for (const contributor of measurement.contributors) {
        if (issues.length >= input.config.maxMobileLayoutIssues) {
          partial = true;
          notices.push(
            "Mobile layout output reached the configured issue limit.",
          );
          break;
        }
        const edge =
          contributor.overflowRightPx >= contributor.overflowLeftPx
            ? "right"
            : "left";
        const amount = Math.max(
          contributor.overflowRightPx,
          contributor.overflowLeftPx,
        );
        issues.push({
          id: createId(),
          type: "MOBILE_OVERFLOW",
          severity: classifyOverflowSeverity(
            amount,
            input.config.mobileViewportWidth,
          ),
          confidence: 97,
          title: "Element extends beyond the mobile viewport",
          description:
            "A rendered element extended beyond the configured mobile viewport during this scan.",
          observedBehavior: `The element ${contributor.selector} extended ${amount} pixels beyond the viewport’s ${edge} edge.`,
          potentialUserImpact:
            "Users may need to scroll horizontally to view the overflowing content.",
          technicalEvidence: sanitizeDiagnosticText(
            [
              `Selector: ${contributor.selector}`,
              `Element width: ${Math.round(contributor.width)}`,
              `Overflow ${edge}: ${amount}px`,
            ].join("\n"),
            input.config.maxEvidenceLength,
          ).text,
          suggestedInvestigation:
            "Inspect the overflowing element’s width, min-width, and positioning rules for the mobile viewport.",
          scope: "SAME_ORIGIN",
          profile: "MOBILE",
          pageUrl,
          occurrenceCount: 1,
          firstSeenMs: input.scanRelativeMs,
          lastSeenMs: input.scanRelativeMs,
          metadata: {
            overflowPx: amount,
            direction: edge,
            level: "element",
            selector: contributor.selector,
          },
        });
        added += 1;
        if (added >= 5) break;
      }
    }
  }

  if (issues.length === 0 && !partial) {
    notices.push(
      `No reportable horizontal overflow was measured at the configured ${input.config.mobileViewportWidth} × ${input.config.mobileViewportHeight} mobile viewport during this page state.`,
    );
    notices.push(
      "This does not prove that the page is responsive at every device size, orientation, zoom level, or application state.",
    );
  }

  return {
    analysis: {
      status: partial ? "PARTIAL" : "COMPLETE",
      requested: true,
      finalUrl: pageUrl,
      viewport,
      viewportMetaPresent: measurement?.viewportMetaPresent ?? null,
      viewportMetaContent: measurement?.viewportMetaContent || undefined,
      documentWidth: measurement?.documentWidth,
      documentHeight: measurement?.documentHeight,
      horizontalOverflowPx: measurement?.horizontalOverflowPx,
      analyzedElementCount: measurement?.analyzedElementCount ?? 0,
      overflowingElementCount: measurement?.contributors.length ?? 0,
      elementLimitReached: measurement?.elementLimitReached ?? false,
      issueCount: issues.length,
      notices: Array.from(new Set(notices)),
    },
    issues,
  };
}

export function classifyOverflowSeverity(
  overflowPx: number,
  viewportWidth: number,
): Severity {
  if (overflowPx > viewportWidth * 0.25 || overflowPx > 120) return "HIGH";
  if (overflowPx > 16) return "MEDIUM";
  return "LOW";
}

export function emptyMobileLayoutAnalysis(
  config: ScannerConfig,
  status: MobileLayoutAnalysis["status"] = "NOT_REQUESTED",
): MobileLayoutAnalysis {
  return {
    status,
    requested: status !== "NOT_REQUESTED",
    viewport: createMobileViewport(config),
    viewportMetaPresent: null,
    analyzedElementCount: 0,
    overflowingElementCount: 0,
    elementLimitReached: false,
    issueCount: 0,
    notices:
      status === "NOT_REQUESTED"
        ? ["Mobile layout analysis was not selected for this scan."]
        : [],
  };
}
