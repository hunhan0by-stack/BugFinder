import "server-only";

import {
  getScannerConfig,
  isLocalFixtureAllowed,
  type ScannerConfig,
} from "@/lib/config/scanner-config";
import {
  resolveAndValidateHostname,
  type DnsLookupFn,
} from "@/lib/security/dns-policy";
import { evaluateHostname, normalizeHostname } from "@/lib/security/hostname-policy";
import { classifyIpAddress } from "@/lib/security/ip-policy";
import { evaluatePort } from "@/lib/security/port-policy";
import { ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import { isIP } from "node:net";

export type ValidatedTarget = {
  href: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: number;
  addresses: string[];
};

function throwForHostnameFailure(hostname: string): never {
  throw new ScanError({
    code: "BLOCKED_HOSTNAME",
    httpStatus: 403,
    publicMessage: SCAN_ERROR_MESSAGES.BLOCKED_HOSTNAME,
    details: { hostname, category: "BLOCKED_HOSTNAME" },
  });
}

function throwForPortFailure(port: number): never {
  throw new ScanError({
    code: "UNSUPPORTED_PORT",
    httpStatus: 403,
    publicMessage: SCAN_ERROR_MESSAGES.UNSUPPORTED_PORT,
    details: { port, category: "UNSUPPORTED_PORT" },
  });
}

function throwForIpFailure(hostname: string): never {
  throw new ScanError({
    code: "BLOCKED_IP",
    httpStatus: 403,
    publicMessage: SCAN_ERROR_MESSAGES.BLOCKED_IP,
    details: { hostname, category: "BLOCKED_IP" },
  });
}

/**
 * Full pre-navigation target policy: protocol already validated by Zod,
 * then hostname, port, literal IP, and DNS for hostnames.
 */
export async function validateScanTarget(
  rawUrl: string,
  options: {
    config?: ScannerConfig;
    lookupFn?: DnsLookupFn;
  } = {},
): Promise<ValidatedTarget> {
  const config = options.config ?? getScannerConfig();

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ScanError({
      code: "INVALID_URL",
      httpStatus: 400,
      publicMessage: SCAN_ERROR_MESSAGES.INVALID_URL,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScanError({
      code: "INVALID_URL",
      httpStatus: 400,
      publicMessage: SCAN_ERROR_MESSAGES.INVALID_URL,
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new ScanError({
      code: "URL_CREDENTIALS_NOT_ALLOWED",
      httpStatus: 400,
      publicMessage: SCAN_ERROR_MESSAGES.URL_CREDENTIALS_NOT_ALLOWED,
    });
  }

  // Fragments are never sent to the server; strip them from the scan target.
  parsed.hash = "";

  const hostnameResult = evaluateHostname(parsed.hostname, config);
  if (!hostnameResult.ok) {
    throwForHostnameFailure(hostnameResult.hostname);
  }

  const hostname = hostnameResult.hostname;
  const portResult = evaluatePort(
    parsed.protocol,
    parsed.port,
    hostname,
    config,
  );
  if (!portResult.ok) {
    throwForPortFailure(portResult.port);
  }

  const literalAddress = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(literalAddress);
  let addresses: string[];

  const exactFixtureTarget =
    isLocalFixtureAllowed(config) &&
    hostname === normalizeHostname(config.localFixtureHost) &&
    portResult.port === config.localFixturePort;

  if (family !== 0) {
    if (!exactFixtureTarget) {
      const classification = classifyIpAddress(literalAddress);
      if (!classification.ok) {
        throwForIpFailure(hostname);
      }
      addresses = [classification.address];
    } else {
      addresses = [literalAddress];
    }
  } else {
    const dns = await resolveAndValidateHostname(hostname, {
      config,
      lookupFn: options.lookupFn,
    });
    if (!dns.ok) {
      if (dns.reason === "BLOCKED_IP") {
        throwForIpFailure(hostname);
      }
      throw new ScanError({
        code: "DNS_RESOLUTION_FAILED",
        httpStatus: 502,
        publicMessage: SCAN_ERROR_MESSAGES.DNS_RESOLUTION_FAILED,
        details: { hostname, category: "DNS_RESOLUTION_FAILED" },
      });
    }
    addresses = dns.addresses;
  }

  // Rebuild a normalized href with the cleaned hostname and without a fragment.
  const normalized = new URL(parsed.toString());
  normalized.hostname = hostname.includes(":") ? hostname : normalizeHostname(hostname);
  if (parsed.port) {
    normalized.port = String(portResult.port);
  }
  normalized.hash = "";

  return {
    href: normalized.toString(),
    protocol: parsed.protocol,
    hostname,
    port: portResult.port,
    addresses,
  };
}
