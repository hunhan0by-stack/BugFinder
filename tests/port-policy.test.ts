import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePort } from "@/lib/security/port-policy";
import type { ScannerConfig } from "@/lib/config/scanner-config";

const baseConfig: ScannerConfig = {
  pageTimeoutMs: 30_000,
  totalTimeoutMs: 90_000,
  screenshotTimeoutMs: 15_000,
  maxRedirects: 5,
  maxRequests: 250,
  maxUniqueHosts: 40,
  maxBlockedRequestRecords: 20,
  maxConcurrentScans: 1,
  allowedPorts: [80, 443],
  maxFullPageHeight: 20_000,
  dnsTimeoutMs: 5_000,
  stabilizationMs: 800,
  allowLocalFixture: false,
  localFixtureHost: "127.0.0.1",
  localFixturePort: 3100,
  maxRequestBodyBytes: 16_384,
};

describe("evaluatePort", () => {
  it("allows default http 80 and https 443", () => {
    assert.equal(evaluatePort("http:", "", "example.com", baseConfig).ok, true);
    assert.equal(
      evaluatePort("https:", "", "example.com", baseConfig).ok,
      true,
    );
  });

  it("allows explicit 80 and 443", () => {
    assert.equal(
      evaluatePort("http:", "80", "example.com", baseConfig).ok,
      true,
    );
    assert.equal(
      evaluatePort("https:", "443", "example.com", baseConfig).ok,
      true,
    );
  });

  for (const port of ["0", "22", "3000", "8080", "65536"]) {
    it(`rejects port ${port} by default`, () => {
      assert.equal(
        evaluatePort("http:", port, "example.com", baseConfig).ok,
        false,
      );
    });
  }

  it("allows the fixture port only with exact fixture configuration outside production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const enabled = { ...baseConfig, allowLocalFixture: true };
      assert.equal(
        evaluatePort("http:", "3100", "127.0.0.1", enabled).ok,
        true,
      );
      assert.equal(
        evaluatePort("http:", "3100", "example.com", enabled).ok,
        false,
      );
      assert.equal(
        evaluatePort("http:", "3101", "127.0.0.1", enabled).ok,
        false,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("rejects the fixture port in production even when the flag is set", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const enabled = { ...baseConfig, allowLocalFixture: true };
      assert.equal(
        evaluatePort("http:", "3100", "127.0.0.1", enabled).ok,
        false,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
