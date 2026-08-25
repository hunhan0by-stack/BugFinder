import "server-only";

import type { ScanErrorCode } from "@/types/scan";

export type SafeInternalDetails = {
  category?: string;
  hostname?: string;
  port?: number;
};

/**
 * Typed scanner failure. `publicMessage` is the only text safe for the UI.
 * Internal details stay on the server.
 */
export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly httpStatus: number;
  readonly publicMessage: string;
  readonly details?: SafeInternalDetails;

  constructor(input: {
    code: ScanErrorCode;
    httpStatus: number;
    publicMessage: string;
    details?: SafeInternalDetails;
    cause?: unknown;
  }) {
    super(input.publicMessage, { cause: input.cause });
    this.name = "ScanError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.publicMessage = input.publicMessage;
    this.details = input.details;
  }
}

export function isScanError(error: unknown): error is ScanError {
  if (error instanceof ScanError) {
    return true;
  }

  // Node's test runner can load the module twice, which breaks instanceof.
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "ScanError" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    "publicMessage" in error &&
    typeof (error as { publicMessage?: unknown }).publicMessage === "string" &&
    "httpStatus" in error &&
    typeof (error as { httpStatus?: unknown }).httpStatus === "number"
  );
}

export const SCAN_ERROR_MESSAGES = {
  INVALID_URL: "Enter a valid website address beginning with http:// or https://.",
  URL_TOO_LONG: "The website address is too long.",
  URL_CREDENTIALS_NOT_ALLOWED:
    "Website addresses containing embedded usernames or passwords are not supported.",
  UNSUPPORTED_PORT: "This website port is not allowed by the scanner.",
  BLOCKED_HOSTNAME:
    "That website address is not allowed by the scanner’s network policy.",
  BLOCKED_IP:
    "That website address resolves to a network location the scanner is not allowed to open.",
  BLOCKED_TARGET:
    "That website address is not allowed by the scanner’s network policy.",
  DNS_RESOLUTION_FAILED: "The website hostname could not be resolved safely.",
  UNSAFE_REDIRECT:
    "The website redirected to a destination that the scanner is not allowed to access.",
  REDIRECT_LIMIT_EXCEEDED:
    "The website redirected too many times for this basic scan.",
  RESOURCE_LIMIT_EXCEEDED:
    "The page created too many network requests for this basic scan.",
  SCAN_BUSY: "Another scan is currently running. Try again after it finishes.",
  RATE_LIMITED: "Too many scan requests. Try again shortly.",
  METHOD_NOT_ALLOWED: "This endpoint only accepts POST requests.",
  BROWSER_UNAVAILABLE:
    "Chromium could not start. Confirm that the Playwright browser is installed.",
  NAVIGATION_TIMEOUT: "The page took too long to open.",
  SCAN_TIMEOUT: "The basic browser scan exceeded the allowed time.",
  WEBSITE_UNAVAILABLE: "The website could not be opened.",
  TLS_ERROR: "The website’s secure connection could not be verified.",
  UNSUPPORTED_CONTENT_TYPE:
    "The scanner only opens HTML pages in this phase.",
  SCREENSHOT_FAILED: "The desktop screenshot could not be created.",
  INTERNAL_ERROR: "The basic browser scan could not be completed.",
  INVALID_JSON: "The request body could not be read as JSON.",
  VALIDATION_ERROR: "The scan request was not valid.",
  PAYLOAD_TOO_LARGE: "The scan request is too large.",
} as const satisfies Record<ScanErrorCode, string>;
