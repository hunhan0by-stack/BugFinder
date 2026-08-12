/**
 * Phase 5 browser UI matrix. Requires Next.js on PHASE5_APP_URL with fixture
 * mode enabled, plus a local fixture on 127.0.0.1:3100.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
  process.env.PHASE5_APP_URL ?? process.env.PHASE4_APP_URL ?? "http://localhost:3000";
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

const fixture = await startLocalFixtureServer(3100);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

try {
  await check("app loads", async () => {
    const response = await page.goto(base, { waitUntil: "domcontentloaded" });
    return response?.ok() && (await page.locator("h1").count()) === 1;
  });

  await check("empty URL keeps submit disabled", async () => {
    await page.locator("#scan-url").fill("");
    return page.getByRole("button", { name: "Scan Website" }).isDisabled();
  });

  await check("clean fixture shows honest zero diagnostics", async () => {
    await page.locator("#scan-url").fill(`${fixture.origin}/clean`);
    await page.locator("#scan-option-consoleErrors").check();
    await page.locator("#scan-option-networkErrors").check();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/scan") && response.status() === 200,
      ),
      page
        .getByRole("button", {
          name: /scan website|running basic scan|opening website/i,
        })
        .click(),
    ]);
    await page.waitForSelector("#basic-scan-report-heading", { timeout: 60000 });
    const text = await page.locator("main").innerText();
    return (
      text.includes("Frontend diagnostics") &&
      (text.includes("No reportable console or network diagnostic events") ||
        text.includes(
          "No reportable findings were captured by the selected automated checks",
        ) ||
        text.includes(
          "No reportable diagnostic findings were captured during this",
        )) &&
      !/no bugs|website healthy|100% error-free|is fully accessible|WCAG compliant|is fully responsive|all images work/i.test(
        text,
      )
    );
  });

  await check("multi fixture renders issue cards and filters", async () => {
    await page.locator("#scan-url").fill(`${fixture.origin}/multi`);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/scan") && response.status() === 200,
      ),
      page
        .getByRole("button", {
          name: /scan website|running basic scan|opening website/i,
        })
        .click(),
    ]);
    await page.waitForSelector("#frontend-diagnostics-heading", {
      timeout: 60000,
    });
    await page.getByRole("button", { name: /High/i }).first().click();
    const text = await page.locator("main").innerText();
    return (
      text.includes("Frontend diagnostics") &&
      (text.includes("Console error") ||
        text.includes("Uncaught page exception") ||
        text.includes("HTTP error") ||
        text.includes("Failed request"))
    );
  });

  await check("no horizontal overflow at 360px", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    return metrics.scrollWidth === metrics.innerWidth;
  });

  await check("no application console errors", async () => {
    return (
      consoleErrors.filter((text) => !/Download the React DevTools/i.test(text))
        .length === 0
    );
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
