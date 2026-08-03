import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateHostname,
  normalizeHostname,
} from "@/lib/security/hostname-policy";
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

describe("normalizeHostname", () => {
  it("lowercases and strips one trailing dot", () => {
    assert.equal(normalizeHostname("Example.COM."), "example.com");
  });
});

describe("evaluateHostname", () => {
  const blocked = [
    "localhost",
    "LOCALHOST",
    "localhost.",
    "test.localhost",
    "service.local",
    "service.internal",
    "router.home",
    "database",
    "metadata.google.internal",
  ];

  for (const hostname of blocked) {
    it(`blocks ${hostname}`, () => {
      assert.equal(evaluateHostname(hostname, baseConfig).ok, false);
    });
  }

  const allowed = [
    "example.com",
    "www.example.com",
    "subdomain.example.com",
    "xn--e1afmkfd.xn--p1ai",
  ];

  for (const hostname of allowed) {
    it(`allows ${hostname}`, () => {
      assert.equal(evaluateHostname(hostname, baseConfig).ok, true);
    });
  }

  it("allows the exact local fixture host only when enabled outside production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const enabled = {
        ...baseConfig,
        allowLocalFixture: true,
        localFixtureHost: "127.0.0.1",
      };
      assert.equal(evaluateHostname("127.0.0.1", enabled).ok, true);
      assert.equal(evaluateHostname("192.168.1.10", enabled).ok, true);
      // 192.168 is an IP literal — hostname policy allows literals; IP policy blocks later.
      assert.equal(evaluateHostname("localhost", enabled).ok, false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
