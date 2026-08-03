import "server-only";

import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { DESKTOP_VIEWPORT } from "@/lib/scanner/browser-context";
import {
  removeIncompleteScreenshot,
  writeDesktopScreenshot,
} from "@/lib/scanner/scan-storage";
import type { BasicScreenshotResult } from "@/types/scan";

async function measureScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const element = document.documentElement;
    return Math.max(
      element.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    );
  });
}

export async function captureDesktopScreenshot(
  page: Page,
  scanId: string,
  config: ScannerConfig,
): Promise<BasicScreenshotResult> {
  try {
    const height = await measureScrollHeight(page);
    const useFullPage = height <= config.maxFullPageHeight;
    const timeout = config.screenshotTimeoutMs;

    try {
      const buffer = await page.screenshot({
        fullPage: useFullPage,
        type: "png",
        timeout,
      });

      if (buffer.byteLength === 0) {
        await removeIncompleteScreenshot(scanId);
        return {
          requested: true,
          available: false,
          reason: "The desktop screenshot could not be created.",
        };
      }

      const written = await writeDesktopScreenshot(scanId, buffer);
      if (useFullPage) {
        return {
          requested: true,
          available: true,
          publicUrl: written.publicUrl,
          captureMode: "FULL_PAGE",
          width: DESKTOP_VIEWPORT.width,
          height,
        };
      }

      return {
        requested: true,
        available: true,
        publicUrl: written.publicUrl,
        captureMode: "VIEWPORT",
        width: DESKTOP_VIEWPORT.width,
        height: DESKTOP_VIEWPORT.height,
        reason: "The page was too tall for a full-page capture.",
      };
    } catch {
      // Fall back to viewport capture when full-page fails.
      if (useFullPage) {
        try {
          const buffer = await page.screenshot({
            fullPage: false,
            type: "png",
            timeout,
          });
          if (buffer.byteLength === 0) {
            await removeIncompleteScreenshot(scanId);
            return {
              requested: true,
              available: false,
              reason: "The desktop screenshot could not be created.",
            };
          }
          const written = await writeDesktopScreenshot(scanId, buffer);
          return {
            requested: true,
            available: true,
            publicUrl: written.publicUrl,
            captureMode: "VIEWPORT",
            width: DESKTOP_VIEWPORT.width,
            height: DESKTOP_VIEWPORT.height,
            reason: "The page was too tall for a full-page capture.",
          };
        } catch {
          await removeIncompleteScreenshot(scanId);
          return {
            requested: true,
            available: false,
            reason: "The desktop screenshot could not be created.",
          };
        }
      }

      await removeIncompleteScreenshot(scanId);
      return {
        requested: true,
        available: false,
        reason: "The desktop screenshot could not be created.",
      };
    }
  } catch {
    await removeIncompleteScreenshot(scanId);
    return {
      requested: true,
      available: false,
      reason: "The desktop screenshot could not be created.",
    };
  }
}
