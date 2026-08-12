import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyCandidateSafety,
  candidatePriority,
} from "@/lib/scanner/interaction/classify-candidate";
import { classifyObstructionFromPoints } from "@/lib/scanner/interaction/obstruction";
import { hasMeaningfulResponse } from "@/lib/scanner/interaction/state-snapshot";
import {
  matchesUnsafeActionKeyword,
  normalizeRiskLabel,
} from "@/lib/scanner/interaction/safety-keywords";
import { createTypeSummary } from "@/lib/scanner/diagnostics/create-summary";
import type { DiagnosticIssue } from "@/types/scan";

function baseSafety(
  overrides: Partial<Parameters<typeof classifyCandidateSafety>[0]> = {},
) {
  return classifyCandidateSafety({
    tagName: "button",
    inputType: "button",
    role: "",
    hasHref: false,
    hasDownload: false,
    hasTarget: false,
    hasFormAction: false,
    formAssociated: false,
    isSubmit: false,
    isReset: false,
    isFile: false,
    isPassword: false,
    isTextEntry: false,
    isContentEditable: false,
    isSelect: false,
    isRange: false,
    isColor: false,
    isDateTime: false,
    disabled: false,
    ariaDisabled: false,
    busy: false,
    hidden: false,
    inViewport: true,
    unsafeByKeyword: false,
    hasAriaExpanded: false,
    hasAriaPressed: false,
    hasAriaChecked: false,
    hasAriaControls: false,
    isSummary: false,
    isButtonTypeButton: true,
    isCheckbox: false,
    isRadio: false,
    isRoleButton: false,
    isRoleSwitch: false,
    isRoleCheckbox: false,
    ...overrides,
  });
}

describe("Phase 7 candidate safety", () => {
  it("allows safe button type=button", () => {
    assert.equal(baseSafety(), "SAFE_FOR_BOUNDED_CLICK");
  });

  it("skips submit, links, downloads, and destructive keywords", () => {
    assert.equal(baseSafety({ isSubmit: true }), "SKIP_FORM_SUBMISSION");
    assert.equal(baseSafety({ hasHref: true }), "SKIP_NAVIGATION");
    assert.equal(baseSafety({ hasDownload: true }), "SKIP_DOWNLOAD");
    assert.equal(baseSafety({ unsafeByKeyword: true }), "SKIP_DESTRUCTIVE");
    assert.equal(baseSafety({ inViewport: false }), "SKIP_OFFSCREEN");
    assert.equal(baseSafety({ disabled: true }), "SKIP_DISABLED");
  });

  it("matches English and Turkish unsafe keywords", () => {
    assert.equal(matchesUnsafeActionKeyword(normalizeRiskLabel("Delete account")), true);
    assert.equal(matchesUnsafeActionKeyword(normalizeRiskLabel("Satın al")), true);
    assert.equal(matchesUnsafeActionKeyword(normalizeRiskLabel("Open menu")), false);
  });

  it("prioritizes checkboxes over generic role buttons", () => {
    assert.ok(
      candidatePriority({
        isCheckbox: true,
        isRadio: false,
        isSummary: false,
        hasAriaExpanded: false,
        hasAriaPressed: false,
        isRoleSwitch: false,
        isRoleCheckbox: false,
        hasAriaControls: false,
        isButtonTypeButton: false,
        isRoleButton: false,
      }) <
        candidatePriority({
          isCheckbox: false,
          isRadio: false,
          isSummary: false,
          hasAriaExpanded: false,
          hasAriaPressed: false,
          isRoleSwitch: false,
          isRoleCheckbox: false,
          hasAriaControls: false,
          isButtonTypeButton: false,
          isRoleButton: true,
        }),
    );
  });
});

