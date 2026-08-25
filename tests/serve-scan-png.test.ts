import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serveScanPng } from "@/lib/scanner/serve-scan-png";
import { getDesktopScreenshotPath } from "@/lib/scanner/scan-storage";

const SCAN_ID = "11111111-1111-4111-8111-111111111111";

describe("scan PNG serving", () => {
  it("rejects path traversal and unknown files", async () => {
    const traversal = await serveScanPng({
      scanId: "../secret",
      filename: "desktop.png",
      kind: "screenshot",
    });
    assert.equal(traversal.status, 404);
    const queryLike = await serveScanPng({
      scanId: SCAN_ID,
      filename: "..\\windows.png",
      kind: "screenshot",
    });
    assert.equal(queryLike.status, 404);
    const other = await serveScanPng({
      scanId: SCAN_ID,
      filename: "notes.txt",
      kind: "screenshot",
    });
    assert.equal(other.status, 404);
  });

  it("serves only PNG bytes with nosniff and no-store headers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fbf-png-"));
    const previousCwd = process.cwd();
    try {
      const screenshotDir = path.dirname(getDesktopScreenshotPath(SCAN_ID, root));
      await mkdir(screenshotDir, { recursive: true });
      await writeFile(
        path.join(screenshotDir, "desktop.png"),
        Buffer.from([137, 80, 78, 71]),
      );
      process.chdir(root);
      const response = await serveScanPng({
        scanId: SCAN_ID,
        filename: "desktop.png",
        kind: "screenshot",
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Content-Type"), "image/png");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    } finally {
      process.chdir(previousCwd);
      await rm(root, { recursive: true, force: true });
    }
  });
});
