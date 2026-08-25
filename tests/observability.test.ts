import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  logScanEvent,
  resetScanLogSink,
  setScanLogSink,
} from "@/lib/observability/scan-logger";

describe("scan logger privacy", () => {
  const lines: string[] = [];

  afterEach(() => {
    lines.length = 0;
    resetScanLogSink();
  });

  it("redacts query strings and omits secret-like fields", () => {
    setScanLogSink((line) => lines.push(line));
    logScanEvent({
      level: "info",
      event: "scan.started",
      scanId: "11111111-1111-4111-8111-111111111111",
      target: "https://example.com/path?secret=PHASE9_SECRET_QUERY#frag",
      reasonCode: "OK",
    });
    assert.equal(lines.length, 1);
    const payload = JSON.parse(lines[0]) as { target?: string };
    assert.equal(payload.target?.includes("PHASE9_SECRET_QUERY"), false);
    assert.equal(payload.target?.includes("?"), false);
    assert.equal(lines[0].includes("PHASE9_SECRET_PASSWORD"), false);
    assert.equal(lines[0].includes("PHASE9_SECRET_FORM"), false);
    assert.equal(lines[0].includes("PHASE9_SECRET_BUTTON"), false);
    assert.equal(lines[0].includes("PHASE9_SECRET_AUTH"), false);
  });
});
