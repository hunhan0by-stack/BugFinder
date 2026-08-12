/**
 * Phase 7 browser UI matrix. Requires Next.js on PHASE7_APP_URL with fixture
 * mode enabled, plus a local fixture on 127.0.0.1:3100.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
  process.env.PHASE7_APP_URL ??
  process.env.PHASE6_APP_URL ??
  process.env.PHASE5_APP_URL ??
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
  await page.locator("#scan-url").fill(url);
  for (const id of [
    "consoleErrors",
    "networkErrors",
    "brokenImages",
    "mobileLayout",
    "accessibility",
    "screenshots",
    "safeInteractions",
    "issueEvidence",
    "reversibleWorkflows",
  ]) {
    const locator = page.locator(`#scan-option-${id}`);
    const checked = await locator.isChecked();
    const want = optionIds.includes(id);
    if (checked !== want) {
      await locator.click();
    }
  }
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/scan") && response.status() === 200,
      { timeout: 120_000 },
    ),
    page
      .getByRole("button", {
        name: /scan website|running basic scan|opening website/i,
      })
      .click(),
  ]);
  await page.waitForSelector("#basic-scan-report-heading", { timeout: 120000 });
}

const fixture = await startLocalFixtureServer(3100);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await check("safe interaction option is visible", async () => {
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    const label = await page.locator("#scan-option-safeInteractions").count();
    const text = await page.locator("main").innerText();
    return (
      Boolean(response?.ok()) &&
      label === 1 &&
      /safe interaction/i.test(text) &&
      /side effects are skipped/i.test(text)
    );
  });

  await check("select all includes safeInteractions", async () => {
    await page.getByRole("button", { name: /select all/i }).click();
    return page.locator("#scan-option-safeInteractions").isChecked();
  });

  await check("clear all disables safeInteractions", async () => {
    await page.getByRole("button", { name: /clear all/i }).click();
    return !(await page.locator("#scan-option-safeInteractions").isChecked());
  });

  await check("safe toggle shows honest zero interaction copy", async () => {
    await runScan(page, `${fixture.origin}/safe-toggle`, ["safeInteractions"]);
    const text = await page.locator("main").innerText();
    const lower = text.toLowerCase();
    return (
      /safe interaction analysis/i.test(text) &&
      /complete/i.test(text) &&
      /does not prove that every control works/i.test(lower) &&
      !/all buttons work/i.test(lower) &&
      !/every control is functional/i.test(lower)
    );
  });

  await check("dead-click page shows DEAD_CLICK card", async () => {
    await runScan(page, `${fixture.origin}/dead-click`, ["safeInteractions"]);
    const text = await page.locator("main").innerText();
    return /dead click/i.test(text) && /desktop/i.test(text);
  });

  await check("obstructed page shows OBSTRUCTED_CONTROL without dead click", async () => {
    await runScan(page, `${fixture.origin}/obstructed-button`, [
      "safeInteractions",
    ]);
    const text = await page.locator("main").innerText();
    return (
      /obstructed control/i.test(text) &&
      !/interactive control produced no observable response/i.test(text)
    );
  });

  await check("no full-page horizontal overflow at 390", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    return metrics.scrollWidth === metrics.innerWidth;
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
