import type { ScanOptionKey, ScanOptions } from "@/types/scan";

export type ScanOptionDefinition = {
  key: ScanOptionKey;
  label: string;
  description: string;
  warning?: string;
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
    description: "Capture desktop and mobile evidence during the scan.",
  },
  {
    key: "safeInteractions",
    label: "Safe interaction checks",
    description:
      "Runs a small number of isolated, non-destructive button checks. Navigation, form submission, downloads, popups, and network requests are blocked.",
  },
  {
    key: "issueEvidence",
    label: "Issue-specific evidence",
    description:
      "Captures bounded screenshots or before/after evidence for supported findings when a safe element target is available.",
    warning:
      "Evidence may include visible page content near the affected element.",
  },
  {
    key: "reversibleWorkflows",
    label: "Reversible workflow checks",
    description:
      "Tests a small number of local reversible controls with at most two isolated pointer clicks: one state change and one attempt to return to the original state.",
    warning:
      "Network access, navigation, form submission, downloads, popups, destructive actions, and uncertain controls remain blocked. Requires safe interaction checks.",
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
    safeInteractions: enabled,
    issueEvidence: enabled,
    reversibleWorkflows: enabled,
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

/** When reversible workflows are enabled, safe interactions must also be on. */
export function normalizeScanOptions(options: ScanOptions): ScanOptions {
  if (options.reversibleWorkflows && !options.safeInteractions) {
    return { ...options, safeInteractions: true };
  }
  return options;
}
