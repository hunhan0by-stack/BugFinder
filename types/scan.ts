export type ScanMode = "BASIC_SCAN";

export type ScanOptionKey =
  | "consoleErrors"
  | "networkErrors"
  | "brokenImages"
  | "mobileLayout"
  | "accessibility"
  | "screenshots"
  | "safeInteractions"
  | "issueEvidence"
  | "reversibleWorkflows";

export type ScanOptions = {
  consoleErrors: boolean;
  networkErrors: boolean;
  brokenImages: boolean;
  mobileLayout: boolean;
  accessibility: boolean;
  screenshots: boolean;
  safeInteractions: boolean;
  issueEvidence: boolean;
  reversibleWorkflows: boolean;
};

export type ScanRequestInput = {
  url: string;
  options: ScanOptions;
};

/** Reserved for capabilities that are not part of this release. Phase 9 returns []. */
export type DeferredCheck =
  | "authenticatedSession"
  | "visualBaselineRegression"
  | "scheduledScanning";

export type ScanProfile = "DESKTOP" | "MOBILE";

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

export type Severity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type DiagnosticIssueType =
  | "CONSOLE_ERROR"
  | "PAGE_ERROR"
  | "REQUEST_FAILED"
  | "HTTP_ERROR"
  | "BROKEN_IMAGE"
  | "DEAD_CLICK"
  | "STATE_TRANSITION_ISSUE"
  | "OBSTRUCTED_CONTROL"
  | "FORM_STATE_ISSUE"
  | "MOBILE_OVERFLOW"
  | "MOBILE_VIEWPORT"
  | "ACCESSIBILITY_VIOLATION";

export type DiagnosticScope =
  | "MAIN_DOCUMENT"
  | "SAME_ORIGIN"
  | "THIRD_PARTY"
  | "BROWSER"
  | "UNKNOWN";

export type DiagnosticStatus = "NOT_REQUESTED" | "COMPLETE" | "PARTIAL";

