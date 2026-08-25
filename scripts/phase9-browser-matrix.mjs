/**
 * Phase 9 Bug Finder UI release matrix.
 * Requires the app at PHASE9_APP_URL (default http://localhost:3000).
 * Does not contact public websites.
 */
import { chromium } from "playwright";

const base =
  process.env.PHASE9_APP_URL ??
  process.env.PHASE8_APP_URL ??
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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => {
  consoleErrors.push(String(error));
});

try {
  await check("home page loads with title and scan form", async () => {
    const response = await page.goto(base, { waitUntil: "networkidle" });
    const heading = await page.locator("h1").innerText();
    return (
      response?.ok() === true &&
      heading.includes("Frontend Bug Finder") &&
      (await page.locator("#scan-url").count()) === 1
    );
  });

  await check("all 9 scan options render", async () => {
    for (const id of ALL_OPTION_IDS) {
      if ((await page.locator(`#scan-option-${id}`).count()) !== 1) {
        return false;
      }
    }
    return true;
  });

  await check("select all and clear all work", async () => {
    await page.getByRole("button", { name: /clear all/i }).click();
    for (const id of ALL_OPTION_IDS) {
      if (await page.locator(`#scan-option-${id}`).isChecked()) {
        return false;
      }
    }
    await page.getByRole("button", { name: /select all/i }).click();
    for (const id of ALL_OPTION_IDS) {
      if (!(await page.locator(`#scan-option-${id}`).isChecked())) {
        return false;
      }
    }
    return true;
  });

  await check("validation errors work", async () => {
    await page.locator("#scan-url").fill("not-a-url");
    await page.locator("#scan-url").blur();
    const text = await page.locator("form").innerText();
    return /valid website address|http:\/\/ or https:\/\//i.test(text);
  });

  await check("capability and limitation copy is present", async () => {
    const text = await page.locator("body").innerText();
    return (
      /what a basic scan reports/i.test(text) &&
      /cannot do/i.test(text) &&
      /authorized/i.test(text)
    );
  });

  await check("no Bug Finder hydration or page errors", async () => {
    const relevant = consoleErrors.filter(
      (entry) =>
        /hydration|minified react|frontend bug finder/i.test(entry) &&
        !/favicon/i.test(entry),
    );
    return relevant.length === 0;
  });
} finally {
  await browser.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(
  `--- SUMMARY passed=${results.length - failed.length} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
