export type ObstructionPointResult = {
  blocked: boolean;
  byChildOrLabel: boolean;
};

export type ObstructionAssessment = {
  kind: "none" | "partial" | "full";
  blockedPointCount: number;
  testedPointCount: number;
};

/**
 * Pure classification from point results.
 * Child/label hits are not treated as obstruction.
 */
export function classifyObstructionFromPoints(
  points: readonly ObstructionPointResult[],
  toleranceBlockedCount = 0,
): ObstructionAssessment {
  const testedPointCount = points.length;
  const meaningful = points.filter((point) => !point.byChildOrLabel);
  const blockedPointCount = meaningful.filter((point) => point.blocked).length;
  if (blockedPointCount <= toleranceBlockedCount) {
    return { kind: "none", blockedPointCount, testedPointCount };
  }
  if (blockedPointCount >= meaningful.length && meaningful.length > 0) {
    return { kind: "full", blockedPointCount, testedPointCount };
  }
  return { kind: "partial", blockedPointCount, testedPointCount };
}

export function isAssociatedLabel(
  top: Element | null,
  candidate: Element,
): boolean {
  if (!top) return false;
  if (top === candidate || candidate.contains(top)) return true;
  if (top.tagName.toLowerCase() !== "label") return false;
  const htmlFor = top.getAttribute("for");
  if (htmlFor && candidate.id && htmlFor === candidate.id) return true;
  return top.contains(candidate);
}
