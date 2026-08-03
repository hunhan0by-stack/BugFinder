import "server-only";

import {
  getScannerConfig,
  type ScannerConfig,
} from "@/lib/config/scanner-config";
import { ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";

/**
 * Simple in-process concurrency gate for the local MVP.
 * A production deployment needs a shared queue or distributed lock.
 */
class ScanLimiter {
  private active = 0;

  tryAcquire(config: ScannerConfig = getScannerConfig()): () => void {
    if (this.active >= config.maxConcurrentScans) {
      throw new ScanError({
        code: "SCAN_BUSY",
        httpStatus: 429,
        publicMessage: SCAN_ERROR_MESSAGES.SCAN_BUSY,
      });
    }

    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active = Math.max(0, this.active - 1);
    };
  }

  /** Test helper */
  getActiveCount(): number {
    return this.active;
  }

  /** Test helper */
  reset(): void {
    this.active = 0;
  }
}

export const scanLimiter = new ScanLimiter();
