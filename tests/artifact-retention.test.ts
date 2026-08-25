import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { access, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { activeScans } from "@/lib/scanner/active-scans";
import {
  cleanupExpiredArtifacts,
  resetArtifactCleanupTimer,
} from "@/lib/scanner/artifact-retention";
import { getScanDirectory } from "@/lib/scanner/scan-storage";
import {
  getRuntimeConfig,
  resetRuntimeConfigCache,
} from "@/lib/config/runtime-config";

const FRESH_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRED_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const INVALID_DIR = "not-a-uuid";

async function withTempRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fbf-ret-"));
  try {
    await fn(root);
  } finally {
    activeScans.reset();
    resetArtifactCleanupTimer();
    await rm(root, { recursive: true, force: true });
  }
}

describe("artifact retention", () => {
  afterEach(() => {
    activeScans.reset();
    resetArtifactCleanupTimer();
    resetRuntimeConfigCache();
    delete process.env.SCAN_ARTIFACT_RETENTION_HOURS;
    delete process.env.SCAN_CLEANUP_MAX_DIRECTORIES;
    delete process.env.SCAN_CLEANUP_MIN_INTERVAL_MS;
  });

  it("retains fresh artifacts and deletes expired ones", async () => {
    await withTempRoot(async (root) => {
      process.env.SCAN_ARTIFACT_RETENTION_HOURS = "1";
      process.env.SCAN_CLEANUP_MIN_INTERVAL_MS = "1000";
      resetRuntimeConfigCache();
      assert.equal(getRuntimeConfig().artifactRetentionHours, 1);

      const fresh = getScanDirectory(FRESH_ID, root);
      const expired = getScanDirectory(EXPIRED_ID, root);
      await mkdir(fresh, { recursive: true });
      await mkdir(expired, { recursive: true });
      await writeFile(path.join(fresh, "desktop.png"), Buffer.from([1, 2, 3]));
      await writeFile(path.join(expired, "desktop.png"), Buffer.from([1, 2, 3]));
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(expired, twoHoursAgo, twoHoursAgo);

      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.deleted, 1);
      await access(fresh);
      await assert.rejects(() => access(expired));
    });
  });

  it("retains directories owned by an active scan", async () => {
    await withTempRoot(async (root) => {
      process.env.SCAN_ARTIFACT_RETENTION_HOURS = "1";
      resetRuntimeConfigCache();
      const activeDir = getScanDirectory(ACTIVE_ID, root);
      await mkdir(activeDir, { recursive: true });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(activeDir, twoHoursAgo, twoHoursAgo);
      activeScans.add(ACTIVE_ID);

      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.deleted, 0);
      assert.equal(result.skippedActive, 1);
      await access(activeDir);
    });
  });

  it("ignores invalid directory names", async () => {
    await withTempRoot(async (root) => {
      const resultsRoot = path.join(root, "public", "scan-results");
      await mkdir(path.join(resultsRoot, INVALID_DIR), { recursive: true });
      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.deleted, 0);
      await access(path.join(resultsRoot, INVALID_DIR));
    });
  });

  it("rejects path traversal candidates", () => {
    assert.throws(() => getScanDirectory("../escape"));
    assert.throws(() => getScanDirectory("..\\escape"));
    assert.throws(() => getScanDirectory("not-a-uuid"));
  });

  it("skips symlink directories where the platform allows creating them", async () => {
    await withTempRoot(async (root) => {
      const resultsRoot = path.join(root, "public", "scan-results");
      await mkdir(resultsRoot, { recursive: true });
      const outside = path.join(root, "outside-secret");
      await mkdir(outside, { recursive: true });
      await writeFile(path.join(outside, "keep.txt"), "secret");
      const linkPath = path.join(resultsRoot, EXPIRED_ID);
      try {
        await symlink(outside, linkPath, "dir");
      } catch {
        return;
      }
      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.deleted, 0);
      await access(path.join(outside, "keep.txt"));
    });
  });

  it("respects the cleanup directory inspection limit", async () => {
    await withTempRoot(async (root) => {
      process.env.SCAN_CLEANUP_MAX_DIRECTORIES = "1";
      process.env.SCAN_ARTIFACT_RETENTION_HOURS = "1";
      resetRuntimeConfigCache();
      await mkdir(getScanDirectory(FRESH_ID, root), { recursive: true });
      await mkdir(getScanDirectory(EXPIRED_ID, root), { recursive: true });
      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.inspected, 1);
    });
  });

  it("does not delete by age when retention hours is 0", async () => {
    await withTempRoot(async (root) => {
      process.env.SCAN_ARTIFACT_RETENTION_HOURS = "0";
      resetRuntimeConfigCache();
      const expired = getScanDirectory(EXPIRED_ID, root);
      await mkdir(expired, { recursive: true });
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(expired, twoHoursAgo, twoHoursAgo);
      const result = await cleanupExpiredArtifacts({
        projectRoot: root,
        force: true,
      });
      assert.equal(result.deleted, 0);
      await access(expired);
    });
  });
});
