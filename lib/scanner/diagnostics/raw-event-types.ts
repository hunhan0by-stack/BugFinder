export type RawConsoleDiagnosticEvent = {
  kind: "CONSOLE";
  consoleType: string;
  message: string;
  sourceUrl?: string;
  /** One-based line number when available. */
  lineNumber?: number;
  /** One-based column number when available. */
  columnNumber?: number;
  timestampMs: number;
  messageTruncated: boolean;
};

export type RawPageErrorDiagnosticEvent = {
  kind: "PAGE_ERROR";
  name: string;
  message: string;
  stack?: string;
  topFrame?: string;
  timestampMs: number;
  messageTruncated: boolean;
  stackTruncated: boolean;
};

export type RawRequestFailureDiagnosticEvent = {
  kind: "REQUEST_FAILED";
  method: string;
  resourceType: string;
  requestUrl: string;
  failureReason: string;
  isNavigationRequest: boolean;
  isMainFrameRequest: boolean;
  timestampMs: number;
};

export type RawHttpDiagnosticEvent = {
  kind: "HTTP_ERROR";
  method: string;
  resourceType: string;
  requestUrl: string;
  statusCode: number;
  statusText: string;
  contentType?: string;
  isNavigationRequest: boolean;
  isMainFrameRequest: boolean;
  timestampMs: number;
};

export type RawDiagnosticEvent =
  | RawConsoleDiagnosticEvent
  | RawPageErrorDiagnosticEvent
  | RawRequestFailureDiagnosticEvent
  | RawHttpDiagnosticEvent;

export type DiagnosticLimits = {
  maxEvents: number;
  maxIssues: number;
  maxConsoleMessageLength: number;
  maxPageErrorMessageLength: number;
  maxStackLength: number;
  maxEvidenceLength: number;
  maxDiagnosticUrlLength: number;
};
