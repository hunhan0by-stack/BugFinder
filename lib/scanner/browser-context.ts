import "server-only";

import type { Browser, BrowserContext, Page } from "playwright";
import { SCANNER_USER_AGENT } from "@/lib/scanner/browser";

export const DESKTOP_VIEWPORT = { width: 1366, height: 768 } as const;

export async function createScanContext(
  browser: Browser,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
    userAgent: SCANNER_USER_AGENT,
    acceptDownloads: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    serviceWorkers: "block",
    permissions: [],
  });

  context.setDefaultTimeout(30_000);
  return context;
}

/**
 * Attaches handlers that keep Phase 4 non-interactive and non-blocking.
 */
export function attachBrowserSafetyHandlers(
  context: BrowserContext,
  notices: string[],
): void {
  context.on("page", (page) => {
    attachPageSafetyHandlers(page, notices);
  });
}

export function attachPageSafetyHandlers(
  page: Page,
  notices: string[],
): void {
  page.on("dialog", async (dialog) => {
    try {
      await dialog.dismiss();
    } catch {
      // Dialog may already be gone.
    }
  });

  page.on("download", async (download) => {
    try {
      await download.cancel();
    } catch {
      // Ignore cancel races.
    }
    notices.push(
      "A download attempt was blocked because downloads are disabled for basic scans.",
    );
  });

  page.on("popup", async (popup) => {
    try {
      await popup.close();
    } catch {
      // Ignore close races.
    }
    notices.push(
      "A popup window was closed immediately and was not inspected.",
    );
  });

  page.on("filechooser", async (chooser) => {
    try {
      await chooser.setFiles([]);
    } catch {
      // Ignore.
    }
  });
}
