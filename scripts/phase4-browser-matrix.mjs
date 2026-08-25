/**
 * Phase 4 browser UI matrix using the local fixture.
 * Requires the Next.js app with ALLOW_LOCAL_FIXTURE=true and a fixture on :3100.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base = process.env.PHASE4_APP_URL ?? "http://localhost:3000";
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
  await check("home loads", async () => {
    const response = await page.goto(base, { waitUntil: "networkidle" });
    return response?.ok() && (await page.title()) === "Frontend Bug Finder";
  });

  await check("empty URL disables submit", async () => {
    await page.locator("#scan-url").fill("");
    return page.getByRole("button", { name: "Scan Website" }).isDisabled();
  });

  await check("protocol-less rejected", async () => {
    await page.locator("#scan-url").fill("example.com");
    return page.getByRole("button", { name: "Scan Website" }).isDisabled();
  });

  await check("valid fixture scan renders basic result", async () => {
    await page.locator("#scan-url").fill(`${fixture.origin}/ok`);
    await page.getByRole("button", { name: /select all/i }).click();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/scan") && response.status() === 200,
        { timeout: 180_000 },
      ),
      page.getByRole("button", { name: /scan website|running basic scan|opening website/i }).click(),
    ]);
    await page.getByRole("heading", { name: "Basic scan result" }).waitFor({
      timeout: 60000,
    });
    await page.getByText("Fixture OK").first().waitFor({ timeout: 10000 });
    const body = await page.locator("body").innerText();
    return (
      (/Basic page scan completed|Basic scan and diagnostics completed/i.test(body)) &&
      /Target contacted/i.test(body) &&
      /Fixture OK/.test(body) &&
      !/No issues found/i.test(body) &&
      !/Demo example/i.test(body) &&
      !/mode:\s*"DEMO"/i.test(body)
    );
  });

  await check("no horizontal overflow at 360", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    return metrics.scrollWidth <= metrics.innerWidth + 1;
  });

  await check("no application console errors", async () => {
    return consoleErrors.filter((text) => !/Download the React DevTools/i.test(text)).length === 0;
  });
} finally {
  await browser.close();
  await fixture.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(`--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`);
process.exit(failed.length ? 1 : 0);
