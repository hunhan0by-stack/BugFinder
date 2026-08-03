import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureScanDirectory,
  getDesktopScreenshotPath,
  getDesktopScreenshotPublicUrl,
  getScanDirectory,
  removeScanDirectoryIfEmpty,
  writeDesktopScreenshot,
} from "@/lib/scanner/scan-storage";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("scan-storage", () => {
  it("keeps paths under public/scan-results and uses UUID directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fbf-scan-"));
    const scanId = "11111111-1111-4111-8111-111111111111";
    try {
      const directory = await ensureScanDirectory(scanId, root);
      assert.ok(directory.startsWith(path.join(root, "public", "scan-results")));
      assert.equal(
        getDesktopScreenshotPublicUrl(scanId),
        `/scan-results/${scanId}/desktop.png`,
      );

      const written = await writeDesktopScreenshot(
        scanId,
        Buffer.from([1, 2, 3, 4]),
        root,
      );
      assert.equal(written.publicUrl, `/scan-results/${scanId}/desktop.png`);
      assert.ok(!(await readFile(written.absolutePath)).includes(Buffer.from("C:\\")));
      const info = await stat(getDesktopScreenshotPath(scanId, root));
      assert.ok(info.size > 0);

      await removeScanDirectoryIfEmpty(scanId, root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects path escape attempts and non-uuid scan ids", () => {
    assert.throws(() => getScanDirectory("../escape"));
    assert.throws(() => getScanDirectory("not-a-uuid"));
  });
});
