import type { EvidenceClip } from "@/types/scan";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClipCalculatorConfig = {
  paddingPx: number;
  minWidthPx: number;
  minHeightPx: number;
  maxWidthPx: number;
  maxHeightPx: number;
  viewportWidth: number;
  viewportHeight: number;
};

/**
 * Builds a viewport-clamped evidence clip around an element bounding box.
 * Never scrolls. Returns null when the box is invalid or fully outside viewport.
 */
export function calculateEvidenceClip(
  box: BoundingBox,
  config: ClipCalculatorConfig,
): EvidenceClip | null {
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return null;
  }

  const viewport: BoundingBox = {
    x: 0,
    y: 0,
    width: config.viewportWidth,
    height: config.viewportHeight,
  };

  if (
    box.x + box.width <= 0 ||
    box.y + box.height <= 0 ||
    box.x >= viewport.width ||
    box.y >= viewport.height
  ) {
    return null;
  }

  let x = Math.floor(box.x - config.paddingPx);
  let y = Math.floor(box.y - config.paddingPx);
  let width = Math.ceil(box.width + config.paddingPx * 2);
  let height = Math.ceil(box.height + config.paddingPx * 2);

  if (width < config.minWidthPx) {
    const grow = config.minWidthPx - width;
    x -= Math.floor(grow / 2);
    width = config.minWidthPx;
  }
  if (height < config.minHeightPx) {
    const grow = config.minHeightPx - height;
    y -= Math.floor(grow / 2);
    height = config.minHeightPx;
  }

  if (width > config.maxWidthPx) {
    const shrink = width - config.maxWidthPx;
    x += Math.floor(shrink / 2);
    width = config.maxWidthPx;
  }
  if (height > config.maxHeightPx) {
    const shrink = height - config.maxHeightPx;
    y += Math.floor(shrink / 2);
    height = config.maxHeightPx;
  }

  x = Math.max(0, x);
  y = Math.max(0, y);
  width = Math.min(width, viewport.width - x);
  height = Math.min(height, viewport.height - y);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}
