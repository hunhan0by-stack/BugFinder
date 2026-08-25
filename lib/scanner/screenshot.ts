import "server-only";

import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { DESKTOP_VIEWPORT } from "@/lib/scanner/browser-context";
import {
  removeIncompleteMobileScreenshot,
  removeIncompleteScreenshot,
  writeDesktopScreenshot,
  writeMobileScreenshot,
} from "@/lib/scanner/scan-storage";
import { storageFailureNotice } from "@/lib/scanner/storage-errors";
import type { BasicScreenshotResult } from "@/types/scan";

function screenshotFailureResult(
  kind: "desktop" | "mobile",
  error?: unknown,
): BasicScreenshotResult {
  const storageNotice = error ? storageFailureNotice(error) : null;
  return {
    requested: true,
    available: false,
    reason:
      storageNotice ??
      (kind === "desktop"
        ? "The desktop screenshot could not be created."
        : "The mobile screenshot could not be created."),
  };
}

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
    } catch (error) {
      if (storageFailureNotice(error)) {
        await removeIncompleteScreenshot(scanId);
        return screenshotFailureResult("desktop", error);
      }
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
        } catch (error) {
          await removeIncompleteScreenshot(scanId);
          return screenshotFailureResult("desktop", error);
        }
      }

      await removeIncompleteScreenshot(scanId);
      return screenshotFailureResult("desktop");
    }
  } catch (error) {
    await removeIncompleteScreenshot(scanId);
    return screenshotFailureResult("desktop", error);
  }
}

export async function captureMobileScreenshot(
  page: Page,
  scanId: string,
  config: ScannerConfig,
): Promise<BasicScreenshotResult> {
  const width = config.mobileViewportWidth;
  const height = config.mobileViewportHeight;
  try {
    const scrollHeight = await measureScrollHeight(page);
    const useFullPage = scrollHeight <= config.maxFullPageHeight;
    const timeout = config.screenshotTimeoutMs;

    try {
      const buffer = await page.screenshot({
        fullPage: useFullPage,
        type: "png",
        timeout,
      });
      if (buffer.byteLength === 0) {
        await removeIncompleteMobileScreenshot(scanId);
        return {
          requested: true,
          available: false,
          reason: "The mobile screenshot could not be created.",
        };
      }
      const written = await writeMobileScreenshot(scanId, buffer);
      if (useFullPage) {
        return {
          requested: true,
          available: true,
          publicUrl: written.publicUrl,
          captureMode: "FULL_PAGE",
          width,
          height: scrollHeight,
        };
      }
      return {
        requested: true,
        available: true,
        publicUrl: written.publicUrl,
        captureMode: "VIEWPORT",
        width,
        height,
        reason: "The page was too tall for a full-page capture.",
      };
    } catch (error) {
      if (storageFailureNotice(error)) {
        await removeIncompleteMobileScreenshot(scanId);
        return screenshotFailureResult("mobile", error);
      }
      try {
        const buffer = await page.screenshot({
          fullPage: false,
          type: "png",
          timeout,
        });
        if (buffer.byteLength === 0) {
          await removeIncompleteMobileScreenshot(scanId);
          return screenshotFailureResult("mobile");
        }
        const written = await writeMobileScreenshot(scanId, buffer);
        return {
          requested: true,
          available: true,
          publicUrl: written.publicUrl,
          captureMode: "VIEWPORT",
          width,
          height,
          reason: "The page was too tall for a full-page capture.",
        };
      } catch (fallbackError) {
        await removeIncompleteMobileScreenshot(scanId);
        return screenshotFailureResult("mobile", fallbackError);
      }
    }
  } catch (error) {
    await removeIncompleteMobileScreenshot(scanId);
    return screenshotFailureResult("mobile", error);
  }
}
