import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getRuntimeConfig,
  resetRuntimeConfigCache,
} from "@/lib/config/runtime-config";
import {
  assertProductionFixtureDisabled,
  getScannerConfig,
  resetScannerConfigCache,
} from "@/lib/config/scanner-config";

describe("runtime configuration", () => {
  afterEach(() => {
    resetRuntimeConfigCache();
    resetScannerConfigCache();
    delete process.env.SCAN_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.SCAN_ARTIFACT_RETENTION_HOURS;
    delete process.env.SCAN_TRUST_PROXY;
    delete process.env.ALLOW_LOCAL_FIXTURE;
  });

  it("uses safe defaults", () => {
    const config = getRuntimeConfig({ NODE_ENV: "test" });
    assert.equal(config.rateLimitMaxRequests, 200);
    assert.equal(config.trustProxy, false);
    assert.equal(config.artifactRetentionHours, 24);
    assert.equal(config.environmentClass, "test");
  });

  it("uses a conservative production rate-limit default", () => {
    const config = getRuntimeConfig({ NODE_ENV: "production" });
    assert.equal(config.rateLimitMaxRequests, 10);
    assert.equal(config.environmentClass, "production");
  });

  it("rejects invalid rate-limit configuration", () => {
    assert.throws(() =>
      getRuntimeConfig({
        SCAN_RATE_LIMIT_MAX_REQUESTS: "0",
      }),
    );
  });

  it("rejects production fixture activation", () => {
    assert.throws(
      () =>
        assertProductionFixtureDisabled({
          NODE_ENV: "production",
          ALLOW_LOCAL_FIXTURE: "true",
        }),
      /ALLOW_LOCAL_FIXTURE/,
    );
  });

  it("refuses to load scanner config with production fixture enabled", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFixture = process.env.ALLOW_LOCAL_FIXTURE;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_LOCAL_FIXTURE = "true";
    resetScannerConfigCache();
    try {
      assert.throws(() => getScannerConfig(), /ALLOW_LOCAL_FIXTURE/);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousFixture === undefined) {
        delete process.env.ALLOW_LOCAL_FIXTURE;
      } else {
        process.env.ALLOW_LOCAL_FIXTURE = previousFixture;
      }
      resetScannerConfigCache();
    }
  });
});
