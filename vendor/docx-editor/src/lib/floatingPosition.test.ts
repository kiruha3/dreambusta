import { describe, it, expect } from "vitest";
import {
  placeBesideAnchor,
  placeCenteredAbove,
  type AnchorRect,
  type Size,
  type Viewport,
} from "./floatingPosition";

const viewport: Viewport = { width: 1000, height: 800 };

function anchor(partial: Partial<AnchorRect>): AnchorRect {
  return { top: 0, bottom: 0, left: 0, right: 0, ...partial };
}

describe("placeBesideAnchor — popover anchored to the right of a selection", () => {
  const size: Size = { width: 300, height: 200 };

  it("places the popover to the right of the anchor when it fits", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 100, right: 200, top: 300, bottom: 320 }),
      size,
      viewport
    );
    // default gap = 10
    expect(pos.left).toBe(210);
    expect(pos.top).toBe(300);
  });

  it("flips to the left of the anchor when the right side overflows the viewport", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 850, right: 950, top: 300, bottom: 320 }),
      size,
      viewport
    );
    // right would be 950 + 10 + 300 = 1260 > 1000 - 8 -> flip left: 850 - 10 - 300 = 540
    expect(pos.left).toBe(540);
  });

  it("clamps to the left margin when even the flipped placement is off-screen", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 120, right: 980, top: 300, bottom: 320 }),
      { width: 400, height: 200 },
      viewport
    );
    // right overflows; flipped left = 120 - 10 - 400 = -290 -> clamp to margin 8
    expect(pos.left).toBe(8);
  });

  it("clamps the top so the popover bottom stays within the viewport", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 100, right: 200, top: 700, bottom: 720 }),
      size,
      viewport
    );
    // 700 + 200 = 900 > 800 - 8 -> top = 800 - 200 - 8 = 592
    expect(pos.top).toBe(592);
  });

  it("clamps the top to the margin when the anchor is above the viewport", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 100, right: 200, top: -50, bottom: -10 }),
      size,
      viewport
    );
    expect(pos.top).toBe(8);
  });

  it("respects custom gap and margin options", () => {
    const pos = placeBesideAnchor(
      anchor({ left: 100, right: 200, top: 300, bottom: 320 }),
      size,
      viewport,
      { gap: 20, margin: 16 }
    );
    expect(pos.left).toBe(220);
  });
});

describe("placeCenteredAbove — toolbar centered above a selection (used with translateX(-50%))", () => {
  const size: Size = { width: 200, height: 44 };

  it("centers above the anchor when there is room", () => {
    const pos = placeCenteredAbove(
      anchor({ left: 400, right: 500, top: 300, bottom: 320 }),
      size,
      viewport
    );
    // center X = (400 + 500) / 2 = 450; top = 300 - 44 - 8 = 248
    expect(pos.left).toBe(450);
    expect(pos.top).toBe(248);
  });

  it("clamps the center so the toolbar's right edge stays on-screen", () => {
    const pos = placeCenteredAbove(
      anchor({ left: 950, right: 990, top: 300, bottom: 320 }),
      size,
      viewport
    );
    // center 970 -> right edge 1070 overflows; clamp center to 1000 - 8 - 100 = 892
    expect(pos.left).toBe(892);
  });

  it("clamps the center so the toolbar's left edge stays on-screen", () => {
    const pos = placeCenteredAbove(
      anchor({ left: 0, right: 20, top: 300, bottom: 320 }),
      size,
      viewport
    );
    // center 10 -> left edge -90 overflows; clamp center to 8 + 100 = 108
    expect(pos.left).toBe(108);
  });

  it("flips below the anchor when there is no room above", () => {
    const pos = placeCenteredAbove(
      anchor({ left: 400, right: 500, top: 20, bottom: 40 }),
      size,
      viewport
    );
    // above top = 20 - 44 - 8 = -32 < margin 8 -> flip below: bottom + gap = 40 + 8 = 48
    expect(pos.top).toBe(48);
  });
});
