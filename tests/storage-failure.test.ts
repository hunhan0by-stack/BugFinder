import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isInsufficientStorageError,
  isPermissionStorageError,
  isStorageFailureError,
  storageFailureNotice,
} from "@/lib/scanner/storage-errors";
import {
  setPngWriteFnForTests,
  writeDesktopScreenshot,
  writePngBytes,
} from "@/lib/scanner/scan-storage";

function errorWithCode(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe("storage failure classification", () => {
  it("recognizes ENOSPC, EACCES, and EPERM", () => {
    assert.equal(isInsufficientStorageError(errorWithCode("ENOSPC")), true);
    assert.equal(isPermissionStorageError(errorWithCode("EACCES")), true);
    assert.equal(isPermissionStorageError(errorWithCode("EPERM")), true);
    assert.equal(isStorageFailureError(errorWithCode("ENOSPC")), true);
    assert.equal(isStorageFailureError(errorWithCode("EACCES")), true);
    assert.equal(isStorageFailureError(new Error("other")), false);
    assert.match(storageFailureNotice(errorWithCode("ENOSPC")) ?? "", /full/);
    assert.match(storageFailureNotice(errorWithCode("EPERM")) ?? "", /could not be written/);
  });
});

describe("artifact write failures", () => {
  afterEach(() => {
    setPngWriteFnForTests(null);
  });

  it("cleans a partial file and rethrows ENOSPC", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fbf-enospc-"));
    try {
      const target = path.join(root, "desktop.png");
      setPngWriteFnForTests(async () => {
        throw errorWithCode("ENOSPC");
      });
      await assert.rejects(() => writePngBytes(target, Buffer.from([1, 2, 3])), {
        code: "ENOSPC",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not crash screenshot storage on EACCES", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fbf-eacces-"));
    try {
      setPngWriteFnForTests(async () => {
        throw errorWithCode("EACCES");
      });
      await assert.rejects(
        () =>
          writeDesktopScreenshot(
            "11111111-1111-4111-8111-111111111111",
            Buffer.from([1, 2, 3, 4]),
            root,
          ),
        { code: "EACCES" },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not crash screenshot storage on EPERM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fbf-eperm-"));
    try {
      setPngWriteFnForTests(async () => {
        throw errorWithCode("EPERM");
      });
      await assert.rejects(
        () =>
          writeDesktopScreenshot(
            "11111111-1111-4111-8111-111111111111",
            Buffer.from([1, 2, 3, 4]),
            root,
          ),
        { code: "EPERM" },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
