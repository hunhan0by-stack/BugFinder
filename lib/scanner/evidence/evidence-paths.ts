import "server-only";

import path from "node:path";
import {
  assertInsideScanResults,
  getScanDirectory,
} from "@/lib/scanner/scan-storage";

const EVIDENCE_ID_PATTERN = /^ev_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/i;

export function createEvidenceId(): string {
  return `ev_${crypto.randomUUID().toLowerCase().replace(/-/g, "_")}`;
}

export function isSafeEvidenceId(evidenceId: string): boolean {
  return (
    evidenceId.length <= 64 &&
    EVIDENCE_ID_PATTERN.test(evidenceId) &&
    !evidenceId.includes("..") &&
    !evidenceId.includes("/") &&
    !evidenceId.includes("\\") &&
    !evidenceId.includes("\0")
  );
}

export function getEvidenceDirectory(
  scanId: string,
  projectRoot: string = process.cwd(),
): string {
  return assertInsideScanResults(
    path.join(getScanDirectory(scanId, projectRoot), "evidence"),
    projectRoot,
  );
}

export function getEvidenceAbsolutePath(
  scanId: string,
  evidenceId: string,
  projectRoot: string = process.cwd(),
): string {
  if (!isSafeEvidenceId(evidenceId)) {
    throw new Error("Unsafe evidence identifier rejected.");
  }
  const absolute = path.join(
    getEvidenceDirectory(scanId, projectRoot),
    `${evidenceId}.png`,
  );
  const resolved = assertInsideScanResults(absolute, projectRoot);
  const evidenceDir = getEvidenceDirectory(scanId, projectRoot);
  const relative = path.relative(evidenceDir, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes("..") ||
    relative.includes("/") ||
    relative.includes("\\")
  ) {
    throw new Error("Evidence path escaped the evidence directory.");
  }
  return resolved;
}

export function getEvidenceRelativePath(
  scanId: string,
  evidenceId: string,
): string {
  if (!isSafeEvidenceId(evidenceId)) {
    throw new Error("Unsafe evidence identifier rejected.");
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(scanId)) {
    throw new Error("Evidence relative path requires a UUID scan id.");
  }
  return `scan-results/${scanId}/evidence/${evidenceId}.png`;
}

export function getEvidencePublicUrl(
  scanId: string,
  evidenceId: string,
): string {
  return `/${getEvidenceRelativePath(scanId, evidenceId)}`;
}

export function assertSafeEvidenceRelativePath(
  relativePath: string,
  scanId: string,
): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(scanId)) {
    throw new Error("Invalid scan id for evidence path.");
  }
  const expectedPrefix = `scan-results/${scanId}/evidence/`;
  if (
    !relativePath.startsWith(expectedPrefix) ||
    !relativePath.endsWith(".png") ||
    relativePath.includes("..") ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    relativePath.includes("%2e") ||
    relativePath.includes("%2E") ||
    /^[a-zA-Z]:/.test(relativePath) ||
    relativePath.startsWith("//") ||
    relativePath.startsWith("\\\\")
  ) {
    throw new Error("Unsafe evidence relative path rejected.");
  }
  const fileName = relativePath.slice(expectedPrefix.length);
  if (!fileName.endsWith(".png") || fileName.includes("/")) {
    throw new Error("Unsafe evidence filename rejected.");
  }
  const evidenceId = fileName.slice(0, -4);
  if (!isSafeEvidenceId(evidenceId)) {
    throw new Error("Unsafe evidence filename rejected.");
  }
  return relativePath;
}
