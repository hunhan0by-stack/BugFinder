import "server-only";

import { chromium, type Browser } from "playwright";
import { ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";

export const SCANNER_USER_AGENT =
  "FrontendBugFinder/0.6 Authorized-QA-Scanner";

export const MOBILE_SCANNER_USER_AGENT =
  "FrontendBugFinder/0.6 Mobile Authorized-QA-Scanner";

export async function launchScannerBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: true,
    });
  } catch (error) {
    throw new ScanError({
      code: "BROWSER_UNAVAILABLE",
      httpStatus: 500,
      publicMessage: SCAN_ERROR_MESSAGES.BROWSER_UNAVAILABLE,
      cause: error,
    });
  }
}
