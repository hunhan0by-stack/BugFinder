import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAndValidateHostname } from "@/lib/security/dns-policy";
import type { ScannerConfig } from "@/lib/config/scanner-config";

const config: ScannerConfig = {
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
  dnsTimeoutMs: 50,
  stabilizationMs: 0,
  allowLocalFixture: false,
  localFixtureHost: "127.0.0.1",
  localFixturePort: 3100,
  maxRequestBodyBytes: 16_384,
};

describe("resolveAndValidateHostname", () => {
  it("accepts public-only answers", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    assert.equal(result.ok, true);
  });

  it("rejects private-only answers", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "BLOCKED_IP");
    }
  });

  it("rejects mixed public/private answers", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.5", family: 4 },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("rejects empty answers", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () => [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "DNS_RESOLUTION_FAILED");
    }
  });

  it("converts DNS exceptions to a safe failure", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "DNS_RESOLUTION_FAILED");
    }
  });

  it("converts DNS timeout to a safe failure", async () => {
    const result = await resolveAndValidateHostname("example.com", {
      config,
      lookupFn: async () =>
        new Promise(() => {
          // Never resolves — the DNS timeout path should win.
        }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "DNS_RESOLUTION_FAILED");
    }
  });
});
