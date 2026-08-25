import "server-only";

import { redactUrl } from "@/lib/utils/redact-url";

export type ScanLogLevel = "info" | "warn" | "error";

export type ScanLogEventName =
  | "scan.request_received"
  | "scan.validation_rejected"
  | "scan.started"
  | "scan.completed"
  | "scan.partial"
  | "scan.failed"
  | "scan.rate_limited"
  | "scan.timeout"
  | "scan.security_block"
  | "scan.cleanup_completed";

export type ScanLogRecord = {
  level: ScanLogLevel;
  event: ScanLogEventName;
  scanId?: string;
  durationMs?: number;
  outcome?: string;
  reasonCode?: string;
  target?: string;
  counts?: Record<string, number>;
};

export type ScanLogSink = (line: string) => void;

const SECRET_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /password/i,
  /set-cookie/i,
  /bearer\s+[a-z0-9._-]+/i,
];

let sink: ScanLogSink = defaultSink;

function defaultSink(line: string): void {
  const record = JSON.parse(line) as ScanLogRecord;
  if (record.level === "error") {
    console.error(line);
    return;
  }
  if (record.level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

function sanitizeCounts(
  counts: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!counts) return undefined;
  const sanitized: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function logScanEvent(record: ScanLogRecord): void {
  const payload: ScanLogRecord = {
    level: record.level,
    event: record.event,
  };
  if (record.scanId) {
    payload.scanId = record.scanId.slice(0, 36);
  }
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) {
    payload.durationMs = Math.max(0, Math.round(record.durationMs));
  }
  if (record.outcome) {
    payload.outcome = record.outcome.slice(0, 64);
  }
  if (record.reasonCode && !looksLikeSecret(record.reasonCode)) {
    payload.reasonCode = record.reasonCode.slice(0, 64);
  }
  if (record.target) {
    payload.target = redactUrl(record.target);
  }
  const counts = sanitizeCounts(record.counts);
  if (counts) {
    payload.counts = counts;
  }

  sink(JSON.stringify(payload));
}

export function setScanLogSink(nextSink: ScanLogSink): void {
  sink = nextSink;
}

export function resetScanLogSink(): void {
  sink = defaultSink;
}
