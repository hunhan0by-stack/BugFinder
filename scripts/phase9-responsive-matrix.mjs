/**
 * Phase 9 responsive matrix for the Bug Finder UI.
 * Requires the app at PHASE9_APP_URL (default http://localhost:3000).
 */
import { chromium } from "playwright";

const base =
  process.env.PHASE9_APP_URL ??
  process.env.PHASE8_APP_URL ??
  process.env.PHASE4_APP_URL ??
  "http://localhost:3000";

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

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

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const label = `${viewport.width}x${viewport.height}`;
    await check(`${label} home page has no horizontal overflow`, async () => {
      const response = await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /select all/i }).click();
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      return Boolean(response?.ok()) && metrics.scrollWidth === metrics.innerWidth;
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
