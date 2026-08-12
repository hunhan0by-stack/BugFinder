import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_URL_MESSAGE,
  MALFORMED_URL_MESSAGE,
  UNSUPPORTED_PROTOCOL_MESSAGE,
  checkWebsiteUrl,
  scanRequestSchema,
} from "../lib/validation/scan-schema.ts";

const ALL_OPTIONS = {
  consoleErrors: true,
  networkErrors: true,
  brokenImages: true,
  mobileLayout: true,
  accessibility: true,
  screenshots: true,
};

describe("checkWebsiteUrl", () => {
  it("rejects empty and whitespace-only input", () => {
    assert.deepEqual(checkWebsiteUrl(""), {
      ok: false,
      message: EMPTY_URL_MESSAGE,
    });
    assert.deepEqual(checkWebsiteUrl("   "), {
      ok: false,
      message: EMPTY_URL_MESSAGE,
    });
  });

  it("rejects protocol-less addresses", () => {
    for (const value of [
      "example.com",
      "www.example.com",
      "example.com/pricing",
    ]) {
      const result = checkWebsiteUrl(value);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.message, MALFORMED_URL_MESSAGE);
      }
    }
  });

  it("rejects unsupported protocols with the dedicated message", () => {
    for (const value of [
      "ftp://example.com",
      "file://example.com",
      "javascript:alert(1)",
      "data:text/plain,test",
    ]) {
      const result = checkWebsiteUrl(value);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.message, UNSUPPORTED_PROTOCOL_MESSAGE);
      }
    }
  });

  it("rejects internal whitespace and incomplete https URLs", () => {
    assert.deepEqual(checkWebsiteUrl("https://exam ple.com"), {
      ok: false,
      message: MALFORMED_URL_MESSAGE,
    });
    assert.deepEqual(checkWebsiteUrl("https://"), {
      ok: false,
      message: MALFORMED_URL_MESSAGE,
    });
  });

  it("accepts and normalizes valid http and https URLs", () => {
    const cases = [
      ["http://example.com", "http://example.com/"],
      ["https://example.com", "https://example.com/"],
      ["https://www.example.com", "https://www.example.com/"],
      ["https://example.com/pricing", "https://example.com/pricing"],
      [
        "https://subdomain.example.com/path?value=1",
        "https://subdomain.example.com/path?value=1",
      ],
      ["  https://example.com  ", "https://example.com/"],
    ];

    for (const [input, expected] of cases) {
      const result = checkWebsiteUrl(input);
      assert.equal(result.ok, true, input);
      if (result.ok) {
        assert.equal(result.url, expected, input);
      }
    }
  });

  it("never adds a protocol", () => {
    const result = checkWebsiteUrl("example.com");
    assert.equal(result.ok, false);
  });
});

describe("scanRequestSchema", () => {
  it("rejects unknown top-level fields", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: ALL_OPTIONS,
      extra: true,
    });
    assert.equal(parsed.success, false);
  });

  it("rejects unknown option fields", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: { ...ALL_OPTIONS, mystery: true },
    });
    assert.equal(parsed.success, false);
  });

  it("rejects string option values", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: { ...ALL_OPTIONS, consoleErrors: "yes" },
    });
    assert.equal(parsed.success, false);
  });

  it("rejects when every option is false", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "https://example.com",
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    assert.equal(parsed.success, false);
  });

  it("accepts a valid request and normalizes the URL", () => {
    const parsed = scanRequestSchema.safeParse({
      url: "  https://example.com/pricing  ",
      options: ALL_OPTIONS,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.url, "https://example.com/pricing");
    }
  });
});