export type DiagnosticSourceLocation = {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type DiagnosticIssue = {
  id: string;
  type: DiagnosticIssueType;
  severity: Severity;
  confidence: number;
  title: string;
  description: string;
  observedBehavior: string;
  potentialUserImpact: string;
  technicalEvidence: string;
  suggestedInvestigation: string;
  scope: DiagnosticScope;
  profile: ScanProfile;
  pageUrl: string;
  resourceUrl?: string;
  sourceLocation?: DiagnosticSourceLocation;
  occurrenceCount: number;
  firstSeenMs: number;
  lastSeenMs: number;
  metadata: Record<string, string | number | boolean | null>;
  evidenceIds?: string[];
};

export type DiagnosticSeveritySummary = {
  total: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type DiagnosticTypeSummary = {
  consoleErrors: number;
  pageErrors: number;
  failedRequests: number;
  httpErrors: number;
  brokenImages: number;
  mobileLayoutIssues: number;
  accessibilityViolations: number;
  deadClicks: number;
  obstructedControls: number;
  formStateIssues: number;
  stateTransitionIssues: number;
};

export type DiagnosticLimitSummary = {
  rawEventLimitReached: boolean;
  issueLimitReached: boolean;
  messageTruncationOccurred: boolean;
  stackTruncationOccurred: boolean;
};

export type DiagnosticCapabilityStatuses = {
  console: DiagnosticStatus;
  network: DiagnosticStatus;
  brokenImages: DiagnosticStatus;
  mobileLayout: DiagnosticStatus;
  accessibility: DiagnosticStatus;
  safeInteractions: DiagnosticStatus;
  issueEvidence: DiagnosticStatus;
  reversibleWorkflows: DiagnosticStatus;
};

export type BrokenImageAnalysis = {
  status: DiagnosticStatus;
  inspectedImageCount: number;
  visibleImageCount: number;
  skippedImageCount: number;
  skippedLazyImageCount: number;
  networkOutcomeCount: number;
  issueCount: number;
  elementLimitReached: boolean;
  outcomeLimitReached: boolean;
  notices: string[];
};

export type MobileViewport = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: true;
  hasTouch: true;
};

export type MobileLayoutAnalysis = {
  status: DiagnosticStatus;
  requested: boolean;
  finalUrl?: string;
  viewport: MobileViewport;
  viewportMetaPresent: boolean | null;
  viewportMetaContent?: string;
  documentWidth?: number;
  documentHeight?: number;
  horizontalOverflowPx?: number;
  analyzedElementCount: number;
  overflowingElementCount: number;
  elementLimitReached: boolean;
  issueCount: number;
  notices: string[];
};

export type AccessibilityAnalysis = {
  status: DiagnosticStatus;
  engine: "axe-core";
  engineVersion?: string;
  standards: string[];
  violationRuleCount: number;
  affectedNodeCount: number;
  reportedIssueCount: number;
  issueLimitReached: boolean;
  nodeEvidenceLimitReached: boolean;
  notices: string[];
};

export type SafeInteractionAnalysis = {
  status: DiagnosticStatus;
  requested: boolean;
  discoveredCandidateCount: number;
  eligibleCandidateCount: number;
  trialCheckedCount: number;
  actualClickCount: number;
  responsiveControlCount: number;
  deadClickIssueCount: number;
  obstructionIssueCount: number;
  formStateIssueCount: number;
  skippedUnsafeCount: number;
  skippedNavigationCount: number;
  skippedFormSubmissionCount: number;
  skippedDestructiveCount: number;
  skippedNetworkCount: number;
  skippedPopupCount: number;
  skippedDownloadCount: number;
  skippedOffscreenCount: number;
  skippedDisabledCount: number;
  skippedUnstableCount: number;
  skippedUnknownRiskCount: number;
  candidateLimitReached: boolean;
  clickLimitReached: boolean;
  mutationLimitReached: boolean;
  issueLimitReached: boolean;
  notices: string[];
};

export type EvidenceKind =
  | "ELEMENT_SCREENSHOT"
  | "CONTEXT_SCREENSHOT"
  | "BEFORE_INTERACTION"
  | "AFTER_INTERACTION"
  | "AFTER_REVERSAL";

export type EvidenceStateLabel =
  | "BASELINE"
  | "AFTER_FIRST_CLICK"
  | "AFTER_REVERSAL";

export type EvidenceClip = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagnosticEvidenceArtifact = {
  id: string;
  kind: EvidenceKind;
  profile: ScanProfile;
  issueId?: string;
  relativePath: string;
  publicUrl: string;
  width: number;
  height: number;
  byteSize: number;
  capturedAtMs: number;
  selector?: string;
  clip?: EvidenceClip;
  stateLabel?: EvidenceStateLabel;
  truncated: boolean;
};

export type IssueEvidenceAnalysis = {
  status: DiagnosticStatus;
  requested: boolean;
  artifactCount: number;
  totalBytes: number;
  artifactLimitReached: boolean;
  byteLimitReached: boolean;
  artifacts: DiagnosticEvidenceArtifact[];
  notices: string[];
};

export type ReversibleWorkflowAnalysis = {
  status: DiagnosticStatus;
  requested: boolean;
  discoveredReversibleCandidateCount: number;
  eligibleWorkflowCount: number;
  attemptedWorkflowCount: number;
  completedWorkflowCount: number;
  successfulReversalCount: number;
  stateTransitionIssueCount: number;
  skippedUnsafeCount: number;
  skippedNetworkCount: number;
  skippedNavigationCount: number;
  skippedObstructionCount: number;
  skippedUnstableCount: number;
  skippedBusyCount: number;
  workflowLimitReached: boolean;
  mutationLimitReached: boolean;
  issueLimitReached: boolean;
  notices: string[];
};

export type DiagnosticResult = {
  status: DiagnosticStatus;
  capabilities: DiagnosticCapabilityStatuses;
  issues: DiagnosticIssue[];
  severitySummary: DiagnosticSeveritySummary;
  typeSummary: DiagnosticTypeSummary;
  capturedEventCount: number;
  groupedIssueCount: number;
  ignoredEventCount: number;
  droppedEventCount: number;
  limits: DiagnosticLimitSummary;
  notices: string[];
};

/**
 * Successful Phase 8 result. Single-page desktop/mobile scan with selected
 * diagnostics, optional safe interactions, issue evidence, and reversible
 * workflows — not a full QA assessment.
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
  mobileScreenshot: BasicScreenshotResult;
  brokenImageAnalysis: BrokenImageAnalysis;
  mobileLayoutAnalysis: MobileLayoutAnalysis;
  accessibilityAnalysis: AccessibilityAnalysis;
  safeInteractionAnalysis: SafeInteractionAnalysis;
  issueEvidenceAnalysis: IssueEvidenceAnalysis;
  reversibleWorkflowAnalysis: ReversibleWorkflowAnalysis;
  executedCapabilities: string[];
  deferredChecks: DeferredCheck[];
  security: ScanSecuritySummary;
  diagnostics: DiagnosticResult;
  notices: string[];
};

/** Alias used by the client and API for the live success payload. */
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
  | "RATE_LIMITED"
  | "METHOD_NOT_ALLOWED"
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
