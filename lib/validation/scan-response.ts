import { z } from "zod";
import type { BasicScanResult, ScanErrorResponse } from "@/types/scan";

const deferredCheckSchema = z.enum([
  "advancedWorkflow",
  "visualRegression",
  "authenticatedSession",
]);

const diagnosticStatusSchema = z.enum([
  "NOT_REQUESTED",
  "COMPLETE",
  "PARTIAL",
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
    /^\/scan-results\/[0-9a-fA-F-]{36}\/(desktop|mobile)\.png$/,
    "Screenshot URL must be a safe /scan-results/{scanId}/desktop.png or mobile.png path.",
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

const diagnosticSourceLocationSchema = z.strictObject({
  url: z.string().optional(),
  lineNumber: z.number().int().nonnegative().optional(),
  columnNumber: z.number().int().nonnegative().optional(),
});

const diagnosticIssueSchema = z
  .strictObject({
    id: z.string().min(1),
    type: z.enum([
      "CONSOLE_ERROR",
      "PAGE_ERROR",
      "REQUEST_FAILED",
      "HTTP_ERROR",
      "BROKEN_IMAGE",
      "DEAD_CLICK",
      "OBSTRUCTED_CONTROL",
      "FORM_STATE_ISSUE",
      "MOBILE_OVERFLOW",
      "MOBILE_VIEWPORT",
      "ACCESSIBILITY_VIOLATION",
    ]),
    severity: z.enum(["HIGH", "MEDIUM", "LOW", "INFO"]),
    confidence: z.number().int().min(0).max(100),
    title: z.string().min(1),
    description: z.string().min(1),
    observedBehavior: z.string().min(1),
    potentialUserImpact: z.string().min(1),
    technicalEvidence: z.string(),
    suggestedInvestigation: z.string().min(1),
    scope: z.enum([
      "MAIN_DOCUMENT",
      "SAME_ORIGIN",
      "THIRD_PARTY",
      "BROWSER",
      "UNKNOWN",
    ]),
    profile: z.enum(["DESKTOP", "MOBILE"]),
    pageUrl: z.string().min(1),
    resourceUrl: z.string().optional(),
    sourceLocation: diagnosticSourceLocationSchema.optional(),
    occurrenceCount: z.number().int().positive(),
    firstSeenMs: z.number().nonnegative(),
    lastSeenMs: z.number().nonnegative(),
    metadata: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.lastSeenMs < value.firstSeenMs) {
      ctx.addIssue({
        code: "custom",
        message: "lastSeenMs must be greater than or equal to firstSeenMs.",
        path: ["lastSeenMs"],
      });
    }
  });

const diagnosticCapabilityStatusesSchema = z.strictObject({
  console: diagnosticStatusSchema,
  network: diagnosticStatusSchema,
  brokenImages: diagnosticStatusSchema,
  mobileLayout: diagnosticStatusSchema,
  accessibility: diagnosticStatusSchema,
  safeInteractions: diagnosticStatusSchema,
});

const brokenImageAnalysisSchema = z.strictObject({
  status: diagnosticStatusSchema,
  inspectedImageCount: z.number().int().nonnegative(),
  visibleImageCount: z.number().int().nonnegative(),
  skippedImageCount: z.number().int().nonnegative(),
  skippedLazyImageCount: z.number().int().nonnegative(),
  networkOutcomeCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  elementLimitReached: z.boolean(),
  outcomeLimitReached: z.boolean(),
  notices: z.array(z.string()),
});

const mobileViewportSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive(),
  isMobile: z.literal(true),
  hasTouch: z.literal(true),
});

const mobileLayoutAnalysisSchema = z.strictObject({
  status: diagnosticStatusSchema,
  requested: z.boolean(),
  finalUrl: z.string().optional(),
  viewport: mobileViewportSchema,
  viewportMetaPresent: z.boolean().nullable(),
  viewportMetaContent: z.string().optional(),
  documentWidth: z.number().nonnegative().optional(),
  documentHeight: z.number().nonnegative().optional(),
  horizontalOverflowPx: z.number().nonnegative().optional(),
  analyzedElementCount: z.number().int().nonnegative(),
  overflowingElementCount: z.number().int().nonnegative(),
  elementLimitReached: z.boolean(),
  issueCount: z.number().int().nonnegative(),
  notices: z.array(z.string()),
});

