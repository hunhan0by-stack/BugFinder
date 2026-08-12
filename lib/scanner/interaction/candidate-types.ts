export type SafetyClassification =
  | "SAFE_FOR_BOUNDED_CLICK"
  | "SKIP_NAVIGATION"
  | "SKIP_FORM_SUBMISSION"
  | "SKIP_FORM_RESET"
  | "SKIP_FILE_UPLOAD"
  | "SKIP_DOWNLOAD"
  | "SKIP_DESTRUCTIVE"
  | "SKIP_ACCOUNT_ACTION"
  | "SKIP_PAYMENT_ACTION"
  | "SKIP_COMMUNICATION_ACTION"
  | "SKIP_NETWORK_PRONE"
  | "SKIP_OFFSCREEN"
  | "SKIP_DISABLED"
  | "SKIP_HIDDEN"
  | "SKIP_UNKNOWN_RISK";

export type CandidateFingerprint = {
  structuralSelector: string;
  tagName: string;
  inputType: string;
  role: string;
  formAssociated: boolean;
  hasAriaExpanded: boolean;
  hasAriaPressed: boolean;
  hasAriaChecked: boolean;
  hasAriaControls: boolean;
  priority: number;
};

export type InteractionCandidate = {
  fingerprint: CandidateFingerprint;
  classification: SafetyClassification;
  inViewport: boolean;
  visible: boolean;
  disabled: boolean;
  ariaDisabled: boolean;
  unsafeByKeyword: boolean;
};

export function isEligibleForActualClick(
  classification: SafetyClassification,
): boolean {
  return classification === "SAFE_FOR_BOUNDED_CLICK";
}
