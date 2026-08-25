import "server-only";

import { runBasicScan } from "@/lib/scanner/basic-scan";
import { isScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import { getScannerConfig } from "@/lib/config/scanner-config";
import { getRuntimeConfig } from "@/lib/config/runtime-config";
import { logScanEvent } from "@/lib/observability/scan-logger";
import {
  clientKeyFromRequest,
  getScanHttpRateLimiter,
} from "@/lib/security/http-rate-limiter";
import {
  scanRequestSchema,
  toFieldErrors,
  userFacingMessage,
} from "@/lib/validation/scan-schema";
import type { ScanErrorCode, ScanErrorResponse } from "@/types/scan";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const ALLOW_POST_HEADERS = {
  ...NO_STORE_HEADERS,
  Allow: "POST",
} as const;

function errorResponse(
  status: number,
  code: ScanErrorCode,
  error: string,
  scanId?: string,
  fieldErrors?: Record<string, string[]>,
  extraHeaders?: Record<string, string>,
): Response {
  const body: ScanErrorResponse = {
    success: false,
    error,
    code,
    ...(scanId ? { scanId } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  };

  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

function methodNotAllowed(): Response {
  return errorResponse(
    405,
    "METHOD_NOT_ALLOWED",
    SCAN_ERROR_MESSAGES.METHOD_NOT_ALLOWED,
    undefined,
    undefined,
    { Allow: "POST" },
  );
}

async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      return {
        ok: false,
        response: errorResponse(
          413,
          "PAYLOAD_TOO_LARGE",
          SCAN_ERROR_MESSAGES.PAYLOAD_TOO_LARGE,
        ),
      };
    }
  }

  const text = await request.text();
  if (text.length > maxBytes) {
    return {
      ok: false,
      response: errorResponse(
        413,
        "PAYLOAD_TOO_LARGE",
        SCAN_ERROR_MESSAGES.PAYLOAD_TOO_LARGE,
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        "INVALID_JSON",
        SCAN_ERROR_MESSAGES.INVALID_JSON,
      ),
    };
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 405, headers: ALLOW_POST_HEADERS });
}

/**
 * Phase 4–9 scanner endpoint. Validates the request, applies SSRF
 * protections inside the scanner, and returns a bounded diagnostic result.
 */
export async function POST(request: Request): Promise<Response> {
  const scanId = crypto.randomUUID();
  const runtimeConfig = getRuntimeConfig();
  const limiter = getScanHttpRateLimiter();
  const clientKey = clientKeyFromRequest(request, runtimeConfig.trustProxy);
  const rate = limiter.check(clientKey);

  logScanEvent({
    level: "info",
    event: "scan.request_received",
    scanId,
  });

  if (!rate.allowed) {
    logScanEvent({
      level: "warn",
      event: "scan.rate_limited",
      scanId,
      reasonCode: "RATE_LIMITED",
    });
    return errorResponse(
      429,
      "RATE_LIMITED",
      SCAN_ERROR_MESSAGES.RATE_LIMITED,
      scanId,
      undefined,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  let config;
  try {
    config = getScannerConfig();
  } catch {
    logScanEvent({
      level: "error",
      event: "scan.failed",
      scanId,
      reasonCode: "INTERNAL_ERROR",
    });
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      SCAN_ERROR_MESSAGES.INTERNAL_ERROR,
      scanId,
    );
  }

  const bodyResult = await readJsonBody(request, config.maxRequestBodyBytes);
  if (!bodyResult.ok) {
    logScanEvent({
      level: "warn",
      event: "scan.validation_rejected",
      scanId,
      reasonCode:
        bodyResult.response.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
    });
    return bodyResult.response;
  }

  const parsed = scanRequestSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    const topLevelError = userFacingMessage(
      fieldErrors.url?.[0] ?? fieldErrors.options?.[0] ?? fieldErrors.request?.[0],
    );

    logScanEvent({
      level: "warn",
      event: "scan.validation_rejected",
      scanId,
      reasonCode: "VALIDATION_ERROR",
    });

    return errorResponse(
      400,
      "VALIDATION_ERROR",
      topLevelError,
      scanId,
      fieldErrors,
    );
  }

  try {
    const result = await runBasicScan({
      scanId,
      url: parsed.data.url,
      options: parsed.data.options,
    });

    return Response.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isScanError(error)) {
      return errorResponse(
        error.httpStatus,
        error.code,
        error.publicMessage,
        scanId,
      );
    }

    logScanEvent({
      level: "error",
      event: "scan.failed",
      scanId,
      reasonCode: "INTERNAL_ERROR",
    });

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      SCAN_ERROR_MESSAGES.INTERNAL_ERROR,
      scanId,
    );
  }
}
