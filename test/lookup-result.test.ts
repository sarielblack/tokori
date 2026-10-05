import { describe, expect, it } from "vitest";
import {
  compactDefinitionEn,
  EXAMPLES_DELIMITER,
  formatPartOfSpeech,
  fromDict,
  parseGlossWithExamples,
} from "@/lib/lookup-result";
import type { DictEntry } from "@/lib/db";

const entry = (over: Partial<DictEntry> = {}): DictEntry => ({
  word: "歩く",
  altWord: null,
  reading: "あるく",
  gloss: "to walk",
  ...over,
});

describe("parseGlossWithExamples", () => {
  it("returns the gloss unchanged when there's no examples marker", () => {
    expect(parseGlossWithExamples("to walk; to go on foot")).toEqual({
      gloss: "to walk; to go on foot",
      examples: [],
    });
  });

  it("splits the gloss from an examples block and parses em-dash pairs", () => {
    const gloss =
      `to walk${EXAMPLES_DELIMITER}毎日歩く — I walk every day\n公園を歩く — to walk in the park`;
    const parsed = parseGlossWithExamples(gloss);
    expect(parsed.gloss).toBe("to walk");
    expect(parsed.examples).toEqual([
      { target: "毎日歩く", native: "I walk every day" },
      { target: "公園を歩く", native: "to walk in the park" },
    ]);
  });

  it("falls back to hyphen separators and tolerates target-only lines", () => {
    const gloss = `door${EXAMPLES_DELIMITER}- la puerta - the door\n- una puerta`;
    const parsed = parseGlossWithExamples(gloss);
    expect(parsed.gloss).toBe("door");
    expect(parsed.examples).toEqual([
      { target: "la puerta", native: "the door" },
      { target: "una puerta", native: "" },
    ]);
  });
});

describe("formatPartOfSpeech", () => {
  it("turns Collins grammar codes into compact learner-facing labels", () => {
    expect(formatPartOfSpeech("N-UNCOUNT 不可数名词")).toBe("n. 不可数名词");
    expect(formatPartOfSpeech("V-T 及物动词")).toBe("v.t. 及物动词");
  });

  it("preserves unknown labels and handles empty values", () => {
    expect(formatPartOfSpeech("special label")).toBe("special label");
    expect(formatPartOfSpeech("  ")).toBeNull();
    expect(formatPartOfSpeech(null)).toBeNull();
  });
});

describe("compactDefinitionEn", () => {
  it("keeps only the first slash-separated learner-dictionary sense", () => {
    expect(
      compactDefinitionEn(
        "The ability to contain something / The amount a system can produce / A role or position",
      ),
    ).toBe("The ability to contain something");
  });

  it("truncates an unusually long first sense without splitting a word", () => {
    const result = compactDefinitionEn("a ".repeat(160), 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
  });
});

describe("fromDict", () => {
  it("maps a plain dict row, defaulting pitchAccent to null", () => {
    expect(fromDict(entry())).toEqual({
      reading: "あるく",
      gloss: "to walk",
      traditional: null,
      examples: undefined,
      inflectionOf: undefined,
      pitchAccent: null,
    });
  });

  it("carries the traditional form (altWord) through for CC-CEDICT rows", () => {
    const result = fromDict(
      entry({ word: "学习", altWord: "學習", reading: "xué xí", gloss: "to study" }),
    );
    expect(result.traditional).toBe("學習");
  });

  it("carries pitch accent and inflectionOf through", () => {
    const result = fromDict(
      entry({ pitchAccent: 2, inflectionOf: "歩く", word: "歩いた" }),
    );
    expect(result.pitchAccent).toBe(2);
    expect(result.inflectionOf).toBe("歩く");
  });

  it("extracts examples embedded in the gloss column", () => {
    const result = fromDict(
      entry({ gloss: `to walk${EXAMPLES_DELIMITER}毎日歩く — I walk every day` }),
    );
    expect(result.gloss).toBe("to walk");
    expect(result.examples).toEqual([
      { target: "毎日歩く", native: "I walk every day" },
    ]);
  });

  it("round-trips Collins related forms through dictionary metadata", () => {
    const result = fromDict(
      entry({
        gloss:
          'TOKORI_DICT_META_V1{"partOfSpeech":"V-ERG","derivatives":[{"word":"integrated","relation":"derived"},{"word":"integration","relation":"derived"}]}\nintegrate',
      }),
    );
    expect(result.derivatives).toEqual([
      { word: "integrated", relation: "derived" },
      { word: "integration", relation: "derived" },
    ]);
  });
});
