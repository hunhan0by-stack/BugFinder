/**
 * Phase 7 API matrix against a running Next.js server with local fixture mode.
 * Starts its own fixture server on 127.0.0.1:3100.
 *
 * Prerequisite: Next.js app running with:
 *   ALLOW_LOCAL_FIXTURE=true
 *   LOCAL_FIXTURE_HOST=127.0.0.1
 *   LOCAL_FIXTURE_PORT=3100
 *   NODE_ENV!=production
 */
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base = process.env.PHASE7_APP_URL ?? process.env.PHASE4_APP_URL ?? "http://localhost:3000";

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

async function postScan(body) {
  const response = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

const fixture = await startLocalFixtureServer(3100);

try {
  await check("legacy request without safeInteractions defaults off", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/safe-toggle`,
      options: {
        consoleErrors: true,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
      },
    });
    return (
      response.status === 200 &&
      json?.diagnostics?.capabilities?.safeInteractions === "NOT_REQUESTED" &&
      json?.safeInteractionAnalysis?.actualClickCount === 0
    );
  });

  await check("safeInteractions=false is NOT_REQUESTED", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/dead-click`,
      options: {
        consoleErrors: true,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: false,
      },
    });
    return (
      response.status === 200 &&
      json?.diagnostics?.capabilities?.safeInteractions === "NOT_REQUESTED" &&
      !(json?.diagnostics?.issues ?? []).some(
        (issue) => issue.type === "DEAD_CLICK",
      )
    );
  });

  await check("safe toggle API produces responsive clicks", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/safe-toggle`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    const analysis = json?.safeInteractionAnalysis;
    return (
      response.status === 200 &&
      analysis?.status === "COMPLETE" &&
      analysis?.actualClickCount >= 1 &&
      analysis?.responsiveControlCount >= 1
    );
  });

  await check("dead-click API produces DEAD_CLICK without target text", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/dead-click`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    const serialized = JSON.stringify(json);
    return (
      response.status === 200 &&
      (json?.diagnostics?.issues ?? []).some(
        (issue) => issue.type === "DEAD_CLICK" && issue.profile === "DESKTOP",
      ) &&
      !serialized.includes("No handler")
    );
  });

  await check("network click API skips without DEAD_CLICK", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/network-click`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    return (
      response.status === 200 &&
      json?.safeInteractionAnalysis?.skippedNetworkCount >= 1 &&
      !(json?.diagnostics?.issues ?? []).some(
        (issue) => issue.type === "DEAD_CLICK",
      )
    );
  });

  await check("persistent busy API produces FORM_STATE_ISSUE", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/persistent-busy`,
      options: {
        consoleErrors: false,
        networkErrors: false,
        brokenImages: false,
        mobileLayout: false,
        accessibility: false,
        screenshots: false,
        safeInteractions: true,
      },
    });
    return (
      response.status === 200 &&
      (json?.diagnostics?.issues ?? []).some(
        (issue) =>
          issue.type === "FORM_STATE_ISSUE" &&
          issue.metadata?.subtype === "PERSISTENT_BUSY_STATE",
      )
    );
  });
} finally {
  await fixture.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