const accessibilityAnalysisSchema = z.strictObject({
  status: diagnosticStatusSchema,
  engine: z.literal("axe-core"),
  engineVersion: z.string().optional(),
  standards: z.array(z.string()),
  violationRuleCount: z.number().int().nonnegative(),
  affectedNodeCount: z.number().int().nonnegative(),
  reportedIssueCount: z.number().int().nonnegative(),
  issueLimitReached: z.boolean(),
  nodeEvidenceLimitReached: z.boolean(),
  notices: z.array(z.string()),
});

const safeInteractionAnalysisSchema = z.strictObject({
  status: diagnosticStatusSchema,
  requested: z.boolean(),
  discoveredCandidateCount: z.number().int().nonnegative(),
  eligibleCandidateCount: z.number().int().nonnegative(),
  trialCheckedCount: z.number().int().nonnegative(),
  actualClickCount: z.number().int().nonnegative(),
  responsiveControlCount: z.number().int().nonnegative(),
  deadClickIssueCount: z.number().int().nonnegative(),
  obstructionIssueCount: z.number().int().nonnegative(),
  formStateIssueCount: z.number().int().nonnegative(),
  skippedUnsafeCount: z.number().int().nonnegative(),
  skippedNavigationCount: z.number().int().nonnegative(),
  skippedFormSubmissionCount: z.number().int().nonnegative(),
  skippedDestructiveCount: z.number().int().nonnegative(),
  skippedNetworkCount: z.number().int().nonnegative(),
  skippedPopupCount: z.number().int().nonnegative(),
  skippedDownloadCount: z.number().int().nonnegative(),
  skippedOffscreenCount: z.number().int().nonnegative(),
  skippedUnstableCount: z.number().int().nonnegative(),
  skippedUnknownRiskCount: z.number().int().nonnegative(),
  candidateLimitReached: z.boolean(),
  clickLimitReached: z.boolean(),
  mutationLimitReached: z.boolean(),
  issueLimitReached: z.boolean(),
  notices: z.array(z.string()),
});

const diagnosticResultSchema = z
  .strictObject({
    status: diagnosticStatusSchema,
    capabilities: diagnosticCapabilityStatusesSchema,
    issues: z.array(diagnosticIssueSchema).max(500),
    severitySummary: z.strictObject({
      total: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      medium: z.number().int().nonnegative(),
      low: z.number().int().nonnegative(),
      info: z.number().int().nonnegative(),
    }),
    typeSummary: z.strictObject({
      consoleErrors: z.number().int().nonnegative(),
      pageErrors: z.number().int().nonnegative(),
      failedRequests: z.number().int().nonnegative(),
      httpErrors: z.number().int().nonnegative(),
      brokenImages: z.number().int().nonnegative(),
      mobileLayoutIssues: z.number().int().nonnegative(),
      accessibilityViolations: z.number().int().nonnegative(),
      deadClicks: z.number().int().nonnegative(),
      obstructedControls: z.number().int().nonnegative(),
      formStateIssues: z.number().int().nonnegative(),
    }),
    capturedEventCount: z.number().int().nonnegative(),
    groupedIssueCount: z.number().int().nonnegative(),
    ignoredEventCount: z.number().int().nonnegative(),
    droppedEventCount: z.number().int().nonnegative(),
    limits: z.strictObject({
      rawEventLimitReached: z.boolean(),
      issueLimitReached: z.boolean(),
      messageTruncationOccurred: z.boolean(),
      stackTruncationOccurred: z.boolean(),
    }),
    notices: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    if (value.severitySummary.total !== value.issues.length) {
      ctx.addIssue({
        code: "custom",
        message: "severitySummary.total must equal issues.length.",
        path: ["severitySummary", "total"],
      });
    }
    if (value.groupedIssueCount !== value.issues.length) {
      ctx.addIssue({
        code: "custom",
        message: "groupedIssueCount must equal issues.length.",
        path: ["groupedIssueCount"],
      });
    }
    if (value.status === "NOT_REQUESTED" && value.issues.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "NOT_REQUESTED diagnostics must not include issues.",
        path: ["issues"],
      });
    }
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
  mobileScreenshot: basicScreenshotResultSchema,
  brokenImageAnalysis: brokenImageAnalysisSchema,
  mobileLayoutAnalysis: mobileLayoutAnalysisSchema,
  accessibilityAnalysis: accessibilityAnalysisSchema,
  safeInteractionAnalysis: safeInteractionAnalysisSchema,
  executedCapabilities: z.array(z.string()),
  deferredChecks: z.array(deferredCheckSchema),
  security: scanSecuritySummarySchema,
  diagnostics: diagnosticResultSchema,
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
