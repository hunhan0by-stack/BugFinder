import "server-only";

import type { Page, Response } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";

export type NavigationOutcome = {
  response: Response | null;
  navigationDurationMs: number;
  finalUrl: string;
  title: string;
  statusCode: number | null;
  statusText: string | null;
  contentType: string | null;
};

function isUnsupportedContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const lower = contentType.toLowerCase();
  if (lower.includes("text/html") || lower.includes("application/xhtml+xml")) {
    return false;
  }
  return (
    lower.startsWith("application/pdf") ||
    lower.startsWith("application/zip") ||
    lower.startsWith("application/octet-stream") ||
    lower.startsWith("image/") ||
    lower.startsWith("video/") ||
    lower.startsWith("audio/")
  );
}

export async function navigateForBasicScan(
  page: Page,
  targetUrl: string,
  config: ScannerConfig,
): Promise<NavigationOutcome> {
  const started = performance.now();
  let response: Response | null = null;

  try {
    // Commit gives headers early so non-HTML payloads can be rejected before
    // Chromium tries to render or download them.
    response = await page.goto(targetUrl, {
      waitUntil: "commit",
      timeout: config.pageTimeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) {
      throw new ScanError({
        code: "NAVIGATION_TIMEOUT",
        httpStatus: 504,
        publicMessage: SCAN_ERROR_MESSAGES.NAVIGATION_TIMEOUT,
        cause: error,
      });
    }
    if (/ERR_CERT|SSL|TLS|certificate/i.test(message)) {
      throw new ScanError({
        code: "TLS_ERROR",
        httpStatus: 502,
        publicMessage: SCAN_ERROR_MESSAGES.TLS_ERROR,
        cause: error,
      });
    }
    if (/download|pdf|octet-stream|net::ERR_ABORTED/i.test(message)) {
      throw new ScanError({
        code: "UNSUPPORTED_CONTENT_TYPE",
        httpStatus: 415,
        publicMessage: SCAN_ERROR_MESSAGES.UNSUPPORTED_CONTENT_TYPE,
        cause: error,
      });
    }
    throw new ScanError({
      code: "WEBSITE_UNAVAILABLE",
      httpStatus: 502,
      publicMessage: SCAN_ERROR_MESSAGES.WEBSITE_UNAVAILABLE,
      cause: error,
    });
  }

  const earlyContentType = response
    ? response.headers()["content-type"] ?? null
    : null;
  if (isUnsupportedContentType(earlyContentType)) {
    throw new ScanError({
      code: "UNSUPPORTED_CONTENT_TYPE",
      httpStatus: 415,
      publicMessage: SCAN_ERROR_MESSAGES.UNSUPPORTED_CONTENT_TYPE,
    });
  }

  try {
    await page.waitForLoadState("domcontentloaded", {
      timeout: config.pageTimeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) {
      throw new ScanError({
        code: "NAVIGATION_TIMEOUT",
        httpStatus: 504,
        publicMessage: SCAN_ERROR_MESSAGES.NAVIGATION_TIMEOUT,
        cause: error,
      });
    }
    throw new ScanError({
      code: "WEBSITE_UNAVAILABLE",
      httpStatus: 502,
      publicMessage: SCAN_ERROR_MESSAGES.WEBSITE_UNAVAILABLE,
      cause: error,
    });
  }

  if (config.stabilizationMs > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, config.stabilizationMs);
    });
  }

  const finalUrl = page.url();
  const title = await page.title();
  const statusCode = response ? response.status() : null;
  const statusText = response ? response.statusText() : null;
  const contentType = response
    ? response.headers()["content-type"] ?? null
    : null;

  if (isUnsupportedContentType(contentType)) {
    throw new ScanError({
      code: "UNSUPPORTED_CONTENT_TYPE",
      httpStatus: 415,
      publicMessage: SCAN_ERROR_MESSAGES.UNSUPPORTED_CONTENT_TYPE,
    });
  }

  return {
    response,
    navigationDurationMs: Math.round((performance.now() - started) * 100) / 100,
    finalUrl,
    title,
    statusCode,
    statusText,
    contentType,
  };
}
