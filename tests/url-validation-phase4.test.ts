import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  URL_CREDENTIALS_MESSAGE,
  URL_TOO_LONG_MESSAGE,
  checkWebsiteUrl,
  scanRequestSchema,
} from "@/lib/validation/scan-schema";

const allTrue = {
  consoleErrors: true,
  networkErrors: true,
  brokenImages: true,
  mobileLayout: true,
  accessibility: true,
  screenshots: true,
};

describe("checkWebsiteUrl phase 4 additions", () => {
  it("rejects embedded credentials", () => {
    const result = checkWebsiteUrl("https://user:pass@example.com");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, URL_CREDENTIALS_MESSAGE);
    }
  });

  it("rejects excessively long URLs", () => {
    const result = checkWebsiteUrl(`https://example.com/${"a".repeat(3000)}`);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, URL_TOO_LONG_MESSAGE);
    }
  });

  it("strips fragments and trailing hostname dots", () => {
    const result = checkWebsiteUrl("https://example.com./path#section");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url.includes("#"), false);
      assert.equal(result.url.startsWith("https://example.com/"), true);
    }
  });

  it("rejects control characters and broken percent encoding", () => {
    assert.equal(checkWebsiteUrl("https://example.com/\u0000").ok, false);
    assert.equal(checkWebsiteUrl("https://example.com/%zz").ok, false);
  });
});

describe("scanRequestSchema still rejects unknown fields", () => {
  it("rejects unknown top-level fields", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: allTrue,
      extra: true,
    });
    assert.equal(parsed.success, false);
  });
});
