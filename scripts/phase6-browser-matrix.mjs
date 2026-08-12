/**
 * Phase 6 browser UI matrix. Requires Next.js on PHASE6_APP_URL with fixture
 * mode enabled, plus a local fixture on 127.0.0.1:3100.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
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
  await check("app loads with one h1", async () => {
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    return response?.ok() && (await page.locator("h1").count()) === 1;
  });

  await check("clean Phase 6 shows capability status and honest zero copy", async () => {
    await runScan(page, `${fixture.origin}/phase6-clean`, [
      "brokenImages",
      "mobileLayout",
      "accessibility",
      "screenshots",
    ]);
    const text = await page.locator("main").innerText();
    const lower = text.toLowerCase();
    return (
      /capability status/i.test(text) &&
      /broken.?image analysis/i.test(text) &&
      /mobile layout analysis/i.test(text) &&
      /accessibility analysis/i.test(text) &&
      /desktop screenshot/i.test(text) &&
      /mobile screenshot/i.test(text) &&
      !/is fully accessible|wcag compliant|is fully responsive|all images work/i.test(
        lower,
      )
    );
  });

  await check("broken-image page renders DESKTOP issue card", async () => {
    await runScan(page, `${fixture.origin}/broken-image`, ["brokenImages"]);
    const text = await page.locator("main").innerText();
    return text.includes("Broken image") && text.includes("Desktop");
  });

  await check("mobile overflow renders MOBILE issue card", async () => {
    await runScan(page, `${fixture.origin}/mobile-overflow`, ["mobileLayout"]);
    const text = await page.locator("main").innerText();
    return (
      /page overflows the mobile viewport/i.test(text) &&
      text.includes("Mobile")
    );
  });

  await check("accessibility page shows axe evidence and disclaimer", async () => {
    await runScan(page, `${fixture.origin}/a11y-violations`, ["accessibility"]);
    const text = await page.locator("main").innerText();
    return (
      text.includes("Accessibility") &&
      text.includes("axe") &&
      !/WCAG compliant|fully accessible/i.test(text)
    );
  });

  await check("no horizontal overflow at 390px", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
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
