import "server-only";

import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SCAN_RESULTS_DIRNAME = "scan-results";

export function getScanResultsBaseDir(
  projectRoot: string = process.cwd(),
): string {
  return path.resolve(projectRoot, "public", SCAN_RESULTS_DIRNAME);
}

export function assertInsideScanResults(
  candidatePath: string,
  projectRoot: string = process.cwd(),
): string {
  const base = getScanResultsBaseDir(projectRoot);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(base, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  ) {
    throw new Error("Scan storage path escaped the scan-results directory.");
  }
  return resolved;
}

export function getScanDirectory(
  scanId: string,
  projectRoot: string = process.cwd(),
): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(scanId)) {
    throw new Error("Scan directory requires an internally generated UUID.");
  }
  return assertInsideScanResults(
    path.join(getScanResultsBaseDir(projectRoot), scanId),
    projectRoot,
  );
}

export function getDesktopScreenshotPath(
  scanId: string,
  projectRoot: string = process.cwd(),
): string {
  return assertInsideScanResults(
    path.join(getScanDirectory(scanId, projectRoot), "desktop.png"),
    projectRoot,
  );
}

export function getMobileScreenshotPath(
  scanId: string,
  projectRoot: string = process.cwd(),
): string {
  return assertInsideScanResults(
    path.join(getScanDirectory(scanId, projectRoot), "mobile.png"),
    projectRoot,
  );
}

export function getDesktopScreenshotPublicUrl(scanId: string): string {
  return `/scan-results/${scanId}/desktop.png`;
}

export function getMobileScreenshotPublicUrl(scanId: string): string {
  return `/scan-results/${scanId}/mobile.png`;
}

export async function ensureScanDirectory(
  scanId: string,
  projectRoot: string = process.cwd(),
): Promise<string> {
  const directory = getScanDirectory(scanId, projectRoot);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function writeDesktopScreenshot(
  scanId: string,
  bytes: Buffer,
  projectRoot: string = process.cwd(),
): Promise<{ absolutePath: string; publicUrl: string; byteLength: number }> {
  const absolutePath = getDesktopScreenshotPath(scanId, projectRoot);
  await ensureScanDirectory(scanId, projectRoot);
  await writeFile(absolutePath, bytes);
  return {
    absolutePath,
    publicUrl: getDesktopScreenshotPublicUrl(scanId),
    byteLength: bytes.byteLength,
  };
}

export async function writeMobileScreenshot(
  scanId: string,
  bytes: Buffer,
  projectRoot: string = process.cwd(),
): Promise<{ absolutePath: string; publicUrl: string; byteLength: number }> {
  const absolutePath = getMobileScreenshotPath(scanId, projectRoot);
  await ensureScanDirectory(scanId, projectRoot);
  await writeFile(absolutePath, bytes);
  return {
    absolutePath,
    publicUrl: getMobileScreenshotPublicUrl(scanId),
    byteLength: bytes.byteLength,
  };
}

export async function removeIncompleteScreenshot(
  scanId: string,
  projectRoot: string = process.cwd(),
): Promise<void> {
  for (const absolutePath of [
    getDesktopScreenshotPath(scanId, projectRoot),
    getMobileScreenshotPath(scanId, projectRoot),
  ]) {
    try {
      const info = await stat(absolutePath);
      if (info.size === 0) {
        await rm(absolutePath, { force: true });
      }
    } catch {
      // File may not exist.
    }
  }
}

export async function removeIncompleteMobileScreenshot(
  scanId: string,
  projectRoot: string = process.cwd(),
): Promise<void> {
  const absolutePath = getMobileScreenshotPath(scanId, projectRoot);
  try {
    const info = await stat(absolutePath);
    if (info.size === 0) {
      await rm(absolutePath, { force: true });
    }
  } catch {
    // File may not exist.
  }
}

export async function removeScanDirectoryIfEmpty(
  scanId: string,
  projectRoot: string = process.cwd(),
): Promise<void> {
  const directory = getScanDirectory(scanId, projectRoot);
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    // Ignore cleanup races.
  }
}
