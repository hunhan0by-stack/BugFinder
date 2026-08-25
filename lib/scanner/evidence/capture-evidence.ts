import "server-only";

import { mkdir } from "node:fs/promises";
import type { Page } from "playwright";
import type { ScannerConfig } from "@/lib/config/scanner-config";
import { calculateEvidenceClip } from "@/lib/scanner/evidence/evidence-clip";
import {
  createEvidenceId,
  getEvidenceAbsolutePath,
  getEvidenceDirectory,
  getEvidencePublicUrl,
  getEvidenceRelativePath,
} from "@/lib/scanner/evidence/evidence-paths";
import { canStoreAdditionalBytes } from "@/lib/scanner/artifact-retention";
import { writePngBytes } from "@/lib/scanner/scan-storage";
import {
  isStorageFailureError,
  storageFailureNotice,
} from "@/lib/scanner/storage-errors";
import type {
  DiagnosticEvidenceArtifact,
  EvidenceKind,
  EvidenceStateLabel,
  IssueEvidenceAnalysis,
  ScanProfile,
} from "@/types/scan";

export function emptyIssueEvidenceAnalysis(
  status: IssueEvidenceAnalysis["status"] = "NOT_REQUESTED",
): IssueEvidenceAnalysis {
  return {
    status,
    requested: status !== "NOT_REQUESTED",
    artifactCount: 0,
    totalBytes: 0,
    artifactLimitReached: false,
    byteLimitReached: false,
    artifacts: [],
    notices:
      status === "NOT_REQUESTED"
        ? ["Issue-specific evidence was not selected for this scan."]
        : [],
  };
}

export type EvidenceBudget = {
  analysis: IssueEvidenceAnalysis;
  config: ScannerConfig;
  scanId: string;
  perIssueCounts: Map<string, number>;
};

export function createEvidenceBudget(
  scanId: string,
  config: ScannerConfig,
): EvidenceBudget {
  return {
    analysis: emptyIssueEvidenceAnalysis("COMPLETE"),
    config,
    scanId,
    perIssueCounts: new Map(),
  };
}

function canAcceptArtifact(
  budget: EvidenceBudget,
  issueId: string | undefined,
  byteSize: number,
): boolean {
  if (budget.analysis.artifactCount >= budget.config.maxEvidenceArtifacts) {
    budget.analysis.artifactLimitReached = true;
    budget.analysis.status = "PARTIAL";
    return false;
  }
  if (budget.analysis.totalBytes + byteSize > budget.config.maxEvidenceBytes) {
    budget.analysis.byteLimitReached = true;
    budget.analysis.status = "PARTIAL";
    return false;
  }
  if (issueId) {
    const count = budget.perIssueCounts.get(issueId) ?? 0;
    if (count >= budget.config.maxEvidencePerIssue) {
      return false;
    }
  }
  return true;
}

