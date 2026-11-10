import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVersioning } from "../useVersioning";

describe("useVersioning", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should initialize with empty versions", () => {
    const { result } = renderHook(() => useVersioning([{ text: "initial" }]));
    expect(result.current.versions).toHaveLength(0);
  });

  it("should create a version manually", () => {
    const { result } = renderHook(() => useVersioning([{ text: "initial" }]));

    act(() => {
      result.current.createVersion([{ text: "v1" }], "Manual save");
    });

    expect(result.current.versions).toHaveLength(1);
    expect(result.current.versions[0].description).toBe("Manual save");
    expect(result.current.versions[0].content).toEqual([{ text: "v1" }]);
  });

  it("should limit number of versions", () => {
    const { result } = renderHook(() => useVersioning([{ text: "initial" }]));

    for (let i = 0; i < 30; i++) {
      act(() => {
        result.current.createVersion([{ text: `v${i}` }]);
      });
    }

    expect(result.current.versions.length).toBeLessThanOrEqual(20);
  });
});
