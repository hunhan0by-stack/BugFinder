import "server-only";

import type { ScannerConfig } from "@/lib/config/scanner-config";
import { isLocalFixtureAllowed } from "@/lib/config/scanner-config";
import {
  resolveAndValidateHostname,
  type DnsLookupFn,
} from "@/lib/security/dns-policy";
import { evaluateHostname, normalizeHostname } from "@/lib/security/hostname-policy";
import { classifyIpAddress } from "@/lib/security/ip-policy";
import { evaluatePort } from "@/lib/security/port-policy";
import { ScanError, SCAN_ERROR_MESSAGES } from "@/lib/scanner/scan-errors";
import type { BlockedRequestSummary } from "@/types/scan";
import { isIP } from "node:net";
import type { BrowserContext, Request, Route } from "playwright";

export type RequestGuardStats = {
  inspectedRequestCount: number;
  uniqueHostCount: number;
  blockedRequestCount: number;
  blockedRequests: BlockedRequestSummary[];
  redirectCount: number;
};

type GuardDecision =
  | { allow: true }
  | {
      allow: false;
      reason: string;
      failScan: boolean;
      code?: "UNSAFE_REDIRECT" | "REDIRECT_LIMIT_EXCEEDED" | "RESOURCE_LIMIT_EXCEEDED" | "BLOCKED_TARGET";
    };

const LOCAL_SCHEMES = new Set(["about:", "blob:", "data:"]);

export class RequestGuard {
  readonly stats: RequestGuardStats = {
    inspectedRequestCount: 0,
    uniqueHostCount: 0,
    blockedRequestCount: 0,
    blockedRequests: [],
    redirectCount: 0,
  };

  /**
   * Request objects intentionally aborted by scanner policy. Diagnostic
   * collectors must check this WeakSet so security aborts are not reported as
   * frontend REQUEST_FAILED issues.
   */
  readonly intentionalAborts = new WeakSet<Request>();

  private readonly hosts = new Set<string>();
  private readonly dnsCache = new Map<string, Promise<string[]>>();
  private failure: ScanError | null = null;
  private readonly config: ScannerConfig;
  private readonly lookupFn?: DnsLookupFn;

  constructor(config: ScannerConfig, lookupFn?: DnsLookupFn) {
    this.config = config;
    this.lookupFn = lookupFn;
  }

  getFailure(): ScanError | null {
    return this.failure;
  }

  async attach(context: BrowserContext): Promise<void> {
    await context.route("**/*", async (route) => {
      await this.handleRoute(route);
    });
  }

  private recordBlocked(
    hostname: string,
    reason: string,
    resourceType: string,
  ): void {
    this.stats.blockedRequestCount += 1;
    if (this.stats.blockedRequests.length < this.config.maxBlockedRequestRecords) {
      this.stats.blockedRequests.push({ hostname, reason, resourceType });
    }
  }

  private fail(
    code: ScanError["code"],
    publicMessage: string,
    hostname?: string,
  ): void {
    if (!this.failure) {
      this.failure = new ScanError({
        code,
        httpStatus:
          code === "RESOURCE_LIMIT_EXCEEDED" ||
          code === "REDIRECT_LIMIT_EXCEEDED" ||
          code === "UNSAFE_REDIRECT" ||
          code === "BLOCKED_TARGET"
            ? 403
            : 500,
        publicMessage,
        details: hostname ? { hostname, category: code } : { category: code },
      });
    }
  }

  private async resolveHosts(hostname: string): Promise<string[]> {
    const cached = this.dnsCache.get(hostname);
    if (cached) {
      return cached;
    }

    const pending = (async () => {
      const literal = hostname.replace(/^\[|\]$/g, "");
      if (isIP(literal) !== 0) {
        const exactFixtureHost =
          isLocalFixtureAllowed(this.config) &&
          hostname === normalizeHostname(this.config.localFixtureHost);
        if (!exactFixtureHost) {
          const classification = classifyIpAddress(literal);
          if (!classification.ok) {
            throw new Error("BLOCKED_IP");
          }
          return [classification.address];
        }
        return [literal];
      }

      const dns = await resolveAndValidateHostname(hostname, {
        config: this.config,
        lookupFn: this.lookupFn,
      });
      if (!dns.ok) {
        throw new Error(dns.reason);
      }
      return dns.addresses;
    })();

    this.dnsCache.set(hostname, pending);
    try {
      return await pending;
    } catch (error) {
      this.dnsCache.delete(hostname);
      throw error;
    }
  }

