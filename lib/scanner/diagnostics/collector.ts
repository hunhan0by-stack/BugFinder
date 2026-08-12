import "server-only";

import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
} from "playwright";
import type {
  DiagnosticLimits,
  RawDiagnosticEvent,
} from "@/lib/scanner/diagnostics/raw-event-types";
import { finalizeDiagnostics } from "@/lib/scanner/diagnostics/finalize-diagnostics";
import { sanitizeDiagnosticText } from "@/lib/scanner/diagnostics/sanitize-text";
import { sanitizeStack } from "@/lib/scanner/diagnostics/sanitize-stack";
import { sanitizeDiagnosticUrl } from "@/lib/scanner/diagnostics/sanitize-url";
import type { DiagnosticResult } from "@/types/scan";

export type DiagnosticCollectorOptions = {
  collectConsoleErrors: boolean;
  collectNetworkErrors: boolean;
  limits: DiagnosticLimits;
  scanStartedAt: number;
  intentionalAborts: WeakSet<Request>;
};

/**
 * Per-scan diagnostic collector. Attach before navigation. Dispose before
 * closing the page so late shutdown events are ignored.
 */
export class DiagnosticCollector {
  private readonly options: DiagnosticCollectorOptions;
  private readonly events: RawDiagnosticEvent[] = [];
  private attachedPage: Page | null = null;
  private accepting = true;
  private droppedEventCount = 0;
  private ignoredEventCount = 0;
  private messageTruncationOccurred = false;
  private stackTruncationOccurred = false;
  private markedPartial = false;
  private readonly partialReasons: string[] = [];

  private onConsole?: (message: ConsoleMessage) => void;
  private onPageError?: (error: Error) => void;
  private onRequestFailed?: (request: Request) => void;
  private onResponse?: (response: Response) => void;

  constructor(options: DiagnosticCollectorOptions) {
    this.options = options;
  }

  attach(page: Page): void {
    this.attachedPage = page;

    if (this.options.collectConsoleErrors) {
      this.onConsole = (message) => {
        this.handleConsole(message);
      };
      this.onPageError = (error) => {
        this.handlePageError(error);
      };
      page.on("console", this.onConsole);
      page.on("pageerror", this.onPageError);
    }

    if (this.options.collectNetworkErrors) {
      this.onRequestFailed = (request) => {
        this.handleRequestFailed(request);
      };
      this.onResponse = (response) => {
        this.handleResponse(response);
      };
      page.on("requestfailed", this.onRequestFailed);
      page.on("response", this.onResponse);
    }
  }

  markCollectionPartial(reason: string): void {
    this.markedPartial = true;
    this.partialReasons.push(reason);
  }

  /**
   * Stop accepting events and detach listeners. Call before page/context close.
   */
  dispose(): void {
    this.accepting = false;
    const page = this.attachedPage;
    if (page) {
      if (this.onConsole) page.off("console", this.onConsole);
      if (this.onPageError) page.off("pageerror", this.onPageError);
      if (this.onRequestFailed) page.off("requestfailed", this.onRequestFailed);
      if (this.onResponse) page.off("response", this.onResponse);
    }
    this.attachedPage = null;
    this.onConsole = undefined;
    this.onPageError = undefined;
    this.onRequestFailed = undefined;
    this.onResponse = undefined;
  }

  finalize(finalPageUrl: string): DiagnosticResult {
    this.accepting = false;
    const result = finalizeDiagnostics({
      events: this.events,
      finalPageUrl,
      collectConsoleErrors: this.options.collectConsoleErrors,
      collectNetworkErrors: this.options.collectNetworkErrors,
      maxIssues: this.options.limits.maxIssues,
      maxEvidenceLength: this.options.limits.maxEvidenceLength,
      maxUrlLength: this.options.limits.maxDiagnosticUrlLength,
      droppedEventCount: this.droppedEventCount,
      ignoredEventCount: this.ignoredEventCount,
      messageTruncationOccurred: this.messageTruncationOccurred,
      stackTruncationOccurred: this.stackTruncationOccurred,
      markedPartial: this.markedPartial,
      partialReasons: this.partialReasons,
    });
    this.events.length = 0;
    return result;
  }

  private nowMs(): number {
    return Math.max(
      0,
      Math.round(performance.now() - this.options.scanStartedAt),
    );
  }

  private pushEvent(event: RawDiagnosticEvent): void {
    if (!this.accepting) {
      return;
    }
    if (this.events.length >= this.options.limits.maxEvents) {
      this.droppedEventCount += 1;
      return;
    }
    this.events.push(event);
  }

