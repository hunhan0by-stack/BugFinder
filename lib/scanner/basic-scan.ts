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
  createScanContext,
} from "@/lib/scanner/browser-context";
import { navigateForBasicScan } from "@/lib/scanner/navigation";
import { isScanError, ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import { scanLimiter } from "@/lib/scanner/scan-limiter";
import { removeScanDirectoryIfEmpty } from "@/lib/scanner/scan-storage";
import { captureDesktopScreenshot } from "@/lib/scanner/screenshot";
import type { DnsLookupFn } from "@/lib/security/dns-policy";
import { RequestGuard } from "@/lib/security/request-guard";
import { validateScanTarget } from "@/lib/security/target-policy";
import { redactUrl } from "@/lib/utils/redact-url";
import type {
  BasicScanResult,
  DeferredCheck,
  ScanOptions,
} from "@/types/scan";

const DEFERRED_OPTION_KEYS: readonly DeferredCheck[] = [
  "consoleErrors",
  "networkErrors",
  "brokenImages",
  "mobileLayout",
  "accessibility",
];

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

function buildDeferredChecks(options: ScanOptions): DeferredCheck[] {
  return DEFERRED_OPTION_KEYS.filter((key) => options[key]);
}

function buildExecutedCapabilities(
  options: ScanOptions,
  screenshotAttempted: boolean,
): string[] {
  const capabilities = ["basicNavigation"];
  if (options.screenshots && screenshotAttempted) {
    capabilities.push("desktopScreenshot");
  }
  return capabilities;
}

/**
 * Runs one secure single-page basic scan. Always releases the concurrency slot
 * and closes browser resources in finally blocks.
 */
export async function runBasicScan(
  input: BasicScanInput,
  dependencies: BasicScanDependencies = {},
): Promise<BasicScanResult> {
  const config = dependencies.config ?? getScannerConfig();
  const now = dependencies.now ?? (() => new Date());
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const deadline = startedAtDate.getTime() + config.totalTimeoutMs;

  const release = scanLimiter.tryAcquire(config);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let createdScreenshotDir = false;
  const notices: string[] = [
    "Basic page scan completed. Chromium opened the authorized page and collected navigation metadata.",
    "Diagnostic bug checks have not been enabled yet. Console, network, image, mobile, and accessibility checks will be added in later phases.",
    "This result confirms browser navigation only and is not a full website assessment.",
    "Screenshots are stored locally in this project’s scan-results directory. Do not scan pages containing sensitive information unless you are authorized to store the resulting image.",
    "Application-level network checks reduce SSRF risk but do not replace an operating-system or container-level network sandbox.",
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

    const guard = new RequestGuard(config, dependencies.lookupFn);
    await guard.attach(context);

    page = await context.newPage();
    attachPageSafetyHandlers(page, notices);

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

    // Final URL must pass the same security policy as the original target.
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
        `The main response status was HTTP ${navigation.statusCode}. Diagnostic classification of HTTP errors begins in a later phase.`,
      );
    }

    if (!navigation.contentType) {
      notices.push(
        "The main response did not include a Content-Type header. The page still rendered in the browser.",
      );
    }

    let screenshot = {
      requested: false,
      available: false,
      reason: "Screenshot capture was not requested.",
    } as BasicScanResult["screenshot"];

    if (input.options.screenshots) {
      createdScreenshotDir = true;
      ensureTimeRemaining();
      screenshot = await captureDesktopScreenshot(page, input.scanId, config);
      if (!screenshot.available) {
        notices.push(
          "The page opened successfully, but the desktop screenshot could not be created.",
        );
      }
    }

    if (guard.stats.blockedRequestCount > 0) {
      notices.push(
        "The browser blocked one or more requests because their destinations were not permitted by the scanner’s network policy.",
      );
    }

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
      targetUrl: target.href,
      targetWasContacted: true,
      startedAt,
      completedAt,
      durationMs,
      page: {
        requestedUrl: target.href,
        finalUrl: navigation.finalUrl,
        title: navigation.title,
        statusCode: navigation.statusCode,
        statusText: navigation.statusText,
        contentType: navigation.contentType,
        redirectCount,
        navigationDurationMs: navigation.navigationDurationMs,
      },
      screenshot,
      executedCapabilities: buildExecutedCapabilities(
        input.options,
        input.options.screenshots,
      ),
      deferredChecks: buildDeferredChecks(input.options),
      security: {
        inspectedRequestCount: guard.stats.inspectedRequestCount,
        uniqueHostCount: guard.stats.uniqueHostCount,
        blockedRequestCount: guard.stats.blockedRequestCount,
        blockedRequests: guard.stats.blockedRequests,
      },
      diagnostics: {
        status: "NOT_RUN",
        issues: [],
      },
      notices: Array.from(new Set(notices)),
    };
  } catch (error) {
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
    await closeQuietly(page);
    await closeQuietly(context);
    await closeQuietly(browser);
    release();
  }
}
