import "server-only";

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Invalid scanner configuration: ${name} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(
    "Invalid scanner configuration: ALLOW_LOCAL_FIXTURE must be true or false.",
  );
}

function parsePortList(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === "") {
    return [80, 443];
  }
  const ports = raw.split(",").map((part) => Number(part.trim()));
  if (
    ports.length === 0 ||
    ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error(
      "Invalid scanner configuration: SCAN_ALLOWED_PORTS must be a comma-separated list of ports.",
    );
  }
  return ports;
}

export type ScannerConfig = {
  pageTimeoutMs: number;
  totalTimeoutMs: number;
  screenshotTimeoutMs: number;
  maxRedirects: number;
  maxRequests: number;
  maxUniqueHosts: number;
  maxBlockedRequestRecords: number;
  maxConcurrentScans: number;
  allowedPorts: number[];
  maxFullPageHeight: number;
  dnsTimeoutMs: number;
  stabilizationMs: number;
  diagnosticSettleMs: number;
  maxDiagnosticEvents: number;
  maxDiagnosticIssues: number;
  maxConsoleMessageLength: number;
  maxPageErrorMessageLength: number;
  maxStackLength: number;
  maxEvidenceLength: number;
  maxDiagnosticUrlLength: number;
  brokenImageTimeoutMs: number;
  maxImageElements: number;
  maxImageNetworkOutcomes: number;
  maxBrokenImageIssues: number;
  maxImageSelectorSamples: number;
  mobileViewportWidth: number;
  mobileViewportHeight: number;
  mobileDeviceScaleFactor: number;
  mobileAnalysisTimeoutMs: number;
  maxLayoutElements: number;
  maxMobileLayoutIssues: number;
  layoutOverflowTolerancePx: number;
  maxLayoutSelectorLength: number;
  accessibilityTimeoutMs: number;
  maxAccessibilityIssues: number;
  maxAxeNodesPerRule: number;
  maxAxeTargetLength: number;
  maxAxeFailureSummaryLength: number;
  interactionDiscoveryTimeoutMs: number;
  interactionContextTimeoutMs: number;
  interactionSettleMs: number;
  interactionPreclickQuietMs: number;
  maxInteractionCandidates: number;
  maxSafeClicks: number;
  maxInteractionIssues: number;
  maxInteractionSelectorLength: number;
  maxInteractionMutations: number;
  maxInteractionControlledTargets: number;
  interactionObstructionTolerancePx: number;
  interactionMinVisibleAreaPx: number;
  maxEvidenceArtifacts: number;
  maxEvidenceBytes: number;
  maxEvidencePerIssue: number;
  evidenceContextPaddingPx: number;
  evidenceMinWidthPx: number;
  evidenceMinHeightPx: number;
  evidenceMaxWidthPx: number;
  evidenceMaxHeightPx: number;
  evidenceScreenshotTimeoutMs: number;
  maxReversibleWorkflows: number;
  workflowSettleMs: number;
  workflowContextTimeoutMs: number;
  workflowStateCompareTolerancePx: number;
  maxWorkflowMutations: number;
  maxWorkflowIssues: number;
  maxTotalActualClicks: number;
  allowLocalFixture: boolean;
  localFixtureHost: string;
  localFixturePort: number;
  maxRequestBodyBytes: number;
};

let cachedConfig: ScannerConfig | null = null;

/**
 * Reads scanner environment once per process. Never import this module from
 * client components — it is server-only.
 */
