/**
 * Phase 8 browser UI matrix.
 * Requires Next.js on PHASE8_APP_URL (default http://localhost:3000) with:
 *   ALLOW_LOCAL_FIXTURE=true
 *   LOCAL_FIXTURE_HOST=127.0.0.1
 *   LOCAL_FIXTURE_PORT=3100
 *   NODE_ENV!=production
 * Starts its own fixture server on 127.0.0.1:3100.
 */
import { chromium } from "playwright";
import { prepareScanForm } from "./helpers/prepare-scan-form.mjs";
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

async function runScan(page, url, optionIds) {
  await prepareScanForm(page, url, optionIds);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/scan") && response.status() === 200,
      { timeout: 180_000 },
    ),
    page
      .getByRole("button", {
        name: /scan website|running basic scan|opening website/i,
      })
      .click(),
  ]);
  await page.waitForSelector("#basic-scan-report-heading", {
    timeout: 180_000,
  });
}

function hasNoForbiddenClaims(text) {
  const lower = text.toLowerCase();
  const stripped = lower
    .replace(/this does not prove that every (?:control|workflow) works[^.]*\./g, " ")
    .replace(/does not prove that every (?:control|workflow) works[^.]*\./g, " ");
  return (
    !/\ball workflows work\b/.test(stripped) &&
    !/\beverything passed\b/.test(stripped) &&
    !/\bno bugs exist\b/.test(stripped) &&
    !/\ball buttons work\b/.test(stripped) &&
    !/\bevery control is functional\b/.test(stripped) &&
    !/\bevery control works\b/.test(stripped) &&
    !/\bevery workflow works\b/.test(stripped)
  );
}

function hasNoAbsolutePathLeak(text) {
  return (
    !/[A-Za-z]:\\Users\\/i.test(text) &&
    !/\\\\[A-Za-z0-9._-]+\\/i.test(text) &&
    !/\/Users\/[^/\s]+\/OneDrive/i.test(text) &&
    !text.includes("scan-results\\")
  );
}

const fixture = await startLocalFixtureServer(3100);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const contactedHosts = new Set();
page.on("request", (request) => {
  try {
    const hostname = new URL(request.url()).hostname;
    contactedHosts.add(hostname);
  } catch {
    // ignore
  }
});

