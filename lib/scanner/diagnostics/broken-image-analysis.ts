import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { classifyDiagnosticScope } from "@/lib/scanner/diagnostics/classify-scope";
import {
  hashImageUrl,
  type ImageNetworkOutcome,
} from "@/lib/scanner/diagnostics/image-outcome-observer";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type {
  BrokenImageAnalysis,
  DiagnosticIssue,
  DiagnosticScope,
  Severity,
} from "@/types/scan";

export type InspectedImageElement = {
  correlationKey: string;
  scheme: "http" | "https" | "data" | "blob" | "empty" | "other";
  sanitizedUrl: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  display: string;
  visibility: string;
  opacity: number;
  loading: string;
  connected: boolean;
  inViewport: boolean;
  selector: string;
};

type BrokenGroup = {
  key: string;
  sanitizedUrl: string;
  scope: DiagnosticScope;
  failureCategory: string;
  statusCode?: number;
  failureReason?: string;
  selectors: string[];
  occurrenceCount: number;
  severity: Severity;
  confidence: number;
};

/**
 * Inspects visible `<img>` elements and correlates them with image network
 * outcomes. CSS background images and SVG `<image>` are out of scope.
 */
export async function analyzeBrokenImages(input: {
  page: Page;
  finalPageUrl: string;
  config: ScannerConfig;
  outcomes: readonly ImageNetworkOutcome[];
  outcomeLimitReached: boolean;
  scanRelativeMs: number;
  createId?: () => string;
}): Promise<{ analysis: BrokenImageAnalysis; issues: DiagnosticIssue[] }> {
  const notices: string[] = [];
  let elements: InspectedImageElement[] = [];
  let elementLimitReached = false;
  let partial = input.outcomeLimitReached;

  try {
    const evaluated = await Promise.race([
      input.page.evaluate(
        ({ maxElements, maxSelectorLength }) => {
          const images = Array.from(document.images).slice(0, maxElements);
          const limitReached = document.images.length > maxElements;
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;

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

          function hash(value: string): string {
            // Lightweight browser-side stand-in; Node recomputes SHA-256.
            let h = 0;
            for (let i = 0; i < value.length; i += 1) {
              h = (h << 5) - h + value.charCodeAt(i);
              h |= 0;
            }
            return `browser-${h}`;
          }

          const results = images.map((img) => {
            const currentSrc = img.currentSrc || img.src || "";
            let scheme:
              | "http"
              | "https"
              | "data"
              | "blob"
              | "empty"
              | "other" = "other";
            if (!currentSrc) scheme = "empty";
            else if (currentSrc.startsWith("https:")) scheme = "https";
            else if (currentSrc.startsWith("http:")) scheme = "http";
            else if (currentSrc.startsWith("data:")) scheme = "data";
            else if (currentSrc.startsWith("blob:")) scheme = "blob";

            const rect = img.getBoundingClientRect();
            const style = window.getComputedStyle(img);
            const opacity = Number(style.opacity || "1");
            const inViewport =
              rect.bottom > 0 &&
              rect.right > 0 &&
              rect.top < viewportHeight + 2000 &&
              rect.left < viewportWidth + 2000;

            return {
              correlationKey: currentSrc ? hash(currentSrc) : "empty",
              rawSrc: currentSrc,
              scheme,
              complete: img.complete,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              renderedWidth: rect.width,
              renderedHeight: rect.height,
              display: style.display,
              visibility: style.visibility,
              opacity,
              loading: img.loading || "",
              connected: img.isConnected,
              inViewport,
              selector: structuralSelector(img),
            };
          });

          return { results, limitReached };
        },
        {
          maxElements: input.config.maxImageElements,
          maxSelectorLength: input.config.maxLayoutSelectorLength,
        },
      ),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("BROKEN_IMAGE_TIMEOUT")),
          input.config.brokenImageTimeoutMs,
        );
      }),
    ]);

    elementLimitReached = evaluated.limitReached;
    if (elementLimitReached) {
      partial = true;
      notices.push(
        "Broken-image inspection reached the configured image-element limit.",
      );
    }

    elements = evaluated.results.map((item) => {
      const sanitizedUrl =
        item.scheme === "data" || item.scheme === "blob"
          ? `${item.scheme}:[inline-resource]`
          : item.scheme === "empty"
            ? "Unavailable diagnostic URL"
            : sanitizeDiagnosticUrl(
                item.rawSrc,
                input.config.maxDiagnosticUrlLength,
              );
      return {
        correlationKey:
          item.scheme === "http" || item.scheme === "https"
            ? hashImageUrl(item.rawSrc)
            : item.correlationKey,
        scheme: item.scheme,
        sanitizedUrl,
        complete: item.complete,
        naturalWidth: item.naturalWidth,
        naturalHeight: item.naturalHeight,
        renderedWidth: item.renderedWidth,
        renderedHeight: item.renderedHeight,
        display: item.display,
        visibility: item.visibility,
        opacity: item.opacity,
        loading: item.loading,
        connected: item.connected,
        inViewport: item.inViewport,
        selector: item.selector,
      };
    });
  } catch {
    partial = true;
    notices.push(
      "Broken-image analysis could not complete for this page state.",
    );
  }

  const outcomeByKey = new Map(
    input.outcomes.map((outcome) => [outcome.correlationKey, outcome]),
  );

  let visibleImageCount = 0;
  let skippedImageCount = 0;
  let skippedLazyImageCount = 0;
  const groups = new Map<string, BrokenGroup>();

  for (const image of elements) {
    const visible = isVisibleImageElement(image);
    if (visible) visibleImageCount += 1;

    if (
      image.scheme === "data" ||
      image.scheme === "blob" ||
      image.scheme === "empty"
    ) {
      skippedImageCount += 1;
      continue;
    }

    if (!visible) {
      skippedImageCount += 1;
      continue;
    }

    const outcome = outcomeByKey.get(image.correlationKey);
    if (outcome?.kind === "INTENTIONAL_ABORT") {
      skippedImageCount += 1;
      continue;
    }

    const lazyUnattempted =
      image.loading === "lazy" &&
      !image.complete &&
      image.naturalWidth === 0 &&
      !outcome &&
      !image.inViewport;

    if (lazyUnattempted) {
      skippedLazyImageCount += 1;
      skippedImageCount += 1;
      continue;
    }

    const broken = classifyBrokenImage(image, outcome);
    if (!broken) {
      continue;
    }

    const scope = classifyDiagnosticScope({
      eventUrl: image.sanitizedUrl,
      finalPageUrl: input.finalPageUrl,
    });
    const key = `BROKEN_IMAGE|${image.sanitizedUrl}|${scope}|${broken.failureCategory}`;
    const existing = groups.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      if (
        existing.selectors.length < input.config.maxImageSelectorSamples &&
        !existing.selectors.includes(image.selector)
      ) {
        existing.selectors.push(image.selector);
      }
      continue;
    }

    if (groups.size >= input.config.maxBrokenImageIssues) {
      partial = true;
      notices.push(
        "Broken-image output reached the configured issue limit.",
      );
      continue;
    }

    groups.set(key, {
      key,
      sanitizedUrl: image.sanitizedUrl,
      scope: scope === "MAIN_DOCUMENT" ? "SAME_ORIGIN" : scope,
      failureCategory: broken.failureCategory,
      statusCode: broken.statusCode,
      failureReason: broken.failureReason,
      selectors: [image.selector],
      occurrenceCount: 1,
      severity: scope === "THIRD_PARTY" ? "LOW" : "MEDIUM",
      confidence: broken.confidence,
    });
  }

  const createId = input.createId ?? (() => crypto.randomUUID());
  const issues: DiagnosticIssue[] = [];
  for (const group of groups.values()) {
    const evidenceParts = [
      `Resource: ${group.sanitizedUrl}`,
      `Failure: ${group.failureCategory}`,
      group.statusCode !== undefined ? `HTTP status: ${group.statusCode}` : null,
      group.failureReason ? `Failure reason: ${group.failureReason}` : null,
      `Selectors: ${group.selectors.join("; ")}`,
    ].filter(Boolean);

    issues.push({
      id: createId(),
      type: "BROKEN_IMAGE",
      severity: group.severity,
      confidence: group.confidence,
      title: "Broken image resource",
      description:
        "A visible image element did not load successfully during the desktop page scan.",
      observedBehavior: sanitizeDiagnosticText(
        group.statusCode
          ? `The image element completed with zero natural dimensions and its resource request returned HTTP ${group.statusCode}.`
          : group.failureReason
            ? `The image element failed to render and its resource request failed with ${group.failureReason}.`
            : "The image element completed with zero natural dimensions.",
        input.config.maxEvidenceLength,
      ).text,
      potentialUserImpact:
        "Users may see missing visual content, an empty area, or alternative text instead of the intended image.",
      technicalEvidence: sanitizeDiagnosticText(
        evidenceParts.join("\n"),
        input.config.maxEvidenceLength,
      ).text,
      suggestedInvestigation:
        group.scope === "THIRD_PARTY"
          ? "Confirm whether the external image is required and whether the page provides a fallback when the third-party resource is unavailable."
          : "Verify that the image URL exists, is publicly accessible, returns a valid image response, and is assigned to the image element at the correct time.",
      scope: group.scope,
      profile: "DESKTOP",
      pageUrl: sanitizeDiagnosticUrl(
        input.finalPageUrl,
        input.config.maxDiagnosticUrlLength,
      ),
      resourceUrl: group.sanitizedUrl,
      occurrenceCount: group.occurrenceCount,
      firstSeenMs: input.scanRelativeMs,
      lastSeenMs: input.scanRelativeMs,
      metadata: {
        failureCategory: group.failureCategory,
        statusCode: group.statusCode ?? null,
        failureReason: group.failureReason ?? null,
        selectorSamples: group.selectors.join(" | "),
      },
    });
  }

  if (issues.length === 0) {
    notices.push(
      "No visible <img> elements met the broken-image detection criteria during this desktop page state.",
    );
    notices.push(
      "CSS background images, SVG image elements, and images that were not attempted because of lazy loading are outside this Phase 6 check.",
    );
  }

  return {
    analysis: {
      status: partial ? "PARTIAL" : "COMPLETE",
      inspectedImageCount: elements.length,
      visibleImageCount,
      skippedImageCount,
      skippedLazyImageCount,
      networkOutcomeCount: input.outcomes.length,
      issueCount: issues.length,
      elementLimitReached,
      outcomeLimitReached: input.outcomeLimitReached,
      notices: Array.from(new Set(notices)),
    },
    issues,
  };
}

