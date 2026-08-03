import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIpAddress, isPublicIpAddress } from "@/lib/security/ip-policy";

describe("classifyIpAddress IPv4", () => {
  const blocked = [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "169.254.169.254",
    "100.100.100.200",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ];

  for (const address of blocked) {
    it(`blocks ${address}`, () => {
      const result = classifyIpAddress(address);
      assert.equal(result.ok, false);
      assert.equal(isPublicIpAddress(address), false);
    });
  }

  it("accepts a clearly public IPv4 address in classification only", () => {
    // 8.8.8.8 is used only as a pure classification example — no network call.
    const result = classifyIpAddress("8.8.8.8");
    assert.equal(result.ok, true);
  });
});

describe("classifyIpAddress IPv6", () => {
  const blocked = [
    "::",
    "::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "100::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ];

  for (const address of blocked) {
    it(`blocks ${address}`, () => {
      assert.equal(classifyIpAddress(address).ok, false);
    });
  }

  it("accepts a clearly public IPv6 address in classification only", () => {
    assert.equal(classifyIpAddress("2001:4860:4860::8888").ok, true);
  });
});
