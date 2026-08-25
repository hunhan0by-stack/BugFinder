import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  assertInsideScanResults,
  getScanDirectory,
  isSafeScanId,
} from "@/lib/scanner/scan-storage";
import { isSafeEvidenceId } from "@/lib/scanner/evidence/evidence-paths";

const PNG_HEADERS = {
  "Content-Type": "image/png",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
} as const;

const NOT_FOUND_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function notFound(): Response {
  return Response.json(
    { success: false, error: "Not found.", code: "NOT_FOUND" },
    { status: 404, headers: NOT_FOUND_HEADERS },
  );
}

async function readPngIfPresent(absolutePath: string): Promise<Buffer | null> {
  try {
    const info = await stat(absolutePath);
    if (!info.isFile() || info.size === 0) {
      return null;
    }
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function serveScanPng(input: {
  scanId: string;
  filename: string;
  kind: "screenshot" | "evidence";
}): Promise<Response> {
  if (!isSafeScanId(input.scanId)) {
    return notFound();
  }

  let absolutePath: string;
  try {
    if (input.kind === "screenshot") {
      if (input.filename !== "desktop.png" && input.filename !== "mobile.png") {
        return notFound();
      }
      absolutePath = assertInsideScanResults(
        path.join(getScanDirectory(input.scanId), input.filename),
      );
    } else {
      if (!input.filename.endsWith(".png")) {
        return notFound();
      }
      const evidenceId = input.filename.slice(0, -4);
      if (!isSafeEvidenceId(evidenceId)) {
        return notFound();
      }
      absolutePath = assertInsideScanResults(
        path.join(getScanDirectory(input.scanId), "evidence", input.filename),
      );
    }
  } catch {
    return notFound();
  }

  const bytes = await readPngIfPresent(absolutePath);
  if (!bytes) {
    return notFound();
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: PNG_HEADERS,
  });
}