export function isVisibleImageElement(image: InspectedImageElement): boolean {
  return (
    image.connected &&
    image.display !== "none" &&
    image.visibility !== "hidden" &&
    image.visibility !== "collapse" &&
    image.opacity > 0 &&
    image.renderedWidth > 0 &&
    image.renderedHeight > 0
  );
}

export function classifyBrokenImage(
  image: InspectedImageElement,
  outcome: ImageNetworkOutcome | undefined,
): {
  failureCategory: string;
  statusCode?: number;
  failureReason?: string;
  confidence: number;
} | null {
  if (outcome?.kind === "HTTP_4XX" || outcome?.kind === "HTTP_5XX") {
    return {
      failureCategory: outcome.kind,
      statusCode: outcome.statusCode,
      confidence: 99,
    };
  }
  if (outcome?.kind === "REQUEST_FAILED") {
    return {
      failureCategory: "REQUEST_FAILED",
      failureReason: outcome.failureReason,
      confidence: 97,
    };
  }
  if (image.complete && image.naturalWidth === 0) {
    return {
      failureCategory: "DOM_ZERO_NATURAL_WIDTH",
      confidence: 92,
    };
  }
  return null;
}

export function emptyBrokenImageAnalysis(
  status: BrokenImageAnalysis["status"] = "NOT_REQUESTED",
): BrokenImageAnalysis {
  return {
    status,
    inspectedImageCount: 0,
    visibleImageCount: 0,
    skippedImageCount: 0,
    skippedLazyImageCount: 0,
    networkOutcomeCount: 0,
    issueCount: 0,
    elementLimitReached: false,
    outcomeLimitReached: false,
    notices:
      status === "NOT_REQUESTED"
        ? ["Broken-image analysis was not selected for this scan."]
        : [],
  };
}

/**
 * Suppresses Phase 5 image HTTP/request issues that were upgraded to
 * BROKEN_IMAGE findings.
 */
export function suppressDuplicateImageNetworkIssues(
  issues: DiagnosticIssue[],
  brokenImageIssues: DiagnosticIssue[],
): DiagnosticIssue[] {
  const brokenUrls = new Set(
    brokenImageIssues
      .map((issue) => issue.resourceUrl)
      .filter((url): url is string => Boolean(url)),
  );
  return issues.filter((issue) => {
    if (issue.type !== "HTTP_ERROR" && issue.type !== "REQUEST_FAILED") {
      return true;
    }
    if (issue.metadata.resourceType !== "image") {
      return true;
    }
    if (!issue.resourceUrl) {
      return true;
    }
    return !brokenUrls.has(issue.resourceUrl);
  });
}
