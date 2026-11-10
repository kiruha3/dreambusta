/**
 * Регресс-тест BUG-DOC-02: изображение в сравнении версий должно получать
 * diff-статус (data-diff-status + контур), как paragraph/list. Раньше
 * ImageComponent игнорировал DiffBlockContext.
 */
import { describe, it, expect } from "vitest";
import React, { useMemo } from "react";
import { render, cleanup } from "@testing-library/react";
import { createEditor } from "slate";
import { Slate, Editable, withReact } from "slate-react";
import { renderElement } from "../elements";
import { DiffBlockContext, type BlockDiffMap } from "../DiffBlockContext";

function renderImageWithDiff(map: BlockDiffMap) {
  function Harness() {
    const editor = useMemo(() => {
      const e = withReact(createEditor());
      e.isVoid = (el: any) => el.type === "image";
      return e;
    }, []);
    const value = [
      {
        type: "image",
        uid: "img-1",
        src: "https://example.com/a.png",
        width: 100,
        height: 80,
        children: [{ text: "" }],
      },
    ] as any;
    return (
      <Slate editor={editor} initialValue={value}>
        <DiffBlockContext.Provider value={map}>
          <Editable renderElement={renderElement} readOnly />
        </DiffBlockContext.Provider>
      </Slate>
    );
  }
  return render(<Harness />);
}

describe("BUG-DOC-02: image diff status", () => {
  it("ставит data-diff-status на image при changed", () => {
    const map: BlockDiffMap = new Map([["img-1", "changed"]]);
    const { container } = renderImageWithDiff(map);
    const node = container.querySelector('[data-element-uid="img-1"]');
    expect(node).not.toBeNull();
    expect(node?.getAttribute("data-diff-status")).toBe("changed");
    cleanup();
  });

  it("не ставит data-diff-status, если изображения нет в diff-map", () => {
    const map: BlockDiffMap = new Map();
    const { container } = renderImageWithDiff(map);
    const node = container.querySelector('[data-element-uid="img-1"]');
    expect(node).not.toBeNull();
    expect(node?.getAttribute("data-diff-status")).toBeNull();
    cleanup();
  });

  it("подсвечивает сам <img> diff-контуром при added", () => {
    const map: BlockDiffMap = new Map([["img-1", "added"]]);
    const { container } = renderImageWithDiff(map);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // green outline (added) — см. DIFF_IMG_OUTLINE
    expect(img?.getAttribute("style") || "").toContain("34, 197, 94");
    cleanup();
  });
});
