import "server-only";

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Invalid scanner configuration: ${name} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(
    "Invalid scanner configuration: ALLOW_LOCAL_FIXTURE must be true or false.",
  );
}

function parsePortList(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === "") {
    return [80, 443];
  }
  const ports = raw.split(",").map((part) => Number(part.trim()));
  if (
    ports.length === 0 ||
    ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error(
      "Invalid scanner configuration: SCAN_ALLOWED_PORTS must be a comma-separated list of ports.",
    );
  }
  return ports;
}

export type ScannerConfig = {
  pageTimeoutMs: number;
  totalTimeoutMs: number;
  screenshotTimeoutMs: number;
  maxRedirects: number;
  maxRequests: number;
  maxUniqueHosts: number;
  maxBlockedRequestRecords: number;
  maxConcurrentScans: number;
  allowedPorts: number[];
  maxFullPageHeight: number;
  dnsTimeoutMs: number;
  stabilizationMs: number;
  allowLocalFixture: boolean;
  localFixtureHost: string;
  localFixturePort: number;
  maxRequestBodyBytes: number;
};

let cachedConfig: ScannerConfig | null = null;

/**
 * Reads scanner environment once per process. Never import this module from
 * client components — it is server-only.
 */
export function getScannerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ScannerConfig {
  if (cachedConfig && env === process.env) {
    return cachedConfig;
  }

  const localFixtureHost = (env.LOCAL_FIXTURE_HOST ?? "127.0.0.1").trim();
  if (localFixtureHost === "") {
    throw new Error(
      "Invalid scanner configuration: LOCAL_FIXTURE_HOST must not be empty.",
    );
  }

  const config: ScannerConfig = {
    pageTimeoutMs: parsePositiveInt(
      env.SCAN_PAGE_TIMEOUT_MS,
      30_000,
      "SCAN_PAGE_TIMEOUT_MS",
      1_000,
      300_000,
    ),
    totalTimeoutMs: parsePositiveInt(
      env.SCAN_TOTAL_TIMEOUT_MS,
      90_000,
      "SCAN_TOTAL_TIMEOUT_MS",
      5_000,
      600_000,
    ),
    screenshotTimeoutMs: parsePositiveInt(
      env.SCAN_SCREENSHOT_TIMEOUT_MS,
      15_000,
      "SCAN_SCREENSHOT_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    maxRedirects: parsePositiveInt(
      env.SCAN_MAX_REDIRECTS,
      5,
      "SCAN_MAX_REDIRECTS",
      0,
      20,
    ),
    maxRequests: parsePositiveInt(
      env.SCAN_MAX_REQUESTS,
      250,
      "SCAN_MAX_REQUESTS",
      10,
      5_000,
    ),
    maxUniqueHosts: parsePositiveInt(
      env.SCAN_MAX_UNIQUE_HOSTS,
      40,
      "SCAN_MAX_UNIQUE_HOSTS",
      1,
      500,
    ),
    maxBlockedRequestRecords: parsePositiveInt(
      env.SCAN_MAX_BLOCKED_REQUEST_RECORDS,
      20,
      "SCAN_MAX_BLOCKED_REQUEST_RECORDS",
      0,
      200,
    ),
    maxConcurrentScans: parsePositiveInt(
      env.SCAN_MAX_CONCURRENT_SCANS,
      1,
      "SCAN_MAX_CONCURRENT_SCANS",
      1,
      10,
    ),
    allowedPorts: parsePortList(env.SCAN_ALLOWED_PORTS),
    maxFullPageHeight: parsePositiveInt(
      env.SCAN_MAX_FULL_PAGE_HEIGHT,
      20_000,
      "SCAN_MAX_FULL_PAGE_HEIGHT",
      1_000,
      100_000,
    ),
    dnsTimeoutMs: parsePositiveInt(
      env.SCAN_DNS_TIMEOUT_MS,
      5_000,
      "SCAN_DNS_TIMEOUT_MS",
      500,
      30_000,
    ),
    stabilizationMs: parsePositiveInt(
      env.SCAN_STABILIZATION_MS,
      800,
      "SCAN_STABILIZATION_MS",
      0,
      5_000,
    ),
    allowLocalFixture: parseBoolean(env.ALLOW_LOCAL_FIXTURE, false),
    localFixtureHost,
    localFixturePort: parsePositiveInt(
      env.LOCAL_FIXTURE_PORT,
      3100,
      "LOCAL_FIXTURE_PORT",
      1,
      65535,
    ),
    maxRequestBodyBytes: parsePositiveInt(
      env.SCAN_MAX_REQUEST_BODY_BYTES,
      16_384,
      "SCAN_MAX_REQUEST_BODY_BYTES",
      1_024,
      1_048_576,
    ),
  };

  if (config.totalTimeoutMs < config.pageTimeoutMs) {
    throw new Error(
      "Invalid scanner configuration: SCAN_TOTAL_TIMEOUT_MS must be greater than or equal to SCAN_PAGE_TIMEOUT_MS.",
    );
  }

  if (env === process.env) {
    cachedConfig = config;
  }

  return config;
}

export function resetScannerConfigCache(): void {
  cachedConfig = null;
}

/**
 * Local fixture access is never available in production, even if the
 * environment flag is mistakenly set to true.
 */
export function isLocalFixtureAllowed(config: ScannerConfig): boolean {
  return config.allowLocalFixture && process.env.NODE_ENV !== "production";
}
