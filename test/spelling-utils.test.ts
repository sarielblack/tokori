import { describe, expect, it } from "vitest";
import {
  isSpellingMatch,
  maskSpellingTarget,
  normalizeSpellingAnswer,
} from "@/lib/study/spelling-utils";

describe("spelling-utils", () => {
  it("normalizes case, whitespace, and typographic punctuation", () => {
    expect(normalizeSpellingAnswer("  WELL‑KNOWN  ")).toBe("well-known");
    expect(isSpellingMatch("  rock‘n’roll ", "rock'n'roll")).toBe(true);
  });

  it("rejects an answer that is not the target word", () => {
    expect(isSpellingMatch("integral", "integrity")).toBe(false);
    expect(isSpellingMatch("", "integrity")).toBe(false);
  });

  it("masks only the target word in an example", () => {
    expect(
      maskSpellingTarget(
        "Ensuring data integrity is critical.",
        "integrity",
      ),
    ).toBe("Ensuring data _____ is critical.");
    expect(maskSpellingTarget("The integrity check passed.", "integral")).toBeNull();
  });
});
