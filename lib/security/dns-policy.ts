import "server-only";

import { lookup as defaultLookup } from "node:dns/promises";
import {
  getScannerConfig,
  type ScannerConfig,
} from "@/lib/config/scanner-config";
import { classifyIpAddress } from "@/lib/security/ip-policy";

export type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

export type DnsResolutionResult =
  | { ok: true; addresses: string[] }
  | { ok: false; reason: "DNS_RESOLUTION_FAILED" | "BLOCKED_IP"; addresses: string[] };

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("DNS_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolves every address for a hostname and rejects the target if any answer
 * is non-public. Mixed public/private answers are rejected.
 */
export async function resolveAndValidateHostname(
  hostname: string,
  options: {
    config?: ScannerConfig;
    lookupFn?: DnsLookupFn;
  } = {},
): Promise<DnsResolutionResult> {
  const config = options.config ?? getScannerConfig();
  const lookupFn = options.lookupFn ?? defaultLookup;

  try {
    const answers = await withTimeout(
      lookupFn(hostname, { all: true, verbatim: true }) as Promise<
        Array<{ address: string; family: number }>
      >,
      config.dnsTimeoutMs,
    );

    if (!answers || answers.length === 0) {
      return { ok: false, reason: "DNS_RESOLUTION_FAILED", addresses: [] };
    }

    const addresses = answers.map((answer) => answer.address);
    for (const address of addresses) {
      const classification = classifyIpAddress(address);
      if (!classification.ok) {
        return { ok: false, reason: "BLOCKED_IP", addresses };
      }
    }

    return { ok: true, addresses };
  } catch {
    return { ok: false, reason: "DNS_RESOLUTION_FAILED", addresses: [] };
  }
}