export function getScannerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ScannerConfig {
  if (cachedConfig && env === process.env) {
    return cachedConfig;
  }

  const localFixtureHost = (env.LOCAL_FIXTURE_HOST ?? "127.0.0.1").trim();
  if (localFixtureHost === "") {
    throw new Error(
      "Invalid scanner configuration: LOCAL_FIXTURE_HOST must not be empty.",
    );
  }

  const config: ScannerConfig = {
    pageTimeoutMs: parsePositiveInt(
      env.SCAN_PAGE_TIMEOUT_MS,
      30_000,
      "SCAN_PAGE_TIMEOUT_MS",
      1_000,
      300_000,
    ),
    totalTimeoutMs: parsePositiveInt(
      env.SCAN_TOTAL_TIMEOUT_MS,
      90_000,
      "SCAN_TOTAL_TIMEOUT_MS",
      5_000,
      600_000,
    ),
    screenshotTimeoutMs: parsePositiveInt(
      env.SCAN_SCREENSHOT_TIMEOUT_MS,
      15_000,
      "SCAN_SCREENSHOT_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    maxRedirects: parsePositiveInt(
      env.SCAN_MAX_REDIRECTS,
      5,
      "SCAN_MAX_REDIRECTS",
      0,
      20,
    ),
    maxRequests: parsePositiveInt(
      env.SCAN_MAX_REQUESTS,
      800,
      "SCAN_MAX_REQUESTS",
      10,
      5_000,
    ),
    maxUniqueHosts: parsePositiveInt(
      env.SCAN_MAX_UNIQUE_HOSTS,
      40,
      "SCAN_MAX_UNIQUE_HOSTS",
      1,
      500,
    ),
    maxBlockedRequestRecords: parsePositiveInt(
      env.SCAN_MAX_BLOCKED_REQUEST_RECORDS,
      20,
      "SCAN_MAX_BLOCKED_REQUEST_RECORDS",
      0,
      200,
    ),
    maxConcurrentScans: parsePositiveInt(
      env.SCAN_MAX_CONCURRENT_SCANS,
      1,
      "SCAN_MAX_CONCURRENT_SCANS",
      1,
      10,
    ),
    allowedPorts: parsePortList(env.SCAN_ALLOWED_PORTS),
    maxFullPageHeight: parsePositiveInt(
      env.SCAN_MAX_FULL_PAGE_HEIGHT,
      20_000,
      "SCAN_MAX_FULL_PAGE_HEIGHT",
      1_000,
      100_000,
    ),
    dnsTimeoutMs: parsePositiveInt(
      env.SCAN_DNS_TIMEOUT_MS,
      5_000,
      "SCAN_DNS_TIMEOUT_MS",
      500,
      30_000,
    ),
    stabilizationMs: parsePositiveInt(
      env.SCAN_STABILIZATION_MS,
      800,
      "SCAN_STABILIZATION_MS",
      0,
      5_000,
    ),
    diagnosticSettleMs: parsePositiveInt(
      env.SCAN_DIAGNOSTIC_SETTLE_MS,
      1_000,
      "SCAN_DIAGNOSTIC_SETTLE_MS",
      0,
      5_000,
    ),
    maxDiagnosticEvents: parsePositiveInt(
      env.SCAN_MAX_DIAGNOSTIC_EVENTS,
      500,
      "SCAN_MAX_DIAGNOSTIC_EVENTS",
      1,
      5_000,
    ),
    maxDiagnosticIssues: parsePositiveInt(
      env.SCAN_MAX_DIAGNOSTIC_ISSUES,
      100,
      "SCAN_MAX_DIAGNOSTIC_ISSUES",
      1,
      500,
    ),
    maxConsoleMessageLength: parsePositiveInt(
      env.SCAN_MAX_CONSOLE_MESSAGE_LENGTH,
      2_000,
      "SCAN_MAX_CONSOLE_MESSAGE_LENGTH",
      100,
      10_000,
    ),
    maxPageErrorMessageLength: parsePositiveInt(
      env.SCAN_MAX_PAGE_ERROR_MESSAGE_LENGTH,
      2_000,
      "SCAN_MAX_PAGE_ERROR_MESSAGE_LENGTH",
      100,
      10_000,
    ),
    maxStackLength: parsePositiveInt(
      env.SCAN_MAX_STACK_LENGTH,
      8_000,
      "SCAN_MAX_STACK_LENGTH",
      200,
      30_000,
    ),
    maxEvidenceLength: parsePositiveInt(
      env.SCAN_MAX_EVIDENCE_LENGTH,
      4_000,
      "SCAN_MAX_EVIDENCE_LENGTH",
      200,
      10_000,
    ),
    maxDiagnosticUrlLength: parsePositiveInt(
      env.SCAN_MAX_DIAGNOSTIC_URL_LENGTH,
      1_000,
      "SCAN_MAX_DIAGNOSTIC_URL_LENGTH",
      64,
      4_000,
    ),
    brokenImageTimeoutMs: parsePositiveInt(
      env.SCAN_BROKEN_IMAGE_TIMEOUT_MS,
      5_000,
      "SCAN_BROKEN_IMAGE_TIMEOUT_MS",
      500,
      60_000,
    ),
    maxImageElements: parsePositiveInt(
      env.SCAN_MAX_IMAGE_ELEMENTS,
      2_000,
      "SCAN_MAX_IMAGE_ELEMENTS",
      1,
      10_000,
    ),
    maxImageNetworkOutcomes: parsePositiveInt(
      env.SCAN_MAX_IMAGE_NETWORK_OUTCOMES,
      2_000,
      "SCAN_MAX_IMAGE_NETWORK_OUTCOMES",
      1,
      10_000,
    ),
    maxBrokenImageIssues: parsePositiveInt(
      env.SCAN_MAX_BROKEN_IMAGE_ISSUES,
      100,
      "SCAN_MAX_BROKEN_IMAGE_ISSUES",
      1,
      500,
    ),
    maxImageSelectorSamples: parsePositiveInt(
      env.SCAN_MAX_IMAGE_SELECTOR_SAMPLES,
      3,
      "SCAN_MAX_IMAGE_SELECTOR_SAMPLES",
      1,
      20,
    ),
    mobileViewportWidth: parsePositiveInt(
      env.SCAN_MOBILE_VIEWPORT_WIDTH,
      390,
      "SCAN_MOBILE_VIEWPORT_WIDTH",
      320,
      2_048,
    ),
    mobileViewportHeight: parsePositiveInt(
      env.SCAN_MOBILE_VIEWPORT_HEIGHT,
      844,
      "SCAN_MOBILE_VIEWPORT_HEIGHT",
      480,
      4_096,
    ),
    mobileDeviceScaleFactor: parsePositiveInt(
      env.SCAN_MOBILE_DEVICE_SCALE_FACTOR,
      1,
      "SCAN_MOBILE_DEVICE_SCALE_FACTOR",
      1,
      3,
    ),
    mobileAnalysisTimeoutMs: parsePositiveInt(
      env.SCAN_MOBILE_ANALYSIS_TIMEOUT_MS,
      10_000,
      "SCAN_MOBILE_ANALYSIS_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    maxLayoutElements: parsePositiveInt(
      env.SCAN_MAX_LAYOUT_ELEMENTS,
      5_000,
      "SCAN_MAX_LAYOUT_ELEMENTS",
      1,
      20_000,
    ),
    maxMobileLayoutIssues: parsePositiveInt(
      env.SCAN_MAX_MOBILE_LAYOUT_ISSUES,
      50,
      "SCAN_MAX_MOBILE_LAYOUT_ISSUES",
      1,
      500,
    ),
    layoutOverflowTolerancePx: parsePositiveInt(
      env.SCAN_LAYOUT_OVERFLOW_TOLERANCE_PX,
      3,
      "SCAN_LAYOUT_OVERFLOW_TOLERANCE_PX",
      0,
      50,
    ),
    maxLayoutSelectorLength: parsePositiveInt(
      env.SCAN_MAX_LAYOUT_SELECTOR_LENGTH,
      500,
      "SCAN_MAX_LAYOUT_SELECTOR_LENGTH",
      50,
      2_000,
    ),
    accessibilityTimeoutMs: parsePositiveInt(
      env.SCAN_ACCESSIBILITY_TIMEOUT_MS,
      15_000,
      "SCAN_ACCESSIBILITY_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    maxAccessibilityIssues: parsePositiveInt(
      env.SCAN_MAX_ACCESSIBILITY_ISSUES,
      100,
      "SCAN_MAX_ACCESSIBILITY_ISSUES",
      1,
      500,
    ),
    maxAxeNodesPerRule: parsePositiveInt(
      env.SCAN_MAX_AXE_NODES_PER_RULE,
      5,
      "SCAN_MAX_AXE_NODES_PER_RULE",
      1,
      20,
    ),
    maxAxeTargetLength: parsePositiveInt(
      env.SCAN_MAX_AXE_TARGET_LENGTH,
      500,
      "SCAN_MAX_AXE_TARGET_LENGTH",
      50,
      2_000,
    ),
    maxAxeFailureSummaryLength: parsePositiveInt(
      env.SCAN_MAX_AXE_FAILURE_SUMMARY_LENGTH,
      2_000,
      "SCAN_MAX_AXE_FAILURE_SUMMARY_LENGTH",
      100,
      10_000,
    ),
    interactionDiscoveryTimeoutMs: parsePositiveInt(
      env.SCAN_INTERACTION_DISCOVERY_TIMEOUT_MS,
      5_000,
      "SCAN_INTERACTION_DISCOVERY_TIMEOUT_MS",
      500,
      60_000,
    ),
    interactionContextTimeoutMs: parsePositiveInt(
      env.SCAN_INTERACTION_CONTEXT_TIMEOUT_MS,
      12_000,
      "SCAN_INTERACTION_CONTEXT_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    interactionSettleMs: parsePositiveInt(
      env.SCAN_INTERACTION_SETTLE_MS,
      1_000,
      "SCAN_INTERACTION_SETTLE_MS",
      100,
      5_000,
    ),
    interactionPreclickQuietMs: parsePositiveInt(
      env.SCAN_INTERACTION_PRECLICK_QUIET_MS,
      250,
      "SCAN_INTERACTION_PRECLICK_QUIET_MS",
      0,
      2_000,
    ),
    maxInteractionCandidates: parsePositiveInt(
      env.SCAN_MAX_INTERACTION_CANDIDATES,
      100,
      "SCAN_MAX_INTERACTION_CANDIDATES",
      1,
      1_000,
    ),
    maxSafeClicks: parsePositiveInt(
      env.SCAN_MAX_SAFE_CLICKS,
      5,
      "SCAN_MAX_SAFE_CLICKS",
      1,
      20,
    ),
    maxInteractionIssues: parsePositiveInt(
      env.SCAN_MAX_INTERACTION_ISSUES,
      50,
      "SCAN_MAX_INTERACTION_ISSUES",
      1,
      200,
    ),
    maxInteractionSelectorLength: parsePositiveInt(
      env.SCAN_MAX_INTERACTION_SELECTOR_LENGTH,
      500,
      "SCAN_MAX_INTERACTION_SELECTOR_LENGTH",
      50,
      2_000,
    ),
    maxInteractionMutations: parsePositiveInt(
      env.SCAN_MAX_INTERACTION_MUTATIONS,
      1_000,
      "SCAN_MAX_INTERACTION_MUTATIONS",
      10,
      10_000,
    ),
    maxInteractionControlledTargets: parsePositiveInt(
      env.SCAN_MAX_INTERACTION_CONTROLLED_TARGETS,
      20,
      "SCAN_MAX_INTERACTION_CONTROLLED_TARGETS",
      1,
      100,
    ),
    interactionObstructionTolerancePx: parsePositiveInt(
      env.SCAN_INTERACTION_OBSTRUCTION_TOLERANCE_PX,
      2,
      "SCAN_INTERACTION_OBSTRUCTION_TOLERANCE_PX",
      0,
      20,
    ),
    interactionMinVisibleAreaPx: parsePositiveInt(
      env.SCAN_INTERACTION_MIN_VISIBLE_AREA_PX,
      16,
      "SCAN_INTERACTION_MIN_VISIBLE_AREA_PX",
      1,
      10_000,
    ),
    maxEvidenceArtifacts: parsePositiveInt(
      env.SCAN_MAX_EVIDENCE_ARTIFACTS,
      12,
      "SCAN_MAX_EVIDENCE_ARTIFACTS",
      1,
      50,
    ),
    maxEvidenceBytes: parsePositiveInt(
      env.SCAN_MAX_EVIDENCE_BYTES,
      8_000_000,
      "SCAN_MAX_EVIDENCE_BYTES",
      100_000,
      25_000_000,
    ),
    maxEvidencePerIssue: parsePositiveInt(
      env.SCAN_MAX_EVIDENCE_PER_ISSUE,
      3,
      "SCAN_MAX_EVIDENCE_PER_ISSUE",
      1,
      5,
    ),
    evidenceContextPaddingPx: parsePositiveInt(
      env.SCAN_EVIDENCE_CONTEXT_PADDING_PX,
      48,
      "SCAN_EVIDENCE_CONTEXT_PADDING_PX",
      0,
      200,
    ),
    evidenceMinWidthPx: parsePositiveInt(
      env.SCAN_EVIDENCE_MIN_WIDTH_PX,
      64,
      "SCAN_EVIDENCE_MIN_WIDTH_PX",
      16,
      500,
    ),
    evidenceMinHeightPx: parsePositiveInt(
      env.SCAN_EVIDENCE_MIN_HEIGHT_PX,
      48,
      "SCAN_EVIDENCE_MIN_HEIGHT_PX",
      16,
      500,
    ),
    evidenceMaxWidthPx: parsePositiveInt(
      env.SCAN_EVIDENCE_MAX_WIDTH_PX,
      1_000,
      "SCAN_EVIDENCE_MAX_WIDTH_PX",
      100,
      2_000,
    ),
    evidenceMaxHeightPx: parsePositiveInt(
      env.SCAN_EVIDENCE_MAX_HEIGHT_PX,
      800,
      "SCAN_EVIDENCE_MAX_HEIGHT_PX",
      100,
      2_000,
    ),
    evidenceScreenshotTimeoutMs: parsePositiveInt(
      env.SCAN_EVIDENCE_SCREENSHOT_TIMEOUT_MS,
      4_000,
      "SCAN_EVIDENCE_SCREENSHOT_TIMEOUT_MS",
      500,
      30_000,
    ),
    maxReversibleWorkflows: parsePositiveInt(
      env.SCAN_MAX_REVERSIBLE_WORKFLOWS,
      3,
      "SCAN_MAX_REVERSIBLE_WORKFLOWS",
      1,
      10,
    ),
    workflowSettleMs: parsePositiveInt(
      env.SCAN_WORKFLOW_SETTLE_MS,
      1_000,
      "SCAN_WORKFLOW_SETTLE_MS",
      100,
      5_000,
    ),
    workflowContextTimeoutMs: parsePositiveInt(
      env.SCAN_WORKFLOW_CONTEXT_TIMEOUT_MS,
      15_000,
      "SCAN_WORKFLOW_CONTEXT_TIMEOUT_MS",
      2_000,
      60_000,
    ),
    workflowStateCompareTolerancePx: parsePositiveInt(
      env.SCAN_WORKFLOW_STATE_COMPARE_TOLERANCE_PX,
      2,
      "SCAN_WORKFLOW_STATE_COMPARE_TOLERANCE_PX",
      0,
      20,
    ),
    maxWorkflowMutations: parsePositiveInt(
      env.SCAN_MAX_WORKFLOW_MUTATIONS,
      1_500,
      "SCAN_MAX_WORKFLOW_MUTATIONS",
      10,
      10_000,
    ),
    maxWorkflowIssues: parsePositiveInt(
      env.SCAN_MAX_WORKFLOW_ISSUES,
      30,
      "SCAN_MAX_WORKFLOW_ISSUES",
      1,
      100,
    ),
    maxTotalActualClicks: parsePositiveInt(
      env.SCAN_MAX_TOTAL_ACTUAL_CLICKS,
      12,
      "SCAN_MAX_TOTAL_ACTUAL_CLICKS",
      1,
      30,
    ),
    allowLocalFixture: parseBoolean(env.ALLOW_LOCAL_FIXTURE, false),
    localFixtureHost,
    localFixturePort: parsePositiveInt(
      env.LOCAL_FIXTURE_PORT,
      3100,
      "LOCAL_FIXTURE_PORT",
      1,
      65535,
    ),
    maxRequestBodyBytes: parsePositiveInt(
      env.SCAN_MAX_REQUEST_BODY_BYTES,
      16_384,
      "SCAN_MAX_REQUEST_BODY_BYTES",
      1_024,
      1_048_576,
    ),
  };

  if (config.totalTimeoutMs < config.pageTimeoutMs) {
    throw new Error(
      "Invalid scanner configuration: SCAN_TOTAL_TIMEOUT_MS must be greater than or equal to SCAN_PAGE_TIMEOUT_MS.",
    );
  }

  assertProductionFixtureDisabled(env, config.allowLocalFixture);

  if (env === process.env) {
    cachedConfig = config;
  }

  return config;
}

/**
 * Production processes must refuse to start (or to load scanner config) when
 * the local-fixture bypass is enabled.
 */
export function assertProductionFixtureDisabled(
  env: NodeJS.ProcessEnv = process.env,
  allowLocalFixture?: boolean,
): void {
  const enabled =
    allowLocalFixture ?? parseBoolean(env.ALLOW_LOCAL_FIXTURE, false);
  if (env.NODE_ENV === "production" && enabled) {
    throw new Error(
      "ALLOW_LOCAL_FIXTURE cannot be enabled when NODE_ENV=production.",
    );
  }
}

export function resetScannerConfigCache(): void {
  cachedConfig = null;
}

/**
 * Local fixture access is never available in production, even if the
 * environment flag is mistakenly set to true.
 */
export function isLocalFixtureAllowed(config: ScannerConfig): boolean {
  return config.allowLocalFixture && process.env.NODE_ENV !== "production";
}