  private handleConsole(message: ConsoleMessage): void {
    if (!this.accepting || !this.options.collectConsoleErrors) {
      return;
    }
    if (message.type() !== "error") {
      return;
    }

    try {
      const location = message.location();
      const sanitizedMessage = sanitizeDiagnosticText(
        message.text(),
        this.options.limits.maxConsoleMessageLength,
      );
      if (sanitizedMessage.truncated) {
        this.messageTruncationOccurred = true;
      }

      const sourceUrl = location.url
        ? sanitizeDiagnosticUrl(
            location.url,
            this.options.limits.maxDiagnosticUrlLength,
          )
        : undefined;

      // Playwright location lineNumber/columnNumber are 1-based.
      this.pushEvent({
        kind: "CONSOLE",
        consoleType: message.type(),
        message: sanitizedMessage.text,
        sourceUrl,
        lineNumber:
          typeof location.lineNumber === "number" && location.lineNumber > 0
            ? location.lineNumber
            : undefined,
        columnNumber:
          typeof location.columnNumber === "number" && location.columnNumber > 0
            ? location.columnNumber
            : undefined,
        timestampMs: this.nowMs(),
        messageTruncated: sanitizedMessage.truncated,
      });
    } catch {
      this.markCollectionPartial(
        "A console diagnostic event could not be recorded safely.",
      );
    }
  }

  private handlePageError(error: Error): void {
    if (!this.accepting || !this.options.collectConsoleErrors) {
      return;
    }

    try {
      const sanitizedMessage = sanitizeDiagnosticText(
        error.message || "Unknown error",
        this.options.limits.maxPageErrorMessageLength,
      );
      if (sanitizedMessage.truncated) {
        this.messageTruncationOccurred = true;
      }
      const stack = sanitizeStack(
        error.stack,
        this.options.limits.maxStackLength,
      );
      if (stack.truncated) {
        this.stackTruncationOccurred = true;
      }

      this.pushEvent({
        kind: "PAGE_ERROR",
        name: sanitizeDiagnosticText(error.name || "Error", 200).text,
        message: sanitizedMessage.text,
        stack: stack.stack || undefined,
        topFrame: stack.topFrame,
        timestampMs: this.nowMs(),
        messageTruncated: sanitizedMessage.truncated,
        stackTruncated: stack.truncated,
      });
    } catch {
      this.markCollectionPartial(
        "A page-error diagnostic event could not be recorded safely.",
      );
    }
  }

  private handleRequestFailed(request: Request): void {
    if (!this.accepting || !this.options.collectNetworkErrors) {
      return;
    }

    try {
      if (this.options.intentionalAborts.has(request)) {
        this.ignoredEventCount += 1;
        return;
      }

      const failure = request.failure();
      const failureReason = failure?.errorText ?? "unknown";

      this.pushEvent({
        kind: "REQUEST_FAILED",
        method: request.method().toUpperCase(),
        resourceType: request.resourceType(),
        requestUrl: sanitizeDiagnosticUrl(
          request.url(),
          this.options.limits.maxDiagnosticUrlLength,
        ),
        failureReason: sanitizeDiagnosticText(failureReason, 500).text,
        isNavigationRequest: request.isNavigationRequest(),
        isMainFrameRequest: request.frame().parentFrame() === null,
        timestampMs: this.nowMs(),
      });
    } catch {
      this.markCollectionPartial(
        "A request-failure diagnostic event could not be recorded safely.",
      );
    }
  }

  private handleResponse(response: Response): void {
    if (!this.accepting || !this.options.collectNetworkErrors) {
      return;
    }

    try {
      const status = response.status();
      if (status < 400 || status > 599) {
        return;
      }

      const request = response.request();
      if (this.options.intentionalAborts.has(request)) {
        this.ignoredEventCount += 1;
        return;
      }

      const headers = response.headers();
      const contentType = headers["content-type"];

      this.pushEvent({
        kind: "HTTP_ERROR",
        method: request.method().toUpperCase(),
        resourceType: request.resourceType(),
        requestUrl: sanitizeDiagnosticUrl(
          request.url(),
          this.options.limits.maxDiagnosticUrlLength,
        ),
        statusCode: status,
        statusText: sanitizeDiagnosticText(response.statusText() || "", 200)
          .text,
        contentType: contentType
          ? sanitizeDiagnosticText(contentType, 200).text
          : undefined,
        isNavigationRequest: request.isNavigationRequest(),
        isMainFrameRequest: request.frame().parentFrame() === null,
        timestampMs: this.nowMs(),
      });
    } catch {
      this.markCollectionPartial(
        "An HTTP diagnostic event could not be recorded safely.",
      );
    }
  }
}

export function createDiagnosticLimitsFromConfig(config: {
  maxDiagnosticEvents: number;
  maxDiagnosticIssues: number;
  maxConsoleMessageLength: number;
  maxPageErrorMessageLength: number;
  maxStackLength: number;
  maxEvidenceLength: number;
  maxDiagnosticUrlLength: number;
}): DiagnosticLimits {
  return {
    maxEvents: config.maxDiagnosticEvents,
    maxIssues: config.maxDiagnosticIssues,
    maxConsoleMessageLength: config.maxConsoleMessageLength,
    maxPageErrorMessageLength: config.maxPageErrorMessageLength,
    maxStackLength: config.maxStackLength,
    maxEvidenceLength: config.maxEvidenceLength,
    maxDiagnosticUrlLength: config.maxDiagnosticUrlLength,
  };
}
