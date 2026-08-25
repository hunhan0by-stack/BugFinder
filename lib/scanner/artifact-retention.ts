import "server-only";

import { lstat, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getRuntimeConfig } from "@/lib/config/runtime-config";
import { activeScans } from "@/lib/scanner/active-scans";
import {
  assertInsideScanResults,
  getScanResultsBaseDir,
  isSafeScanId,
} from "@/lib/scanner/scan-storage";
import { logScanEvent } from "@/lib/observability/scan-logger";

export type ArtifactCleanupResult = {
  inspected: number;
  deleted: number;
  skippedActive: number;
  skippedInvalid: number;
  remainingBytes: number;
};

const GITKEEP = ".gitkeep";
let lastCleanupMs = 0;

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    !relative.includes("\0")
  );
}

async function directorySizeBytes(
  directory: string,
  remainingBudget: { files: number },
): Promise<number> {
  if (remainingBudget.files <= 0) {
    return 0;
  }
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (remainingBudget.files <= 0) {
      break;
    }
    remainingBudget.files -= 1;
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || entry.name === ".." || entry.name === ".") {
      continue;
    }
    try {
      if (entry.isDirectory()) {
        total += await directorySizeBytes(child, remainingBudget);
      } else if (entry.isFile()) {
        const info = await stat(child);
        total += info.size;
      }
    } catch {
      // Skip unreadable entries.
    }
  }
  return total;
}

export async function measureArtifactStorageBytes(
  projectRoot: string = process.cwd(),
  maxFiles = 5_000,
): Promise<number> {
  const root = getScanResultsBaseDir(projectRoot);
  return directorySizeBytes(root, { files: maxFiles });
}

export async function canStoreAdditionalBytes(
  additionalBytes: number,
  projectRoot: string = process.cwd(),
): Promise<boolean> {
  const config = getRuntimeConfig();
  if (config.maxArtifactStorageBytes <= 0) {
    return true;
  }
  const used = await measureArtifactStorageBytes(projectRoot);
  return used + additionalBytes <= config.maxArtifactStorageBytes;
}

async function safeRemoveScanDirectory(
  root: string,
  scanId: string,
  projectRoot: string,
): Promise<boolean> {
  if (!isSafeScanId(scanId) || scanId.includes("..") || scanId.includes("/") || scanId.includes("\\")) {
    return false;
  }
  const candidate = path.join(root, scanId);
  let resolved: string;
  try {
    resolved = assertInsideScanResults(candidate, projectRoot);
  } catch {
    return false;
  }
  if (!isPathInsideRoot(root, resolved) || resolved === root) {
    return false;
  }
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    await rm(resolved, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function cleanupExpiredArtifacts(input: {
  projectRoot?: string;
  force?: boolean;
  now?: () => number;
} = {}): Promise<ArtifactCleanupResult> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const config = getRuntimeConfig();
  const now = input.now?.() ?? Date.now();
  const result: ArtifactCleanupResult = {
    inspected: 0,
    deleted: 0,
    skippedActive: 0,
    skippedInvalid: 0,
    remainingBytes: 0,
  };

  if (!input.force && now - lastCleanupMs < config.cleanupMinIntervalMs) {
    result.remainingBytes = await measureArtifactStorageBytes(projectRoot);
    return result;
  }
  lastCleanupMs = now;

  const root = getScanResultsBaseDir(projectRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return result;
  }

  const retentionMs = config.artifactRetentionHours * 60 * 60 * 1000;
  const retentionEnabled = config.artifactRetentionHours > 0;
  const candidates: { scanId: string; ageMs: number; sizeBytes: number }[] = [];

  for (const entry of entries) {
    if (result.inspected >= config.cleanupMaxDirectories) {
      break;
    }
    result.inspected += 1;

    if (entry.name === GITKEEP) {
      result.skippedInvalid += 1;
      continue;
    }
    if (entry.isSymbolicLink() || !entry.isDirectory() || !isSafeScanId(entry.name)) {
      result.skippedInvalid += 1;
      continue;
    }
    if (activeScans.has(entry.name)) {
      result.skippedActive += 1;
      continue;
    }

    const candidate = path.join(root, entry.name);
    let resolved: string;
    try {
      resolved = assertInsideScanResults(candidate, projectRoot);
    } catch {
      result.skippedInvalid += 1;
      continue;
    }
    if (!isPathInsideRoot(root, resolved)) {
      result.skippedInvalid += 1;
      continue;
    }

    try {
      const info = await lstat(resolved);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        result.skippedInvalid += 1;
        continue;
      }
      const ageMs = Math.max(0, now - info.mtimeMs);
      const sizeBytes = await directorySizeBytes(resolved, { files: 200 });
      candidates.push({ scanId: entry.name, ageMs, sizeBytes });
    } catch {
      result.skippedInvalid += 1;
    }
  }

  if (retentionEnabled) {
    for (const candidate of candidates) {
      if (candidate.ageMs < retentionMs) {
        continue;
      }
      if (await safeRemoveScanDirectory(root, candidate.scanId, projectRoot)) {
        result.deleted += 1;
        candidate.sizeBytes = 0;
      }
    }
  }

  result.remainingBytes = await measureArtifactStorageBytes(projectRoot);
  logScanEvent({
    level: "info",
    event: "scan.cleanup_completed",
    counts: {
      inspected: result.inspected,
      deleted: result.deleted,
      skippedActive: result.skippedActive,
      remainingBytes: result.remainingBytes,
    },
  });
  return result;
}

export function resetArtifactCleanupTimer(): void {
  lastCleanupMs = 0;
}
