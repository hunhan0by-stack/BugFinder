import type { ScanOptionKey, ScanOptions } from "@/types/scan";

export type ScanOptionDefinition = {
  key: ScanOptionKey;
  label: string;
  description: string;
};

export const SCAN_OPTION_DEFINITIONS: readonly ScanOptionDefinition[] = [
  {
    key: "consoleErrors",
    label: "Console errors",
    description:
      "JavaScript errors and warnings the page writes to the browser console.",
  },
  {
    key: "networkErrors",
    label: "Network errors",
    description:
      "Requests that return an error status or never finish loading.",
  },
  {
    key: "brokenImages",
    label: "Broken images",
    description: "Images the browser was unable to load.",
  },
  {
    key: "mobileLayout",
    label: "Mobile layout",
    description:
      "Content that spills outside the screen at a phone-sized width.",
  },
  {
    key: "accessibility",
    label: "Accessibility violations",
    description:
      "Checks such as color contrast, missing labels, and heading order.",
  },
  {
    key: "screenshots",
    label: "Screenshots",
    description: "Capture desktop and mobile evidence during future scans.",
  },
];

export const SCAN_OPTION_KEYS: readonly ScanOptionKey[] =
  SCAN_OPTION_DEFINITIONS.map((definition) => definition.key);

export function setAllScanOptions(enabled: boolean): ScanOptions {
  return {
    consoleErrors: enabled,
    networkErrors: enabled,
    brokenImages: enabled,
    mobileLayout: enabled,
    accessibility: enabled,
    screenshots: enabled,
  };
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = setAllScanOptions(true);

export function countSelectedOptions(options: ScanOptions): number {
  return SCAN_OPTION_KEYS.filter((key) => options[key]).length;
}

export function selectedOptionKeys(options: ScanOptions): ScanOptionKey[] {
  return SCAN_OPTION_KEYS.filter((key) => options[key]);
}

export function scanOptionLabel(key: ScanOptionKey): string {
  const definition = SCAN_OPTION_DEFINITIONS.find(
    (candidate) => candidate.key === key,
  );
  return definition ? definition.label : key;
}
