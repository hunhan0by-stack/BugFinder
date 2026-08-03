import "server-only";

import { runBasicScan } from "@/lib/scanner/basic-scan";
import { isScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import {
  getScannerConfig,
} from "@/lib/config/scanner-config";
import {
  scanRequestSchema,
  toFieldErrors,
  userFacingMessage,
} from "@/lib/validation/scan-schema";
import type { ScanErrorCode, ScanErrorResponse } from "@/types/scan";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function errorResponse(
  status: number,
  code: ScanErrorCode | string,
  error: string,
  scanId?: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  const body: ScanErrorResponse = {
    success: false,
    error,
    code: code as ScanErrorCode,
    ...(scanId ? { scanId } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  };

  return Response.json(body, { status, headers: NO_STORE_HEADERS });
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
        "The request body could not be read as JSON.",
      ),
    };
  }
}

/**
 * Phase 4 basic scanner endpoint. Validates the request, applies SSRF
 * protections inside the scanner, opens one authorized page, and returns
 * truthful navigation metadata — not diagnostic bug findings.
 */
export async function POST(request: Request): Promise<Response> {
  const scanId = crypto.randomUUID();

  let config;
  try {
    config = getScannerConfig();
  } catch {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      SCAN_ERROR_MESSAGES.INTERNAL_ERROR,
      scanId,
    );
  }

  const bodyResult = await readJsonBody(request, config.maxRequestBodyBytes);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsed = scanRequestSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    const topLevelError = userFacingMessage(
      fieldErrors.url?.[0] ?? fieldErrors.options?.[0] ?? fieldErrors.request?.[0],
    );

    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[scan ${scanId}] rejected: VALIDATION_ERROR (${Object.keys(fieldErrors).join(", ")})`,
      );
    }

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

    if (process.env.NODE_ENV !== "production") {
      console.error(`[scan ${scanId}] failed: INTERNAL_ERROR`);
    }

    return errorResponse(
      500,
      "INTERNAL_ERROR",
      SCAN_ERROR_MESSAGES.INTERNAL_ERROR,
      scanId,
    );
  }
}
