/**
 * Phase 8 API matrix against a running Next.js server with local fixture mode.
 * Starts its own fixture server on 127.0.0.1:3100.
 *
 * Prerequisite: Next.js app running with:
 *   ALLOW_LOCAL_FIXTURE=true
 *   LOCAL_FIXTURE_HOST=127.0.0.1
 *   LOCAL_FIXTURE_PORT=3100
 *   NODE_ENV!=production
 */
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
  process.env.PHASE8_APP_URL ??
  process.env.PHASE7_APP_URL ??
  process.env.PHASE4_APP_URL ??
  "http://localhost:3000";

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

const off = {
  consoleErrors: false,
  networkErrors: false,
  brokenImages: false,
  mobileLayout: false,
  accessibility: false,
  screenshots: false,
  safeInteractions: false,
  issueEvidence: false,
  reversibleWorkflows: false,
};

const fixture = await startLocalFixtureServer(3100);

try {
  await check("legacy request leaves Phase 8 options NOT_REQUESTED", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/reversible-checkbox`,
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
      json?.diagnostics?.capabilities?.issueEvidence === "NOT_REQUESTED" &&
      json?.diagnostics?.capabilities?.reversibleWorkflows === "NOT_REQUESTED" &&
      json?.issueEvidenceAnalysis?.artifactCount === 0 &&
      json?.reversibleWorkflowAnalysis?.status === "NOT_REQUESTED"
    );
  });

  await check("reversible checkbox API succeeds", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/reversible-checkbox`,
      options: {
        ...off,
        safeInteractions: true,
        reversibleWorkflows: true,
      },
    });
    return (
      response.status === 200 &&
      json?.reversibleWorkflowAnalysis?.successfulReversalCount >= 1 &&
      !(json?.diagnostics?.issues ?? []).some(
        (issue) => issue.type === "STATE_TRANSITION_ISSUE",
      )
    );
  });

  await check("failed reversal API produces STATE_TRANSITION_ISSUE", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/failed-reversal`,
      options: {
        ...off,
        safeInteractions: true,
        reversibleWorkflows: true,
      },
    });
    return (
      response.status === 200 &&
      (json?.diagnostics?.issues ?? []).some(
        (issue) =>
          issue.type === "STATE_TRANSITION_ISSUE" &&
          issue.metadata?.subtype === "FAILED_TO_RETURN_TO_BASELINE",
      )
    );
  });

  await check("issueEvidence API attaches evidenceIds on obstructed", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/obstructed`,
      options: {
        ...off,
        safeInteractions: true,
        issueEvidence: true,
      },
    });
    const obstructed = (json?.diagnostics?.issues ?? []).find(
      (issue) => issue.type === "OBSTRUCTED_CONTROL",
    );
    return (
      response.status === 200 &&
      json?.issueEvidenceAnalysis?.artifactCount > 0 &&
      Array.isArray(obstructed?.evidenceIds) &&
      obstructed.evidenceIds.length > 0
    );
  });

  await check("secret privacy API omits PHASE8_SECRET_* strings", async () => {
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/secret-privacy?secret=PHASE8_QUERY_SECRET`,
      options: {
        ...off,
        safeInteractions: true,
        reversibleWorkflows: true,
        issueEvidence: true,
      },
    });
    const serialized = JSON.stringify(json);
    return (
      response.status === 200 &&
      !serialized.includes("PHASE8_SECRET_BUTTON_TEXT") &&
      !serialized.includes("PHASE8_SECRET_FORM_VALUE") &&
      !serialized.includes("PHASE8_PASSWORD_SECRET") &&
      !serialized.includes("PHASE8_QUERY_SECRET")
    );
  });

  await check("second-network API leaves fixture mutation counter at 0", async () => {
    const before = fixture.counters.interactionMutation;
    const { response, json } = await postScan({
      url: `${fixture.origin}/phase8/second-network`,
      options: {
        ...off,
        safeInteractions: true,
        reversibleWorkflows: true,
      },
    });
    return (
      response.status === 200 &&
      fixture.counters.interactionMutation === before &&
      json?.reversibleWorkflowAnalysis?.skippedNetworkCount >= 1
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