try {
  await check("Phase 8 options and warnings are visible", async () => {
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    const text = await page.locator("main").innerText();
    const evidenceBox = page.locator("#scan-option-issueEvidence");
    const workflowBox = page.locator("#scan-option-reversibleWorkflows");
    return (
      Boolean(response?.ok()) &&
      (await evidenceBox.count()) === 1 &&
      (await workflowBox.count()) === 1 &&
      (await evidenceBox.evaluate((el) => el instanceof HTMLInputElement && el.type === "checkbox")) &&
      (await workflowBox.evaluate((el) => el instanceof HTMLInputElement && el.type === "checkbox")) &&
      /issue-specific evidence/i.test(text) &&
      /reversible workflow checks/i.test(text) &&
      /Evidence may include visible page content/i.test(text) &&
      /Network access, navigation, form submission/i.test(text)
    );
  });

  await check("reversibleWorkflows enables safeInteractions dependency", async () => {
    await page.getByRole("button", { name: /clear all/i }).click();
    await page.locator("#scan-option-reversibleWorkflows").check();
    const safeOn = await page.locator("#scan-option-safeInteractions").isChecked();
    const workflowOn = await page
      .locator("#scan-option-reversibleWorkflows")
      .isChecked();
    const text = await page.locator("main").innerText();
    return (
      safeOn &&
      workflowOn &&
      /safe interaction checks stay selected/i.test(text)
    );
  });

  await check("select all includes Phase 8 options", async () => {
    await page.getByRole("button", { name: /select all/i }).click();
    return (
      (await page.locator("#scan-option-issueEvidence").isChecked()) &&
      (await page.locator("#scan-option-reversibleWorkflows").isChecked()) &&
      (await page.locator("#scan-option-safeInteractions").isChecked())
    );
  });

  await check("clear all clears Phase 8 options", async () => {
    await page.getByRole("button", { name: /clear all/i }).click();
    return (
      !(await page.locator("#scan-option-issueEvidence").isChecked()) &&
      !(await page.locator("#scan-option-reversibleWorkflows").isChecked()) &&
      !(await page.locator("#scan-option-safeInteractions").isChecked())
    );
  });

  await check("changing Phase 8 options clears stale results", async () => {
    await runScan(page, `${fixture.origin}/phase8/reversible-checkbox`, [
      "safeInteractions",
      "reversibleWorkflows",
    ]);
    const before = await page.locator("#basic-scan-report-heading").count();
    await page.locator("#scan-option-issueEvidence").check();
    const after = await page.locator("#basic-scan-report-heading").count();
    return before === 1 && after === 0;
  });

  await check("successful reversible workflow shows honest zero wording", async () => {
    await runScan(page, `${fixture.origin}/phase8/reversible-checkbox`, [
      "safeInteractions",
      "reversibleWorkflows",
    ]);
    const text = await page.locator("main").innerText();
    return (
      /reversible workflow checks/i.test(text) &&
      /successful reversals/i.test(text) &&
      /does not prove that every workflow works/i.test(text) &&
      hasNoForbiddenClaims(text) &&
      /capability status/i.test(text) &&
      /issue-specific evidence/i.test(text) &&
      /not selected/i.test(text)
    );
  });

  await check("failed reversal renders STATE_TRANSITION_ISSUE card", async () => {
    await runScan(page, `${fixture.origin}/phase8/failed-reversal`, [
      "safeInteractions",
      "reversibleWorkflows",
      "issueEvidence",
    ]);
    const text = await page.locator("main").innerText();
    const secretsAbsent =
      !text.includes("PHASE8_SECRET_BUTTON_TEXT") &&
      !text.includes("PHASE8_PASSWORD_SECRET");
    return (
      /state transition issue/i.test(text) &&
      /medium/i.test(text) &&
      /diagnostic confidence/i.test(text) &&
      /findings/i.test(text) &&
      secretsAbsent &&
      hasNoAbsolutePathLeak(text)
    );
  });

  await check("obstruction evidence gallery and before/after dead-click evidence", async () => {
    await runScan(page, `${fixture.origin}/phase8/obstructed`, [
      "safeInteractions",
      "issueEvidence",
    ]);
    const text = await page.locator("main").innerText();
    const gallery = page.locator("#issue-evidence-heading");
    const imgs = page.locator('#issue-evidence-heading ~ * img, [aria-labelledby="issue-evidence-heading"] img');
    const imgCount = await imgs.count();
    let validSrc = imgCount > 0;
    for (let i = 0; i < imgCount; i += 1) {
      const src = await imgs.nth(i).getAttribute("src");
      const alt = await imgs.nth(i).getAttribute("alt");
      if (!src || !src.startsWith("/scan-results/") || !src.endsWith(".png")) {
        validSrc = false;
      }
      if (!alt || /PHASE8_|Covered|Partial/i.test(alt)) {
        validSrc = false;
      }
    }
    return (
      /issue evidence/i.test(text) &&
      /visible content surrounding the affected interface element/i.test(text) &&
      /obstructed control/i.test(text) &&
      (await gallery.count()) === 1 &&
      imgCount > 0 &&
      validSrc &&
      hasNoAbsolutePathLeak(text) &&
      !/C:\\Users\\/i.test(text)
    );
  });

  await check("dead-click before/after evidence labels render", async () => {
    await runScan(page, `${fixture.origin}/phase8/dead-click`, [
      "safeInteractions",
      "issueEvidence",
    ]);
    const text = await page.locator("main").innerText();
    return (
      /dead click/i.test(text) &&
      (/before/i.test(text) || /before interaction/i.test(text)) &&
      (/after first click/i.test(text) || /after interaction/i.test(text)) &&
      hasNoForbiddenClaims(text)
    );
  });

  await check("existing Phase 7 sections and export remain available", async () => {
    await runScan(page, `${fixture.origin}/dead-click`, [
      "safeInteractions",
      "brokenImages",
      "screenshots",
    ]);
    const text = await page.locator("main").innerText();
    const exportBtn = page.getByRole("button", { name: /export json/i });
    return (
      /safe interaction analysis/i.test(text) &&
      /dead click/i.test(text) &&
      /severity/i.test(text) &&
      (await exportBtn.count()) === 1 &&
      /desktop screenshot|screenshot/i.test(text)
    );
  });

  await check("browser contacts only local app hosts", async () => {
    const allowed = new Set(["localhost", "127.0.0.1", "[::1]"]);
    for (const host of contactedHosts) {
      if (!allowed.has(host)) {
        return false;
      }
    }
    return contactedHosts.has("localhost") || contactedHosts.has("127.0.0.1");
  });
} finally {
  await browser.close();
  await fixture.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
