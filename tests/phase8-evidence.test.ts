import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateEvidenceClip } from "@/lib/scanner/evidence/evidence-clip";
import {
  assertSafeEvidenceRelativePath,
  createEvidenceId,
  isSafeEvidenceId,
} from "@/lib/scanner/evidence/evidence-paths";
import { isSensitiveEvidenceTarget } from "@/lib/scanner/evidence/capture-evidence";
import { classifyReversibleKind } from "@/lib/scanner/workflow/run-reversible-workflows";
import type { InteractionCandidate } from "@/lib/scanner/interaction/candidate-types";
import {
  normalizeScanOptions,
  setAllScanOptions,
} from "@/lib/utils/scan-options";

const clipConfig = {
  paddingPx: 48,
  minWidthPx: 64,
  minHeightPx: 48,
  maxWidthPx: 1000,
  maxHeightPx: 800,
  viewportWidth: 1280,
  viewportHeight: 720,
};

function reversibleCandidate(
  overrides: Partial<InteractionCandidate> & {
    fingerprint?: Partial<InteractionCandidate["fingerprint"]>;
  } = {},
): InteractionCandidate {
  const { fingerprint, ...rest } = overrides;
  return {
    fingerprint: {
      structuralSelector: "body > button:nth-of-type(1)",
      tagName: "button",
      inputType: "",
      role: "",
      formAssociated: false,
      hasAriaExpanded: false,
      hasAriaPressed: false,
      hasAriaChecked: false,
      hasAriaControls: false,
      priority: 1,
      ...fingerprint,
    },
    classification: "SAFE_FOR_BOUNDED_CLICK",
    inViewport: true,
    visible: true,
    disabled: false,
    ariaDisabled: false,
    unsafeByKeyword: false,
    ...rest,
  };
}

describe("Phase 8 evidence paths", () => {
  it("createEvidenceId is unique, safe, and has no path separators", () => {
    const a = createEvidenceId();
    const b = createEvidenceId();
    assert.notEqual(a, b);
    assert.equal(isSafeEvidenceId(a), true);
    assert.equal(isSafeEvidenceId(b), true);
    assert.match(a, /^ev_[0-9a-f_]+$/i);
    assert.equal(a.includes("/"), false);
    assert.equal(a.includes("\\"), false);
    assert.equal(a.includes(".."), false);
  });

  it("assertSafeEvidenceRelativePath rejects traversal and unsafe forms", () => {
    const scanId = "11111111-1111-1111-1111-111111111111";
    const goodId = createEvidenceId();
    assert.equal(
      assertSafeEvidenceRelativePath(
        `scan-results/${scanId}/evidence/${goodId}.png`,
        scanId,
      ),
      `scan-results/${scanId}/evidence/${goodId}.png`,
    );

    const rejected = [
      `scan-results/${scanId}/evidence/../secrets.png`,
      `scan-results/${scanId}/evidence/..\\secrets.png`,
      `scan-results/${scanId}/evidence/%2e%2e/x.png`,
      `C:\\Windows\\evil.png`,
      `/etc/passwd.png`,
      `\\\\server\\share\\x.png`,
      `scan-results/${scanId}/evidence/${goodId}.png\0extra`,
      `scan-results/${scanId}/evidence/${"ev_" + "a".repeat(80)}.png`,
      `scan-results/${scanId}/evidence/${goodId}.jpg`,
      `scan-results/${scanId}/evidence/not-an-id.png`,
    ];

    for (const path of rejected) {
      assert.throws(() => assertSafeEvidenceRelativePath(path, scanId));
    }
  });
});

