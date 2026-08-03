import { z } from "zod";
import type { BasicScanResult, ScanErrorResponse } from "@/types/scan";

const deferredCheckSchema = z.enum([
  "consoleErrors",
  "networkErrors",
  "brokenImages",
  "mobileLayout",
  "accessibility",
]);

const basicPageMetadataSchema = z.strictObject({
  requestedUrl: z.string().min(1),
  finalUrl: z.string().min(1),
  title: z.string(),
  statusCode: z.number().int().nullable(),
  statusText: z.string().nullable(),
  contentType: z.string().nullable(),
  redirectCount: z.number().int().nonnegative(),
  navigationDurationMs: z.number().nonnegative(),
});

const publicScreenshotUrlSchema = z
  .string()
  .regex(
    /^\/scan-results\/[0-9a-fA-F-]{36}\/desktop\.png$/,
    "Screenshot URL must be a safe /scan-results/{scanId}/desktop.png path.",
  )
  .refine((value) => !value.includes("..") && !value.includes("\\"), {
    message: "Screenshot URL must not contain path traversal.",
  });

const basicScreenshotResultSchema = z
  .strictObject({
    requested: z.boolean(),
    available: z.boolean(),
    publicUrl: publicScreenshotUrlSchema.optional(),
    captureMode: z.enum(["FULL_PAGE", "VIEWPORT"]).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    reason: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.available) {
      if (!value.publicUrl) {
        ctx.addIssue({
          code: "custom",
          message: "Available screenshots require a publicUrl.",
          path: ["publicUrl"],
        });
      }
      if (!value.captureMode) {
        ctx.addIssue({
          code: "custom",
          message: "Available screenshots require a captureMode.",
          path: ["captureMode"],
        });
      }
    }
  });

const blockedRequestSchema = z.strictObject({
  hostname: z.string().min(1),
  reason: z.string().min(1),
  resourceType: z.string().min(1),
});

const scanSecuritySummarySchema = z.strictObject({
  inspectedRequestCount: z.number().int().nonnegative(),
  uniqueHostCount: z.number().int().nonnegative(),
  blockedRequestCount: z.number().int().nonnegative(),
  blockedRequests: z.array(blockedRequestSchema),
});

export const basicScanResultSchema = z.strictObject({
  success: z.literal(true),
  mode: z.literal("BASIC_SCAN"),
  scanId: z.string().min(1),
  targetUrl: z.string().min(1),
  targetWasContacted: z.literal(true),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  durationMs: z.number().nonnegative(),
  page: basicPageMetadataSchema,
  screenshot: basicScreenshotResultSchema,
  executedCapabilities: z.array(z.string()),
  deferredChecks: z.array(deferredCheckSchema),
  security: scanSecuritySummarySchema,
  diagnostics: z.strictObject({
    status: z.literal("NOT_RUN"),
    issues: z.array(z.never()).length(0),
  }),
  notices: z.array(z.string()),
});

export const scanErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  code: z.string().min(1),
  scanId: z.string().optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export function parseScanResult(value: unknown): BasicScanResult | null {
  const parsed = basicScanResultSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data as BasicScanResult;
}

export function parseScanErrorResponse(
  value: unknown,
): ScanErrorResponse | null {
  const parsed = scanErrorResponseSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data as ScanErrorResponse;
}
