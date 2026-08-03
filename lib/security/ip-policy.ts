import "server-only";

import { isIP } from "node:net";

export type IpClassification =
  | { ok: true; family: 4 | 6; address: string }
  | { ok: false; family: 4 | 6 | 0; address: string; reason: string };

function parseIpv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

function ipv4ToInt(octets: number[]): number {
  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0)
  ) >>> 0;
}

function ipv4InCidr(address: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const addressOctets = parseIpv4Octets(address);
  const baseOctets = parseIpv4Octets(base);
  if (!addressOctets || !baseOctets || !Number.isInteger(prefix)) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }

  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipv4ToInt(addressOctets) & mask) === (ipv4ToInt(baseOctets) & mask);
}

const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
] as const;

const EXPLICIT_BLOCKED_IPV4 = new Set([
  "169.254.169.254",
  "100.100.100.200",
  "255.255.255.255",
]);

function expandIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    // Handled via mapped IPv4 extraction before calling expand.
    return null;
  }

  const sides = normalized.split("::");
  if (sides.length > 2) {
    return null;
  }

  const head = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const tail = sides.length === 2 && sides[1] ? sides[1].split(":").filter(Boolean) : [];
  const missing = 8 - (head.length + tail.length);
  if (missing < 0 || (sides.length === 1 && head.length !== 8)) {
    return null;
  }

  const groups = [
    ...head,
    ...Array.from({ length: missing }, () => "0"),
    ...tail,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const values: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    values.push(Number.parseInt(group, 16));
  }
  return values;
}

function ipv6PrefixMatch(address: string, prefixHexGroups: number[], prefixBits: number): boolean {
  const groups = expandIpv6(address);
  if (!groups) {
    return false;
  }

  let remaining = prefixBits;
  for (let index = 0; index < prefixHexGroups.length && remaining > 0; index += 1) {
    const bits = Math.min(16, remaining);
    const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
    if ((groups[index] & mask) !== (prefixHexGroups[index] & mask)) {
      return false;
    }
    remaining -= bits;
  }
  return true;
}

function extractMappedIpv4(address: string): string | null {
  const lower = address.toLowerCase();

  // Node may present mapped addresses as ::ffff:127.0.0.1 or ::ffff:7f00:1
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(lower);
  if (dotted) {
    return dotted[1];
  }

  const hexPair = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(lower);
  if (hexPair) {
    const high = Number.parseInt(hexPair[1], 16);
    const low = Number.parseInt(hexPair[2], 16);
    return [
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 8) & 0xff,
      low & 0xff,
    ].join(".");
  }

  return null;
}

function classifyIpv4(address: string): IpClassification {
  if (EXPLICIT_BLOCKED_IPV4.has(address)) {
    return {
      ok: false,
      family: 4,
      address,
      reason: "BLOCKED_IP",
    };
  }

  for (const cidr of BLOCKED_IPV4_CIDRS) {
    if (ipv4InCidr(address, cidr)) {
      return {
        ok: false,
        family: 4,
        address,
        reason: "BLOCKED_IP",
      };
    }
  }

  return { ok: true, family: 4, address };
}

function classifyIpv6(address: string): IpClassification {
  const mapped = extractMappedIpv4(address);
  if (mapped) {
    const mappedResult = classifyIpv4(mapped);
    if (!mappedResult.ok) {
      return {
        ok: false,
        family: 6,
        address,
        reason: "BLOCKED_IP",
      };
    }
  }

  const lower = address.toLowerCase();

  // Unspecified and loopback
  if (lower === "::" || lower === "::1") {
    return { ok: false, family: 6, address, reason: "BLOCKED_IP" };
  }

  // IPv4-mapped prefix ::ffff:0:0/96 already handled for blocked mapped IPv4.
  // NAT64 well-known prefix 64:ff9b::/96 — block when mapped IPv4 would be blocked.
  if (ipv6PrefixMatch(lower, [0x64, 0xff9b], 96)) {
    const groups = expandIpv6(lower);
    if (groups) {
      const embedded = [
        (groups[6] >> 8) & 0xff,
        groups[6] & 0xff,
        (groups[7] >> 8) & 0xff,
        groups[7] & 0xff,
      ].join(".");
      if (!classifyIpv4(embedded).ok) {
        return { ok: false, family: 6, address, reason: "BLOCKED_IP" };
      }
    }
  }

  const blockedPrefixes: Array<{ groups: number[]; bits: number }> = [
    { groups: [0x0100], bits: 64 }, // 100::/64
    { groups: [0x2001, 0x0db8], bits: 32 }, // documentation
    { groups: [0xfc00], bits: 7 }, // unique local fc00::/7
    { groups: [0xfe80], bits: 10 }, // link-local
    { groups: [0xff00], bits: 8 }, // multicast
  ];

  for (const prefix of blockedPrefixes) {
    if (ipv6PrefixMatch(lower, prefix.groups, prefix.bits)) {
      return { ok: false, family: 6, address, reason: "BLOCKED_IP" };
    }
  }

  return { ok: true, family: 6, address };
}

/**
 * Classifies a single IP address. Hostnames must be resolved first.
 * Unusual IPv4 literal forms should already be normalized by the URL parser.
 */
export function classifyIpAddress(rawAddress: string): IpClassification {
  const address = rawAddress.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(address);

  if (family === 4) {
    return classifyIpv4(address);
  }

  if (family === 6) {
    return classifyIpv6(address);
  }

  return {
    ok: false,
    family: 0,
    address,
    reason: "BLOCKED_IP",
  };
}

export function isPublicIpAddress(address: string): boolean {
  return classifyIpAddress(address).ok;
}
