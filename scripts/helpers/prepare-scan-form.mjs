/**
 * Shared Bug Finder UI scan-form setup for browser matrices.
 * Sets options first, then the URL, so later option re-renders cannot wipe
 * the controlled URL input before submit is enabled.
 */
export const ALL_SCAN_OPTION_IDS = [
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

export async function prepareScanForm(page, url, optionIds) {
  for (const id of ALL_SCAN_OPTION_IDS) {
    await page.locator(`#scan-option-${id}`).setChecked(optionIds.includes(id));
  }

  const input = page.locator("#scan-url");
  await input.fill(url);
  await input.blur();

  await page.waitForFunction(
    (expectedUrl) => {
      const field = document.querySelector("#scan-url");
      const button = document.querySelector('form button[type="submit"]');
      return (
        field instanceof HTMLInputElement &&
        field.value === expectedUrl &&
        button instanceof HTMLButtonElement &&
        !button.disabled
      );
    },
    url,
    { timeout: 60_000 },
  );
}
