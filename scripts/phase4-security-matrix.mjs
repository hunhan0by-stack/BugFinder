import assert from "node:assert/strict";
import { classifyIpAddress } from "../lib/security/ip-policy.ts";
import { evaluateHostname } from "../lib/security/hostname-policy.ts";
import { evaluatePort } from "../lib/security/port-policy.ts";

const config = {
  pageTimeoutMs: 30000,
  totalTimeoutMs: 90000,
  screenshotTimeoutMs: 15000,
  maxRedirects: 5,
  maxRequests: 250,
  maxUniqueHosts: 40,
  maxBlockedRequestRecords: 20,
  maxConcurrentScans: 1,
  allowedPorts: [80, 443],
  maxFullPageHeight: 20000,
  dnsTimeoutMs: 5000,
  stabilizationMs: 800,
  allowLocalFixture: false,
  localFixtureHost: "127.0.0.1",
  localFixturePort: 3100,
  maxRequestBodyBytes: 16384,
};

const results = [];

function check(label, fn) {
  try {
    fn();
    results.push({ label, ok: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error: String(error) });
    console.log(`FAIL ${label}: ${error}`);
  }
}

for (const ip of [
  "127.0.0.1",
  "10.0.0.1",
  "169.254.169.254",
  "192.168.1.1",
  "::1",
  "fc00::1",
  "::ffff:127.0.0.1",
]) {
  check(`blocks IP ${ip}`, () => {
    assert.equal(classifyIpAddress(ip).ok, false);
  });
}

for (const host of ["localhost", "test.localhost", "service.internal", "database"]) {
  check(`blocks host ${host}`, () => {
    assert.equal(evaluateHostname(host, config).ok, false);
  });
}

check("rejects port 3000", () => {
  assert.equal(evaluatePort("http:", "3000", "example.com", config).ok, false);
});

check("allows https default port", () => {
  assert.equal(evaluatePort("https:", "", "example.com", config).ok, true);
});

const failed = results.filter((entry) => !entry.ok);
console.log(`--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`);
process.exit(failed.length ? 1 : 0);
