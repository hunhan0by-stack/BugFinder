import "server-only";

import { isIP } from "node:net";
import {
  getScannerConfig,
  isLocalFixtureAllowed,
  type ScannerConfig,
} from "@/lib/config/scanner-config";

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".localdomain",
] as const;

const BLOCKED_EXACT_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",
]);

export type HostnamePolicyResult =
  | { ok: true; hostname: string }
  | { ok: false; hostname: string; reason: "BLOCKED_HOSTNAME" };

/**
 * Normalizes a hostname from URL.hostname: lowercase, strip one trailing dot,
 * keep IPv6 without surrounding brackets for classification helpers.
 */
export function normalizeHostname(hostname: string): string {
  let value = hostname.trim().toLowerCase();
  if (value.endsWith(".") && value !== ".") {
    value = value.slice(0, -1);
  }
  return value;
}

function isExactLocalFixtureHost(
  hostname: string,
  config: ScannerConfig,
): boolean {
  if (!isLocalFixtureAllowed(config)) {
    return false;
  }
  return hostname === normalizeHostname(config.localFixtureHost);
}

/**
 * Hostname policy for scan targets and request-guard destinations.
 * IP literals are not blocked here — IP policy handles them after parsing.
 */
export function evaluateHostname(
  rawHostname: string,
  config: ScannerConfig = getScannerConfig(),
): HostnamePolicyResult {
  const hostname = normalizeHostname(rawHostname);

  if (hostname === "" || /[\s\u0000-\u001f\u007f]/.test(hostname)) {
    return { ok: false, hostname, reason: "BLOCKED_HOSTNAME" };
  }

  if (isExactLocalFixtureHost(hostname, config)) {
    return { ok: true, hostname };
  }

  if (BLOCKED_EXACT_HOSTNAMES.has(hostname)) {
    return { ok: false, hostname, reason: "BLOCKED_HOSTNAME" };
  }

  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) {
      return { ok: false, hostname, reason: "BLOCKED_HOSTNAME" };
    }
  }

  // Literal IPs are checked by the IP policy after parsing.
  if (isIP(hostname.replace(/^\[|\]$/g, "")) !== 0) {
    return { ok: true, hostname };
  }

  // Single-label hostnames (no dot) are treated as internal aliases.
  if (!hostname.includes(".")) {
    return { ok: false, hostname, reason: "BLOCKED_HOSTNAME" };
  }

  return { ok: true, hostname };
}
