export type ScanMode = "BASIC_SCAN";

export type ScanOptionKey =
  | "consoleErrors"
  | "networkErrors"
  | "brokenImages"
  | "mobileLayout"
  | "accessibility"
  | "screenshots";

export type ScanOptions = {
  consoleErrors: boolean;
  networkErrors: boolean;
  brokenImages: boolean;
  mobileLayout: boolean;
  accessibility: boolean;
  screenshots: boolean;
};

export type ScanRequestInput = {
  url: string;
  options: ScanOptions;
};

/** Checks selected by the user that Phase 4 does not execute yet. */
export type DeferredCheck =
  | "consoleErrors"
  | "networkErrors"
  | "brokenImages"
  | "mobileLayout"
  | "accessibility";

export type BasicPageMetadata = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  statusCode: number | null;
  statusText: string | null;
  contentType: string | null;
  redirectCount: number;
  navigationDurationMs: number;
};

export type BasicScreenshotResult = {
  requested: boolean;
  available: boolean;
  publicUrl?: string;
  captureMode?: "FULL_PAGE" | "VIEWPORT";
  width?: number;
  height?: number;
  reason?: string;
};

export type BlockedRequestSummary = {
  hostname: string;
  reason: string;
  resourceType: string;
};

export type ScanSecuritySummary = {
  inspectedRequestCount: number;
  uniqueHostCount: number;
  blockedRequestCount: number;
  blockedRequests: BlockedRequestSummary[];
};

export type BasicScanDiagnostics = {
  status: "NOT_RUN";
  issues: [];
};

/**
 * Successful Phase 4 result. Confirms browser navigation only — not a bug
 * assessment. Diagnostic issue arrays stay empty until later phases.
 */
export type BasicScanResult = {
  success: true;
  mode: "BASIC_SCAN";
  scanId: string;
  targetUrl: string;
  targetWasContacted: true;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  page: BasicPageMetadata;
  screenshot: BasicScreenshotResult;
  executedCapabilities: string[];
  deferredChecks: DeferredCheck[];
  security: ScanSecuritySummary;
  diagnostics: BasicScanDiagnostics;
  notices: string[];
};

/** Alias used by the client and API for the live Phase 4 success payload. */
export type ScanResult = BasicScanResult;

export type ScanErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_URL"
  | "URL_TOO_LONG"
  | "URL_CREDENTIALS_NOT_ALLOWED"
  | "UNSUPPORTED_PORT"
  | "BLOCKED_HOSTNAME"
  | "BLOCKED_IP"
  | "BLOCKED_TARGET"
  | "DNS_RESOLUTION_FAILED"
  | "UNSAFE_REDIRECT"
  | "REDIRECT_LIMIT_EXCEEDED"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "SCAN_BUSY"
  | "BROWSER_UNAVAILABLE"
  | "NAVIGATION_TIMEOUT"
  | "SCAN_TIMEOUT"
  | "WEBSITE_UNAVAILABLE"
  | "TLS_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "SCREENSHOT_FAILED"
  | "INTERNAL_ERROR";

export type ScanErrorResponse = {
  success: false;
  error: string;
  code: ScanErrorCode;
  scanId?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ScanResponse = BasicScanResult | ScanErrorResponse;
