import { describe, it, expect } from "vitest";
import { messagePreview } from "./message-preview";

describe("messagePreview", () => {
  it("returns short text unchanged", () => {
    expect(messagePreview("hello")).toBe("hello");
  });

  it("handles null and undefined", () => {
    expect(messagePreview(null)).toBe("");
    expect(messagePreview(undefined)).toBe("");
  });

  it("never leaves a lone surrogate at the cut, which PostgREST rejects", () => {
    // 99 chars then an emoji, so a UTF-16 slice(0, 100) splits the pair.
    const text = "a".repeat(99) + "😀" + "tail";

    expect(text.slice(0, 100).isWellFormed()).toBe(false);
    expect(messagePreview(text).isWellFormed()).toBe(true);
  });

  it("counts emoji as one character rather than two", () => {
    expect(messagePreview("😀".repeat(120))).toBe("😀".repeat(100));
  });
});