describe("Phase 7 obstruction", () => {
  it("ignores child/label hits and detects full overlays", () => {
    assert.equal(
      classifyObstructionFromPoints([
        { blocked: false, byChildOrLabel: true },
        { blocked: false, byChildOrLabel: true },
      ]).kind,
      "none",
    );
    assert.equal(
      classifyObstructionFromPoints([
        { blocked: true, byChildOrLabel: false },
        { blocked: true, byChildOrLabel: false },
      ]).kind,
      "full",
    );
    assert.equal(
      classifyObstructionFromPoints([
        { blocked: true, byChildOrLabel: false },
        { blocked: false, byChildOrLabel: false },
      ]).kind,
      "partial",
    );
  });
});

describe("Phase 7 observable response", () => {
  const base = {
    disabled: false,
    ariaDisabled: false,
    ariaExpanded: "false",
    ariaPressed: null,
    ariaChecked: null,
    ariaBusy: false,
    nativeChecked: false,
    detailsOpen: null,
    focused: false,
    controlledVisible: false,
    dialogCount: 0,
    menuCount: 0,
    listboxCount: 0,
    popoverCount: 0,
    openDetailsCount: 0,
    childListMutations: 0,
    attributeMutations: 0,
    width: 40,
    height: 20,
  };

  it("treats aria-expanded change as meaningful", () => {
    const diff = hasMeaningfulResponse(base, {
      ...base,
      ariaExpanded: "true",
      controlledVisible: true,
    });
    assert.equal(diff.meaningful, true);
  });

  it("does not treat attribute-only ripples as meaningful", () => {
    const diff = hasMeaningfulResponse(base, {
      ...base,
      attributeMutations: 5,
    });
    assert.equal(diff.meaningful, false);
  });

  it("detects persistent busy transition", () => {
    const diff = hasMeaningfulResponse(base, { ...base, ariaBusy: true });
    assert.equal(diff.enteredBusy, true);
    assert.equal(diff.stayedBusy, true);
  });
});

describe("Phase 7 type summary", () => {
  it("counts interaction issue types", () => {
    const issues: DiagnosticIssue[] = [
      {
        id: "1",
        type: "DEAD_CLICK",
        severity: "MEDIUM",
        confidence: 97,
        title: "t",
        description: "d",
        observedBehavior: "o",
        potentialUserImpact: "p",
        technicalEvidence: "e",
        suggestedInvestigation: "s",
        scope: "SAME_ORIGIN",
        profile: "DESKTOP",
        pageUrl: "http://127.0.0.1/",
        occurrenceCount: 1,
        firstSeenMs: 0,
        lastSeenMs: 0,
        metadata: {},
      },
      {
        id: "2",
        type: "OBSTRUCTED_CONTROL",
        severity: "MEDIUM",
        confidence: 99,
        title: "t",
        description: "d",
        observedBehavior: "o",
        potentialUserImpact: "p",
        technicalEvidence: "e",
        suggestedInvestigation: "s",
        scope: "SAME_ORIGIN",
        profile: "DESKTOP",
        pageUrl: "http://127.0.0.1/",
        occurrenceCount: 1,
        firstSeenMs: 0,
        lastSeenMs: 0,
        metadata: {},
      },
      {
        id: "3",
        type: "FORM_STATE_ISSUE",
        severity: "INFO",
        confidence: 80,
        title: "t",
        description: "d",
        observedBehavior: "o",
        potentialUserImpact: "p",
        technicalEvidence: "e",
        suggestedInvestigation: "s",
        scope: "SAME_ORIGIN",
        profile: "DESKTOP",
        pageUrl: "http://127.0.0.1/",
        occurrenceCount: 1,
        firstSeenMs: 0,
        lastSeenMs: 0,
        metadata: { subtype: "ORPHANED_SUBMIT_CONTROL" },
      },
    ];
    const summary = createTypeSummary(issues);
    assert.equal(summary.deadClicks, 1);
    assert.equal(summary.obstructedControls, 1);
    assert.equal(summary.formStateIssues, 1);
  });
});
