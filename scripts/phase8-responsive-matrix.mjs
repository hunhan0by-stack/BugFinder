/**
 * Phase 8 automated responsive matrix for the Frontend Bug Finder UI.
 * Requires Next.js on PHASE8_APP_URL with local fixture mode enabled.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
  process.env.PHASE8_APP_URL ??
  process.env.PHASE7_APP_URL ??
  process.env.PHASE4_APP_URL ??
  "http://localhost:3000";

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

const ALL_OPTION_IDS = [
  "consoleErrors",
  "networkErrors",
  "brokenImages",
  "mobileLayout",
  "accessibility",
  "screenshots",
  "safeInteractions",
  "issueEvidence",
  "reversibleWorkflows",
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

async function setOptions(page, optionIds) {
  for (const id of ALL_OPTION_IDS) {
    const locator = page.locator(`#scan-option-${id}`);
    const checked = await locator.isChecked();
    const want = optionIds.includes(id);
    if (checked !== want) {
      await locator.click();
    }
  }
}

async function runScan(page, url, optionIds) {
  await page.locator("#scan-url").fill(url);
  await setOptions(page, optionIds);
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

async function noHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  return metrics.scrollWidth === metrics.innerWidth;
}

async function layoutSanity(page) {
  const text = await page.locator("main").innerText();
  const overflowOk = await noHorizontalOverflow(page);
  const imagesOverflow = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("main img"));
    return imgs.some((img) => {
      const parent = img.parentElement;
      if (!parent) return false;
      return img.getBoundingClientRect().width > parent.getBoundingClientRect().width + 2;
    });
  });
  return (
    overflowOk &&
    !imagesOverflow &&
    /checks to include|issue-specific evidence|reversible workflow/i.test(text)
  );
}

const fixture = await startLocalFixtureServer(3100);
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const label = `${viewport.width}x${viewport.height}`;

    await check(`${label} initial UI fits without horizontal overflow`, async () => {
      const response = await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /select all/i }).click();
      return Boolean(response?.ok()) && (await layoutSanity(page));
    });

    await check(`${label} report layout fits after Phase 8 scan`, async () => {
      await runScan(page, `${fixture.origin}/phase8/failed-reversal`, [
        "safeInteractions",
        "reversibleWorkflows",
        "issueEvidence",
        "screenshots",
      ]);
      const text = await page.locator("main").innerText();
      const overflowOk = await noHorizontalOverflow(page);
      return (
        overflowOk &&
        /state transition issue|reversible workflow|issue evidence|export json|capability status/i.test(
          text,
        ) &&
        /medium|diagnostic confidence/i.test(text)
      );
    });

    if (viewport.width <= 390) {
      await check(`${label} asserts scrollWidth === innerWidth`, async () => {
        return noHorizontalOverflow(page);
      });
    }

    await page.close();
  }
} finally {
  await browser.close();
  await fixture.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
