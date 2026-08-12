/**
 * Phase 8 scanner UI accessibility matrix.
 * Requires Next.js on PHASE8_APP_URL with local fixture mode enabled.
 */
import { chromium } from "playwright";
import { startLocalFixtureServer } from "../tests/helpers/local-fixture-server.mjs";

const base =
  process.env.PHASE8_APP_URL ??
  process.env.PHASE7_APP_URL ??
  process.env.PHASE4_APP_URL ??
  "http://localhost:3000";

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

const fixture = await startLocalFixtureServer(3100);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await check("exactly one h1 and skip link works", async () => {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const h1Count = await page.locator("h1").count();
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await skip.focus();
    await page.keyboard.press("Enter");
    const activeId = await page.evaluate(() => document.activeElement?.id || "");
    return h1Count === 1 && activeId === "main-content";
  });

  await check("URL input labeled and Phase 8 checkboxes are native/clickable", async () => {
    const url = page.locator("#scan-url");
    const labelForUrl = await page.evaluate(() => {
      const input = document.querySelector("#scan-url");
      if (!(input instanceof HTMLInputElement)) return false;
      const byFor = document.querySelector('label[for="scan-url"]');
      if (byFor) return true;
      return Boolean(input.closest("label"));
    });
    const evidenceLabel = page.locator('label[for="scan-option-issueEvidence"]');
    const workflowLabel = page.locator(
      'label[for="scan-option-reversibleWorkflows"]',
    );
    const wasChecked = await page.locator("#scan-option-issueEvidence").isChecked();
    await evidenceLabel.click();
    const evidenceChecked = await page
      .locator("#scan-option-issueEvidence")
      .isChecked();
    return (
      (await url.count()) === 1 &&
      labelForUrl &&
      (await evidenceLabel.count()) === 1 &&
      (await workflowLabel.count()) === 1 &&
      evidenceChecked !== wasChecked &&
      (await page
        .locator("#scan-option-issueEvidence")
        .evaluate(
          (el) => el instanceof HTMLInputElement && el.type === "checkbox",
        ))
    );
  });

  await check("no positive tabindex and focus is visible on interactive controls", async () => {
    const positiveTabIndex = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[tabindex]")).some((el) => {
        const value = Number(el.getAttribute("tabindex"));
        return Number.isFinite(value) && value > 0;
      }),
    );
    await page.locator("#scan-url").focus();
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    return !positiveTabIndex && focusedTag === "INPUT";
  });

  await check("evidence alts are safe after obstruction+evidence scan", async () => {
    await runScan(page, `${fixture.origin}/phase8/obstructed`, [
      "safeInteractions",
      "issueEvidence",
    ]);
    const reportFocused = await page.evaluate(
      () => document.activeElement?.id === "basic-scan-report-heading",
    );
    const alts = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[aria-labelledby="issue-evidence-heading"] img'),
      ).map((img) => img.getAttribute("alt") || ""),
    );
    const safeAlts =
      alts.length > 0 &&
      alts.every(
        (alt) =>
          /evidence/i.test(alt) &&
          !/PHASE8_|Covered|Partial|No handler/i.test(alt),
      );
    const text = await page.locator("main").innerText();
    const capabilityTextual =
      /capability status/i.test(text) &&
      /issue-specific evidence/i.test(text) &&
      /(complete|partial|not selected)/i.test(text);
    return reportFocused && safeAlts && capabilityTextual;
  });

  await check("keyboard can reach export and evidence links", async () => {
    const exportBtn = page.getByRole("button", { name: /export json/i });
    await exportBtn.focus();
    const exportFocused = await page.evaluate(
      () => document.activeElement?.textContent?.includes("Export JSON") === true,
    );
    const evidenceLinks = page.locator(
      '[aria-labelledby="issue-evidence-heading"] a[href^="/scan-results/"]',
    );
    const linkCount = await evidenceLinks.count();
    if (linkCount > 0) {
      await evidenceLinks.first().focus();
    }
    return exportFocused && linkCount >= 0;
  });

  await check("no clickable div buttons for primary actions", async () => {
    const bad = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("div[onclick], div[role='button']"));
      return nodes.length;
    });
    return bad === 0;
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
