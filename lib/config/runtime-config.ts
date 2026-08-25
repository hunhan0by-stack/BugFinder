import "server-only";

function parseInteger(
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
      `Invalid runtime configuration: ${name} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(`Invalid runtime configuration: ${name} must be true or false.`);
}

export type EnvironmentClass = "production" | "development" | "test";

export type RuntimeConfig = {
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitMaxKeys: number;
  trustProxy: boolean;
  artifactRetentionHours: number;
  maxArtifactStorageBytes: number;
  cleanupMaxDirectories: number;
  cleanupMinIntervalMs: number;
  environmentClass: EnvironmentClass;
  appVersion: string;
};

function environmentClassFromEnv(env: NodeJS.ProcessEnv): EnvironmentClass {
  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "test") return "test";
  return "development";
}

let cachedConfig: RuntimeConfig | null = null;

/**
 * Server-only HTTP, retention, and process settings. Never import from client
 * components.
 */
export function getRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  if (cachedConfig && env === process.env) {
    return cachedConfig;
  }

  const environmentClass = environmentClassFromEnv(env);
  const defaultMaxRequests = environmentClass === "production" ? 10 : 200;

  const config: RuntimeConfig = {
    rateLimitWindowMs: parseInteger(
      env.SCAN_RATE_LIMIT_WINDOW_MS,
      60_000,
      "SCAN_RATE_LIMIT_WINDOW_MS",
      1_000,
      3_600_000,
    ),
    rateLimitMaxRequests: parseInteger(
      env.SCAN_RATE_LIMIT_MAX_REQUESTS,
      defaultMaxRequests,
      "SCAN_RATE_LIMIT_MAX_REQUESTS",
      1,
      1_000,
    ),
    rateLimitMaxKeys: parseInteger(
      env.SCAN_RATE_LIMIT_MAX_KEYS,
      1_000,
      "SCAN_RATE_LIMIT_MAX_KEYS",
      10,
      10_000,
    ),
    trustProxy: parseBoolean(env.SCAN_TRUST_PROXY, false, "SCAN_TRUST_PROXY"),
    artifactRetentionHours: parseInteger(
      env.SCAN_ARTIFACT_RETENTION_HOURS,
      24,
      "SCAN_ARTIFACT_RETENTION_HOURS",
      0,
      720,
    ),
    maxArtifactStorageBytes: parseInteger(
      env.SCAN_MAX_ARTIFACT_STORAGE_BYTES,
      524_288_000,
      "SCAN_MAX_ARTIFACT_STORAGE_BYTES",
      0,
      50_000_000_000,
    ),
    cleanupMaxDirectories: parseInteger(
      env.SCAN_CLEANUP_MAX_DIRECTORIES,
      200,
      "SCAN_CLEANUP_MAX_DIRECTORIES",
      1,
      2_000,
    ),
    cleanupMinIntervalMs: parseInteger(
      env.SCAN_CLEANUP_MIN_INTERVAL_MS,
      60_000,
      "SCAN_CLEANUP_MIN_INTERVAL_MS",
      1_000,
      3_600_000,
    ),
    environmentClass,
    appVersion: "0.1.0",
  };

  if (env === process.env) {
    cachedConfig = config;
  }

  return config;
}

export function resetRuntimeConfigCache(): void {
  cachedConfig = null;
}
