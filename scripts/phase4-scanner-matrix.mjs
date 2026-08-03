/**
 * Phase 4 API matrix against a running Next.js server with local fixture mode.
 * Starts its own fixture server on 127.0.0.1:3100.
 *
 * Prerequisite: Next.js app running with:
 *   ALLOW_LOCAL_FIXTURE=true
 *   LOCAL_FIXTURE_HOST=127.0.0.1
 *   LOCAL_FIXTURE_PORT=3100
 *   NODE_ENV!=production
 */
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base = process.env.PHASE4_APP_URL ?? "http://localhost:3000";
const allTrue = {
  consoleErrors: true,
  networkErrors: true,
  brokenImages: true,
  mobileLayout: true,
  accessibility: true,
  screenshots: false,
};

const results = [];

async function check(label, fn) {
  try {
    const ok = await fn();
    results.push({ label, ok: Boolean(ok) });
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error: String(error) });
    console.log(`FAIL ${label}: ${error}`);
  }
}

async function post(body, { raw = false } = {}) {
  const response = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { response, json };
}

const fixture = await startLocalFixtureServer(3100);

try {
  await check("malformed JSON", async () => {
    const { response, json } = await post("{", { raw: true });
    return response.status === 400 && json?.code === "INVALID_JSON";
  });

  await check("localhost blocked by default when fixture disabled path", async () => {
    // This request hits the running app. If fixture mode is enabled on the app,
    // localhost hostname is still blocked by hostname policy.
    const { response, json } = await post({
      url: "http://localhost:3100/ok",
      options: allTrue,
    });
    return response.status === 403 && typeof json?.code === "string";
  });

  await check("127.0.0.1 without fixture would be blocked; with fixture succeeds", async () => {
    const { response, json } = await post({
      url: `${fixture.origin}/ok`,
      options: allTrue,
    });
    return (
      response.status === 200 &&
      json?.success === true &&
      json?.mode === "BASIC_SCAN" &&
      json?.targetWasContacted === true &&
      json?.diagnostics?.status === "NOT_RUN" &&
      Array.isArray(json?.diagnostics?.issues) &&
      json.diagnostics.issues.length === 0
    );
  });

  await check("credentials rejected", async () => {
    const { response, json } = await post({
      url: "https://user:pass@example.com",
      options: allTrue,
    });
    return response.status === 400 && json?.code === "VALIDATION_ERROR";
  });

  await check("unsupported port rejected", async () => {
    const { response, json } = await post({
      url: "https://example.com:8080",
      options: allTrue,
    });
    return response.status === 403 && json?.code === "UNSUPPORTED_PORT";
  });

  await check("oversized payload", async () => {
    const huge = "x".repeat(20_000);
    const response = await fetch(`${base}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://example.com/${huge}`, options: allTrue }),
    });
    const json = await response.json().catch(() => null);
    return (
      (response.status === 413 && json?.code === "PAYLOAD_TOO_LARGE") ||
      (response.status === 400 && json?.code === "VALIDATION_ERROR")
    );
  });
} finally {
  await fixture.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(`--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`);
process.exit(failed.length ? 1 : 0);
