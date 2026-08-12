import { createHash } from "node:crypto";
import type { Page, Request, Response } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";

export type ImageOutcomeKind =
  | "HTTP_SUCCESS"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "REQUEST_FAILED"
  | "INTENTIONAL_ABORT"
  | "UNKNOWN";

export type ImageNetworkOutcome = {
  correlationKey: string;
  sanitizedUrl: string;
  kind: ImageOutcomeKind;
  statusCode?: number;
  failureReason?: string;
};

/**
 * Observes image resource outcomes for broken-image correlation. Does not
 * create general network diagnostic issues.
 */
export class ImageOutcomeObserver {
  private readonly outcomes = new Map<string, ImageNetworkOutcome>();
  private outcomeLimitReached = false;
  private readonly config: ScannerConfig;
  private readonly intentionalAborts: WeakSet<Request>;
  private attachedPage: Page | null = null;
  private onRequestFailed?: (request: Request) => void;
  private onResponse?: (response: Response) => void;

  constructor(config: ScannerConfig, intentionalAborts: WeakSet<Request>) {
    this.config = config;
    this.intentionalAborts = intentionalAborts;
  }

  attach(page: Page): void {
    this.attachedPage = page;
    this.onRequestFailed = (request) => {
      this.handleRequestFailed(request);
    };
    this.onResponse = (response) => {
      this.handleResponse(response);
    };
    page.on("requestfailed", this.onRequestFailed);
    page.on("response", this.onResponse);
  }

  dispose(): void {
    const page = this.attachedPage;
    if (page) {
      if (this.onRequestFailed) page.off("requestfailed", this.onRequestFailed);
      if (this.onResponse) page.off("response", this.onResponse);
    }
    this.attachedPage = null;
  }

  getOutcomes(): ImageNetworkOutcome[] {
    return Array.from(this.outcomes.values());
  }

  wasOutcomeLimitReached(): boolean {
    return this.outcomeLimitReached;
  }

  clear(): void {
    this.outcomes.clear();
  }

  private record(outcome: ImageNetworkOutcome): void {
    if (this.outcomes.has(outcome.correlationKey)) {
      this.outcomes.set(outcome.correlationKey, outcome);
      return;
    }
    if (this.outcomes.size >= this.config.maxImageNetworkOutcomes) {
      this.outcomeLimitReached = true;
      return;
    }
    this.outcomes.set(outcome.correlationKey, outcome);
  }

  private handleRequestFailed(request: Request): void {
    if (request.resourceType() !== "image") {
      return;
    }
    const rawUrl = request.url();
    const correlationKey = hashImageUrl(rawUrl);
    if (this.intentionalAborts.has(request)) {
      this.record({
        correlationKey,
        sanitizedUrl: sanitizeDiagnosticUrl(
          rawUrl,
          this.config.maxDiagnosticUrlLength,
        ),
        kind: "INTENTIONAL_ABORT",
      });
      return;
    }
    this.record({
      correlationKey,
      sanitizedUrl: sanitizeDiagnosticUrl(
        rawUrl,
        this.config.maxDiagnosticUrlLength,
      ),
      kind: "REQUEST_FAILED",
      failureReason: request.failure()?.errorText ?? "unknown",
    });
  }

  private handleResponse(response: Response): void {
    const request = response.request();
    if (request.resourceType() !== "image") {
      return;
    }
    const status = response.status();
    const rawUrl = request.url();
    const correlationKey = hashImageUrl(rawUrl);
    let kind: ImageOutcomeKind = "HTTP_SUCCESS";
    if (status >= 500) kind = "HTTP_5XX";
    else if (status >= 400) kind = "HTTP_4XX";
    this.record({
      correlationKey,
      sanitizedUrl: sanitizeDiagnosticUrl(
        rawUrl,
        this.config.maxDiagnosticUrlLength,
      ),
      kind,
      statusCode: status,
    });
  }
}

export function hashImageUrl(rawUrl: string): string {
  return createHash("sha256").update(rawUrl).digest("hex");
}