describe("Phase 8 evidence clip", () => {
  it("pads a normal box and clamps to the viewport", () => {
    const clip = calculateEvidenceClip(
      { x: 100, y: 80, width: 40, height: 30 },
      clipConfig,
    );
    assert.ok(clip);
    assert.equal(clip.x >= 0, true);
    assert.equal(clip.y >= 0, true);
    assert.equal(clip.x + clip.width <= clipConfig.viewportWidth, true);
    assert.equal(clip.y + clip.height <= clipConfig.viewportHeight, true);
    assert.ok(clip.width >= clipConfig.minWidthPx);
    assert.ok(clip.height >= clipConfig.minHeightPx);
  });

  it("handles edges, tiny, large, zero, and negative boxes", () => {
    assert.ok(
      calculateEvidenceClip({ x: 0, y: 0, width: 20, height: 20 }, clipConfig),
    );
    assert.ok(
      calculateEvidenceClip(
        { x: 1260, y: 700, width: 20, height: 20 },
        clipConfig,
      ),
    );

    const tiny = calculateEvidenceClip(
      { x: 200, y: 200, width: 4, height: 4 },
      clipConfig,
    );
    assert.ok(tiny);
    // Padding alone can exceed min dimensions for tiny boxes.
    assert.ok(tiny.width >= clipConfig.minWidthPx);
    assert.ok(tiny.height >= clipConfig.minHeightPx);

    const large = calculateEvidenceClip(
      { x: 10, y: 10, width: 2000, height: 1500 },
      clipConfig,
    );
    assert.ok(large);
    assert.ok(large.width <= clipConfig.maxWidthPx);
    assert.ok(large.height <= clipConfig.maxHeightPx);

    assert.equal(
      calculateEvidenceClip({ x: 10, y: 10, width: 0, height: 40 }, clipConfig),
      null,
    );
    assert.equal(
      calculateEvidenceClip({ x: 10, y: 10, width: 40, height: 0 }, clipConfig),
      null,
    );
    assert.equal(
      calculateEvidenceClip(
        { x: 10, y: 10, width: -5, height: 40 },
        clipConfig,
      ),
      null,
    );
    assert.equal(
      calculateEvidenceClip(
        { x: -200, y: -200, width: 10, height: 10 },
        clipConfig,
      ),
      null,
    );
    assert.equal(
      calculateEvidenceClip(
        { x: 2000, y: 2000, width: 40, height: 40 },
        clipConfig,
      ),
      null,
    );
  });
});

describe("Phase 8 sensitive evidence targets", () => {
  it("flags password and payment autocomplete selectors", () => {
    assert.equal(isSensitiveEvidenceTarget('input[type="password"]'), true);
    assert.equal(isSensitiveEvidenceTarget("input[type=password]"), true);
    assert.equal(
      isSensitiveEvidenceTarget('[autocomplete="cc-number"]'),
      true,
    );
    assert.equal(isSensitiveEvidenceTarget('input[type="tel"]'), true);
    assert.equal(isSensitiveEvidenceTarget('button[type="button"]'), false);
    assert.equal(isSensitiveEvidenceTarget(undefined), false);
  });
});

describe("Phase 8 reversible kind classification", () => {
  it("classifies supported reversible kinds and excludes radios", () => {
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({
          fingerprint: { tagName: "input", inputType: "checkbox" },
        }),
      ),
      "checkbox",
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({
          fingerprint: { tagName: "input", inputType: "radio" },
        }),
      ),
      null,
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({ fingerprint: { tagName: "summary" } }),
      ),
      "details",
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({ fingerprint: { hasAriaPressed: true } }),
      ),
      "aria-pressed",
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({ fingerprint: { role: "switch" } }),
      ),
      "role-switch",
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({ fingerprint: { hasAriaExpanded: true } }),
      ),
      "aria-expanded",
    );
    assert.equal(
      classifyReversibleKind(
        reversibleCandidate({
          classification: "SKIP_DISABLED",
          fingerprint: { tagName: "input", inputType: "checkbox" },
        }),
      ),
      null,
    );
  });
});

describe("Phase 8 default options", () => {
  it("setAllScanOptions(false) disables issueEvidence and reversibleWorkflows", () => {
    const options = setAllScanOptions(false);
    assert.equal(options.issueEvidence, false);
    assert.equal(options.reversibleWorkflows, false);
  });

  it("normalizeScanOptions forces safeInteractions when reversibleWorkflows is on", () => {
    const normalized = normalizeScanOptions({
      ...setAllScanOptions(false),
      reversibleWorkflows: true,
      safeInteractions: false,
    });
    assert.equal(normalized.safeInteractions, true);
    assert.equal(normalized.reversibleWorkflows, true);
  });
});