  private async evaluateRequest(request: Request): Promise<GuardDecision> {
    const urlText = request.url();
    let parsed: URL;
    try {
      parsed = new URL(urlText);
    } catch {
      return {
        allow: false,
        reason: "INVALID_URL",
        failScan: request.isNavigationRequest(),
        code: "BLOCKED_TARGET",
      };
    }

    if (LOCAL_SCHEMES.has(parsed.protocol)) {
      if (request.isNavigationRequest() && parsed.protocol !== "about:") {
        return {
          allow: false,
          reason: "UNSUPPORTED_SCHEME",
          failScan: true,
          code: "BLOCKED_TARGET",
        };
      }
      return { allow: true };
    }

    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return {
        allow: false,
        reason: "WEBSOCKET_BLOCKED",
        failScan: false,
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        allow: false,
        reason: "UNSUPPORTED_SCHEME",
        failScan: request.isNavigationRequest(),
        code: "BLOCKED_TARGET",
      };
    }

    if (parsed.username || parsed.password) {
      return {
        allow: false,
        reason: "CREDENTIALS",
        failScan: request.isNavigationRequest(),
        code: "BLOCKED_TARGET",
      };
    }

    const resourceType = request.resourceType();
    if (resourceType === "media") {
      return {
        allow: false,
        reason: "MEDIA_BLOCKED",
        failScan: false,
      };
    }

    this.stats.inspectedRequestCount += 1;
    if (this.stats.inspectedRequestCount > this.config.maxRequests) {
      return {
        allow: false,
        reason: "REQUEST_LIMIT",
        failScan: true,
        code: "RESOURCE_LIMIT_EXCEEDED",
      };
    }

    const hostnameResult = evaluateHostname(parsed.hostname, this.config);
    if (!hostnameResult.ok) {
      return {
        allow: false,
        reason: "BLOCKED_HOSTNAME",
        failScan: request.isNavigationRequest(),
        code: request.isNavigationRequest() ? "UNSAFE_REDIRECT" : "BLOCKED_TARGET",
      };
    }

    const hostname = hostnameResult.hostname;
    if (!this.hosts.has(hostname)) {
      if (this.hosts.size >= this.config.maxUniqueHosts) {
        return {
          allow: false,
          reason: "HOST_LIMIT",
          failScan: true,
          code: "RESOURCE_LIMIT_EXCEEDED",
        };
      }
      this.hosts.add(hostname);
      this.stats.uniqueHostCount = this.hosts.size;
    }

    const portResult = evaluatePort(
      parsed.protocol,
      parsed.port,
      hostname,
      this.config,
    );
    if (!portResult.ok) {
      return {
        allow: false,
        reason: "UNSUPPORTED_PORT",
        failScan: request.isNavigationRequest(),
        code: request.isNavigationRequest() ? "UNSAFE_REDIRECT" : "BLOCKED_TARGET",
      };
    }

    try {
      // Main-frame navigations always re-resolve; subresources may use the
      // short per-scan cache inside resolveHosts.
      if (request.isNavigationRequest()) {
        this.dnsCache.delete(hostname);
      }
      await this.resolveHosts(hostname);
    } catch {
      return {
        allow: false,
        reason: "BLOCKED_IP",
        failScan: request.isNavigationRequest(),
        code: request.isNavigationRequest() ? "UNSAFE_REDIRECT" : "BLOCKED_TARGET",
      };
    }

    if (request.isNavigationRequest()) {
      const redirects = request.redirectedFrom();
      if (redirects) {
        this.stats.redirectCount += 1;
        if (this.stats.redirectCount > this.config.maxRedirects) {
          return {
            allow: false,
            reason: "REDIRECT_LIMIT",
            failScan: true,
            code: "REDIRECT_LIMIT_EXCEEDED",
          };
        }
      }
    }

    return { allow: true };
  }

  private async handleRoute(route: Route): Promise<void> {
    if (this.failure) {
      const request = route.request();
      this.intentionalAborts.add(request);
      await route.abort("blockedbyclient");
      return;
    }

    const request = route.request();
    const decision = await this.evaluateRequest(request);

    if (decision.allow) {
      await route.continue();
      return;
    }

    let hostname = "unknown";
    try {
      hostname = new URL(request.url()).hostname || "unknown";
    } catch {
      hostname = "unknown";
    }

    this.recordBlocked(hostname, decision.reason, request.resourceType());

    if (decision.failScan && decision.code) {
      const message =
        decision.code === "RESOURCE_LIMIT_EXCEEDED" &&
        decision.reason === "HOST_LIMIT"
          ? "The page attempted to contact too many different hosts for this basic scan."
          : decision.code === "RESOURCE_LIMIT_EXCEEDED"
            ? SCAN_ERROR_MESSAGES.RESOURCE_LIMIT_EXCEEDED
            : decision.code === "REDIRECT_LIMIT_EXCEEDED"
              ? SCAN_ERROR_MESSAGES.REDIRECT_LIMIT_EXCEEDED
              : decision.code === "UNSAFE_REDIRECT"
                ? SCAN_ERROR_MESSAGES.UNSAFE_REDIRECT
                : SCAN_ERROR_MESSAGES.BLOCKED_TARGET;

      this.fail(decision.code, message, hostname);
    }

    this.intentionalAborts.add(request);
    await route.abort("blockedbyclient");
  }
}
