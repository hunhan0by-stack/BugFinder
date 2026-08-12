import type { SafetyClassification } from "@/lib/scanner/interaction/candidate-types";

export { matchesUnsafeActionKeyword } from "@/lib/scanner/interaction/safety-keywords";

export type CandidateSafetyInput = {
  tagName: string;
  inputType: string;
  role: string;
  hasHref: boolean;
  hasDownload: boolean;
  hasTarget: boolean;
  hasFormAction: boolean;
  formAssociated: boolean;
  isSubmit: boolean;
  isReset: boolean;
  isFile: boolean;
  isPassword: boolean;
  isTextEntry: boolean;
  isContentEditable: boolean;
  isSelect: boolean;
  isRange: boolean;
  isColor: boolean;
  isDateTime: boolean;
  disabled: boolean;
  ariaDisabled: boolean;
  busy: boolean;
  hidden: boolean;
  inViewport: boolean;
  unsafeByKeyword: boolean;
  hasAriaExpanded: boolean;
  hasAriaPressed: boolean;
  hasAriaChecked: boolean;
  hasAriaControls: boolean;
  isSummary: boolean;
  isButtonTypeButton: boolean;
  isCheckbox: boolean;
  isRadio: boolean;
  isRoleButton: boolean;
  isRoleSwitch: boolean;
  isRoleCheckbox: boolean;
};

/**
 * Conservatively classifies whether a control may receive a Phase 7 click.
 * Prefer skipping when uncertain.
 */
export function classifyCandidateSafety(
  input: CandidateSafetyInput,
): SafetyClassification {
  if (input.hidden) return "SKIP_HIDDEN";
  if (input.disabled || input.ariaDisabled || input.busy) return "SKIP_DISABLED";
  if (!input.inViewport) return "SKIP_OFFSCREEN";

  if (
    input.hasHref ||
    input.hasTarget ||
    input.tagName === "a"
  ) {
    return "SKIP_NAVIGATION";
  }
  if (input.hasDownload) return "SKIP_DOWNLOAD";
  if (input.isFile || input.hasFormAction) return "SKIP_FILE_UPLOAD";
  if (input.isSubmit) return "SKIP_FORM_SUBMISSION";
  if (input.isReset) return "SKIP_FORM_RESET";
  if (
    input.isPassword ||
    input.isTextEntry ||
    input.isContentEditable ||
    input.isSelect ||
    input.isRange ||
    input.isColor ||
    input.isDateTime
  ) {
    return "SKIP_UNKNOWN_RISK";
  }

  if (input.unsafeByKeyword) return "SKIP_DESTRUCTIVE";

  const looksSafeToggle =
    input.isCheckbox ||
    input.isRadio ||
    input.isSummary ||
    input.isButtonTypeButton ||
    (input.isRoleButton &&
      (input.hasAriaExpanded ||
        input.hasAriaPressed ||
        input.hasAriaControls)) ||
    input.isRoleSwitch ||
    input.isRoleCheckbox ||
    (input.isRoleButton && !input.formAssociated);

  if (input.formAssociated && input.isSubmit) {
    return "SKIP_FORM_SUBMISSION";
  }

  // Bare <button> inside a form defaults to submit — exclude.
  if (
    input.tagName === "button" &&
    input.formAssociated &&
    input.inputType !== "button"
  ) {
    return "SKIP_FORM_SUBMISSION";
  }

  if (looksSafeToggle) {
    return "SAFE_FOR_BOUNDED_CLICK";
  }

  return "SKIP_UNKNOWN_RISK";
}

export function candidatePriority(input: {
  isCheckbox: boolean;
  isRadio: boolean;
  isSummary: boolean;
  hasAriaExpanded: boolean;
  hasAriaPressed: boolean;
  isRoleSwitch: boolean;
  isRoleCheckbox: boolean;
  hasAriaControls: boolean;
  isButtonTypeButton: boolean;
  isRoleButton: boolean;
}): number {
  if (input.isCheckbox) return 1;
  if (input.isRadio) return 2;
  if (input.isSummary) return 3;
  if (input.hasAriaExpanded) return 4;
  if (input.hasAriaPressed) return 5;
  if (input.isRoleSwitch) return 6;
  if (input.isRoleCheckbox) return 7;
  if (input.hasAriaControls) return 8;
  if (input.isButtonTypeButton) return 9;
  if (input.isRoleButton) return 10;
  return 100;
}
