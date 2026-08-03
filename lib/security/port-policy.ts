import "server-only";

import {
  getScannerConfig,
  isLocalFixtureAllowed,
  type ScannerConfig,
} from "@/lib/config/scanner-config";
import { normalizeHostname } from "@/lib/security/hostname-policy";

export type PortPolicyResult =
  | { ok: true; port: number }
  | { ok: false; port: number; reason: "UNSUPPORTED_PORT" };

export function resolveTargetPort(
  protocol: string,
  portText: string,
): number | null {
  if (portText === "") {
    if (protocol === "http:") return 80;
    if (protocol === "https:") return 443;
    return null;
  }

  if (!/^\d+$/.test(portText)) {
    return null;
  }

  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

export function evaluatePort(
  protocol: string,
  portText: string,
  hostname: string,
  config: ScannerConfig = getScannerConfig(),
): PortPolicyResult {
  const port = resolveTargetPort(protocol, portText);
  if (port === null) {
    return { ok: false, port: 0, reason: "UNSUPPORTED_PORT" };
  }

  if (config.allowedPorts.includes(port)) {
    return { ok: true, port };
  }

  const normalizedHost = normalizeHostname(hostname);
  if (
    isLocalFixtureAllowed(config) &&
    normalizedHost === normalizeHostname(config.localFixtureHost) &&
    port === config.localFixturePort
  ) {
    return { ok: true, port };
  }

  return { ok: false, port, reason: "UNSUPPORTED_PORT" };
}
