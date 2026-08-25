/**
 * Phase 9 axe pass against the Bug Finder UI (not a target website).
 * Requires the app at PHASE9_APP_URL (default http://localhost:3000).
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const base =
  process.env.PHASE9_APP_URL ??
  process.env.PHASE8_APP_URL ??
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await check("axe finds no serious or critical Bug Finder UI violations", async () => {
    const response = await page.goto(base, { waitUntil: "networkidle" });
    if (!response?.ok()) return false;
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = axeResults.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    if (blocking.length > 0) {
      console.log(
        blocking
          .map((violation) => `${violation.id}:${violation.impact}`)
          .join(", "),
      );
    }
    return blocking.length === 0;
  });
} finally {
  await browser.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