const SENSITIVE_SELECTOR =
  /input\[type=(["'])?(password|tel)\1?\]|autocomplete=(["'])?(cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year)\3?/i;

export function isSensitiveEvidenceTarget(selector: string | undefined): boolean {
  if (!selector) return false;
  return SENSITIVE_SELECTOR.test(selector);
}

export async function captureClippedEvidence(input: {
  budget: EvidenceBudget;
  page: Page;
  profile: ScanProfile;
  kind: EvidenceKind;
  issueId?: string;
  selector?: string;
  stateLabel?: EvidenceStateLabel;
  box: { x: number; y: number; width: number; height: number };
  scanRelativeMs: () => number;
  projectRoot?: string;
}): Promise<DiagnosticEvidenceArtifact | null> {
  if (isSensitiveEvidenceTarget(input.selector)) {
    input.budget.analysis.notices.push(
      "Skipped evidence capture for a sensitive form control target.",
    );
    return null;
  }

  const viewport = input.page.viewportSize();
  if (!viewport) {
    input.budget.analysis.status = "PARTIAL";
    input.budget.analysis.notices.push(
      "Evidence capture skipped because the viewport size was unavailable.",
    );
    return null;
  }

  const clip = calculateEvidenceClip(input.box, {
    paddingPx: input.budget.config.evidenceContextPaddingPx,
    minWidthPx: input.budget.config.evidenceMinWidthPx,
    minHeightPx: input.budget.config.evidenceMinHeightPx,
    maxWidthPx: input.budget.config.evidenceMaxWidthPx,
    maxHeightPx: input.budget.config.evidenceMaxHeightPx,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
  if (!clip) {
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await input.page.screenshot({
      type: "png",
      clip,
      timeout: input.budget.config.evidenceScreenshotTimeoutMs,
      animations: "disabled",
    });
  } catch {
    input.budget.analysis.status = "PARTIAL";
    input.budget.analysis.notices.push(
      "One or more evidence screenshots could not be captured within the timeout.",
    );
    return null;
  }

  if (!canAcceptArtifact(input.budget, input.issueId, buffer.byteLength)) {
    if (
      !input.budget.analysis.notices.some((notice) =>
        notice.includes("Evidence limits"),
      )
    ) {
      input.budget.analysis.notices.push(
        "Evidence limits were reached. Additional artifacts were skipped.",
      );
    }
    return null;
  }

  const projectRoot = input.projectRoot ?? process.cwd();
  if (!(await canStoreAdditionalBytes(buffer.byteLength, projectRoot))) {
    input.budget.analysis.status = "PARTIAL";
    if (
      !input.budget.analysis.notices.some((notice) =>
        notice.includes("storage budget"),
      )
    ) {
      input.budget.analysis.notices.push(
        "Local artifact storage budget was reached. Additional evidence was skipped.",
      );
    }
    return null;
  }

  const evidenceId = createEvidenceId();
  const absolutePath = getEvidenceAbsolutePath(
    input.budget.scanId,
    evidenceId,
    projectRoot,
  );
  await mkdir(getEvidenceDirectory(input.budget.scanId, projectRoot), {
    recursive: true,
  });
  try {
    await writePngBytes(absolutePath, buffer);
  } catch (error) {
    if (isStorageFailureError(error)) {
      input.budget.analysis.status = "PARTIAL";
      const notice = storageFailureNotice(error);
      if (notice && !input.budget.analysis.notices.includes(notice)) {
        input.budget.analysis.notices.push(notice);
      }
      return null;
    }
    throw error;
  }

  const artifact: DiagnosticEvidenceArtifact = {
    id: evidenceId,
    kind: input.kind,
    profile: input.profile,
    issueId: input.issueId,
    relativePath: getEvidenceRelativePath(input.budget.scanId, evidenceId),
    publicUrl: getEvidencePublicUrl(input.budget.scanId, evidenceId),
    width: clip.width,
    height: clip.height,
    byteSize: buffer.byteLength,
    capturedAtMs: input.scanRelativeMs(),
    selector: input.selector,
    clip,
    stateLabel: input.stateLabel,
    truncated: false,
  };

  input.budget.analysis.artifacts.push(artifact);
  input.budget.analysis.artifactCount += 1;
  input.budget.analysis.totalBytes += buffer.byteLength;
  if (input.issueId) {
    input.budget.perIssueCounts.set(
      input.issueId,
      (input.budget.perIssueCounts.get(input.issueId) ?? 0) + 1,
    );
  }
  return artifact;
}

export async function captureClipPngBuffer(input: {
  page: Page;
  box: { x: number; y: number; width: number; height: number };
  config: ScannerConfig;
}): Promise<{
  buffer: Buffer;
  clip: NonNullable<ReturnType<typeof calculateEvidenceClip>>;
} | null> {
  const viewport = input.page.viewportSize();
  if (!viewport) return null;
  const clip = calculateEvidenceClip(input.box, {
    paddingPx: input.config.evidenceContextPaddingPx,
    minWidthPx: input.config.evidenceMinWidthPx,
    minHeightPx: input.config.evidenceMinHeightPx,
    maxWidthPx: input.config.evidenceMaxWidthPx,
    maxHeightPx: input.config.evidenceMaxHeightPx,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
  if (!clip) return null;
  try {
    const buffer = await input.page.screenshot({
      type: "png",
      clip,
      timeout: input.config.evidenceScreenshotTimeoutMs,
      animations: "disabled",
    });
    return { buffer, clip };
  } catch {
    return null;
  }
}

export async function writeEvidenceBuffer(input: {
  budget: EvidenceBudget;
  profile: ScanProfile;
  kind: EvidenceKind;
  issueId?: string;
  selector?: string;
  stateLabel?: EvidenceStateLabel;
  buffer: Buffer;
  clip: { x: number; y: number; width: number; height: number };
  scanRelativeMs: () => number;
  projectRoot?: string;
}): Promise<DiagnosticEvidenceArtifact | null> {
  if (isSensitiveEvidenceTarget(input.selector)) {
    input.budget.analysis.notices.push(
      "Skipped evidence capture for a sensitive form control target.",
    );
    return null;
  }
  if (!canAcceptArtifact(input.budget, input.issueId, input.buffer.byteLength)) {
    if (
      !input.budget.analysis.notices.some((notice) =>
        notice.includes("Evidence limits"),
      )
    ) {
      input.budget.analysis.notices.push(
        "Evidence limits were reached. Additional artifacts were skipped.",
      );
    }
    return null;
  }

  const projectRoot = input.projectRoot ?? process.cwd();
  if (!(await canStoreAdditionalBytes(input.buffer.byteLength, projectRoot))) {
    input.budget.analysis.status = "PARTIAL";
    if (
      !input.budget.analysis.notices.some((notice) =>
        notice.includes("storage budget"),
      )
    ) {
      input.budget.analysis.notices.push(
        "Local artifact storage budget was reached. Additional evidence was skipped.",
      );
    }
    return null;
  }

  const evidenceId = createEvidenceId();
  const absolutePath = getEvidenceAbsolutePath(
    input.budget.scanId,
    evidenceId,
    projectRoot,
  );
  await mkdir(getEvidenceDirectory(input.budget.scanId, projectRoot), {
    recursive: true,
  });
  try {
    await writePngBytes(absolutePath, input.buffer);
  } catch (error) {
    if (isStorageFailureError(error)) {
      input.budget.analysis.status = "PARTIAL";
      const notice = storageFailureNotice(error);
      if (notice && !input.budget.analysis.notices.includes(notice)) {
        input.budget.analysis.notices.push(notice);
      }
      return null;
    }
    throw error;
  }

  const artifact: DiagnosticEvidenceArtifact = {
    id: evidenceId,
    kind: input.kind,
    profile: input.profile,
    issueId: input.issueId,
    relativePath: getEvidenceRelativePath(input.budget.scanId, evidenceId),
    publicUrl: getEvidencePublicUrl(input.budget.scanId, evidenceId),
    width: input.clip.width,
    height: input.clip.height,
    byteSize: input.buffer.byteLength,
    capturedAtMs: input.scanRelativeMs(),
    selector: input.selector,
    clip: input.clip,
    stateLabel: input.stateLabel,
    truncated: false,
  };

  input.budget.analysis.artifacts.push(artifact);
  input.budget.analysis.artifactCount += 1;
  input.budget.analysis.totalBytes += input.buffer.byteLength;
  if (input.issueId) {
    input.budget.perIssueCounts.set(
      input.issueId,
      (input.budget.perIssueCounts.get(input.issueId) ?? 0) + 1,
    );
  }
  return artifact;
}
