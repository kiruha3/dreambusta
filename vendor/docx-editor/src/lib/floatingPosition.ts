// Viewport-aware positioning for floating editor UI (toolbars, popovers).
//
// Pure geometry helpers — no DOM access — so they are unit-testable and reused
// by SelectionMenu / BubbleMenu (centered toolbar above a selection) and
// AddCommentPopover (popover anchored beside a selection). Callers measure the
// anchor rect / floating element size from the DOM and pass plain numbers here.

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PlacementOptions {
  /** Distance between the anchor and the floating element, px. */
  gap?: number;
  /** Minimum distance to keep from the viewport edges, px. */
  margin?: number;
}

export interface Position {
  top: number;
  left: number;
}

function clamp(value: number, min: number, max: number): number {
  // When the element is wider/taller than the available space (min > max),
  // prefer the leading edge (min) so it never disappears past the start margin.
  return Math.max(min, Math.min(value, max));
}

/**
 * Position a popover beside an anchor (e.g. the comment popover next to a
 * text selection). Prefers the right side, flips to the left when the right
 * side would overflow, then clamps within the viewport margins both axes.
 * Returns the top-left corner (for `position: fixed`).
 */
export function placeBesideAnchor(
  anchor: AnchorRect,
  size: Size,
  viewport: Viewport,
  opts: PlacementOptions = {}
): Position {
  const gap = opts.gap ?? 10;
  const margin = opts.margin ?? 8;

  let left = anchor.right + gap;
  if (left + size.width > viewport.width - margin) {
    left = anchor.left - gap - size.width;
  }
  left = clamp(left, margin, viewport.width - size.width - margin);

  const top = clamp(anchor.top, margin, viewport.height - size.height - margin);

  return { top, left };
}

/**
 * Position a toolbar centered above an anchor (used with
 * `transform: translateX(-50%)`, so `left` is the toolbar's center X). Clamps
 * the center so neither edge leaves the viewport, and flips below the anchor
 * when there's no room above.
 */
export function placeCenteredAbove(
  anchor: AnchorRect,
  size: Size,
  viewport: Viewport,
  opts: PlacementOptions = {}
): Position {
  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 8;

  const centerX = (anchor.left + anchor.right) / 2;
  const half = size.width / 2;
  const left = clamp(centerX, margin + half, viewport.width - margin - half);

  let top = anchor.top - size.height - gap;
  if (top < margin) {
    top = anchor.bottom + gap;
  }

  return { top, left };
}
