import { CEDICT_MINI } from "@/data/cedict-mini";
import type { DictEntry } from "@/lib/db";

export type ExampleSentence = { target: string; native: string };

/** A related form preserved from a learner dictionary entry. Collins uses
 * these rows for forms such as `integrated` and `integration`; they are
 * related-word hints, not an asserted etymology. */
export type DictionaryDerivative = {
  word: string;
  relation?: "derived" | "related";
};

export type LookupResult = {
  reading: string | null;
  gloss: string;
  /** Collins-style grammatical label, e.g. "N-COUNT 可数名词". */
  partOfSpeech?: string | null;
  /** Optional English learner-dictionary definition. */
  definitionEn?: string | null;
  /** Optional accent-specific IPA carried by an imported dictionary. */
  readingUs?: string | null;
  readingUk?: string | null;
  /** Related / derived forms preserved from the source dictionary. */
  derivatives?: DictionaryDerivative[];
  /** Optional trusted morphology fields from a dictionary importer. */
  root?: string | null;
  prefixes?: string[];
  suffixes?: string[];
  /** Traditional-Chinese headword, when the dictionary carries one.
   *  CC-CEDICT stores both forms; this is the entry's `altWord`. The
   *  click-to-define popover renders this as the headword when the
   *  workspace's Chinese script preference is "traditional". Null /
   *  absent for languages with no traditional variant, and for words
   *  whose traditional form equals the simplified one. */
  traditional?: string | null;
  /** Optional example sentences. Populated by the LLM-translate path
   *  (not present on packaged-dict hits) and rendered as a small
   *  numbered list at the bottom of the popover. */
  examples?: ExampleSentence[];
  /** Populated when the dict lookup matched a lemma rather than the
   *  surface form the user clicked (e.g. clicked "geht", matched
   *  "gehen"). The popover renders this as a small "inflected form
   *  of …" hint above the gloss so the learner sees the connection. */
  inflectionOf?: string;
  /** Japanese pitch-accent number (drop position over the reading's
   *  mora). Populated when the JMdict row carries augmented kanjium
   *  data. Null on non-JA dicts and on JA words without coverage —
   *  the renderer falls back to plain kana when null. */
  pitchAccent?: number | null;
};

/** Convert compact dictionary grammar codes into learner-facing labels.
 *
 * Imported Collins rows keep their original `partOfSpeech` value in the
 * database. This is only a display formatter: e.g. `N-UNCOUNT 不可数名词`
 * becomes `n. 不可数名词`, while the stored dictionary data remains intact.
 */
export function formatPartOfSpeech(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = raw.match(/^([A-Z][A-Z-]*)(?:\s+(.*))?$/i);
  if (!match) return raw;
  const code = match[1].toUpperCase();
  const remainder = match[2]?.trim() ?? "";
  const compact: Record<string, string> = {
    N: "n.",
    "N-COUNT": "n.",
    "N-UNCOUNT": "n.",
    "N-PLURAL": "n.",
    V: "v.",
    "V-T": "v.t.",
    "V-I": "v.i.",
    ADJ: "adj.",
    ADV: "adv.",
    PREP: "prep.",
    CONJ: "conj.",
    PRON: "pron.",
    DET: "det.",
    AUX: "aux.",
    MODAL: "modal v.",
  };
  const label = compact[code];
  if (!label) return raw;
  return remainder ? `${label} ${remainder}` : label;
}

export function fromMini(word: string): LookupResult | null {
  const e = CEDICT_MINI[word];
  return e ? { reading: e.pinyin, gloss: e.gloss } : null;
}

/**
 * Extra structured fields for imported dictionaries are carried inside the
 * existing `dict_entries.gloss` column. This keeps the database migration-free
 * for custom dictionaries while preserving the old DictEntry wire shape.
 * The marker is internal and is removed before anything is shown to learners.
 */
export const DICTIONARY_META_KEY = "TOKORI_DICT_META_V1";

export type DictionaryMeta = {
  partOfSpeech?: string | null;
  definitionEn?: string | null;
  readingUs?: string | null;
  readingUk?: string | null;
  derivatives?: DictionaryDerivative[];
  root?: string | null;
  prefixes?: string[];
  suffixes?: string[];
};

function cleanStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : undefined;
}

function cleanDerivatives(value: unknown): DictionaryDerivative[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const list: DictionaryDerivative[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const word = typeof record.word === "string" ? record.word.trim() : "";
    if (!word) continue;
    const key = word.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      word,
      relation: record.relation === "related" ? "related" : "derived",
    });
  }
  return list.length > 0 ? list.slice(0, 24) : undefined;
}

function cleanDictionaryMeta(meta?: DictionaryMeta): DictionaryMeta {
  const out: DictionaryMeta = {};
  for (const field of ["partOfSpeech", "definitionEn", "readingUs", "readingUk", "root"] as const) {
    const value = meta?.[field];
    if (typeof value === "string" && value.trim()) out[field] = value.trim();
  }
  const prefixes = cleanStringList(meta?.prefixes);
  const suffixes = cleanStringList(meta?.suffixes);
  const derivatives = cleanDerivatives(meta?.derivatives);
  if (prefixes) out.prefixes = prefixes;
  if (suffixes) out.suffixes = suffixes;
  if (derivatives) out.derivatives = derivatives;
  return out;
}

export function encodeDictionaryGloss(
  gloss: string,
  meta?: DictionaryMeta,
  examples?: ExampleSentence[],
): string {
  const cleanMeta = cleanDictionaryMeta(meta);
  const base = gloss.trim();
  const exampleBlock = (examples ?? [])
    .filter((e) => e?.target?.trim())
    .map((e) => `• ${e.target.trim()} — ${(e.native ?? "").trim()}`.trimEnd())
    .join("\n");
  const withExamples = exampleBlock
    ? `${base}${EXAMPLES_DELIMITER}${exampleBlock}`
    : base;
  return Object.keys(cleanMeta).length > 0
    ? `${DICTIONARY_META_KEY}${JSON.stringify(cleanMeta)}\n${withExamples}`
    : withExamples;
}

function unpackDictionaryGloss(raw: string): { body: string; meta: DictionaryMeta } {
  if (!raw.startsWith(DICTIONARY_META_KEY)) return { body: raw, meta: {} };
  const newline = raw.indexOf("\n", DICTIONARY_META_KEY.length);
  if (newline < 0) return { body: raw, meta: {} };
  try {
    const parsed = JSON.parse(raw.slice(DICTIONARY_META_KEY.length, newline)) as DictionaryMeta;
    return { body: raw.slice(newline + 1), meta: parsed ?? {} };
  } catch {
    return { body: raw, meta: {} };
  }
}

// Marker we use to round-trip examples through the dict's `gloss`
// column (which is the only text field we have on dict_entries — no
// schema migration needed). The popover splits on this back out so
// the user sees a clean definition + a separate "Examples" block,
// even after a reload that re-reads the saved entry.
export const EXAMPLES_DELIMITER = "\n\n— examples —\n";

export function parseGlossWithExamples(gloss: string): {
  gloss: string;
  examples: ExampleSentence[];
  partOfSpeech?: string | null;
  definitionEn?: string | null;
  readingUs?: string | null;
  readingUk?: string | null;
  derivatives?: DictionaryDerivative[];
  root?: string | null;
  prefixes?: string[];
  suffixes?: string[];
} {
  const unpacked = unpackDictionaryGloss(gloss);
  const idx = unpacked.body.indexOf(EXAMPLES_DELIMITER);
  if (idx === -1) {
    return {
      gloss: unpacked.body,
      examples: [],
      ...unpacked.meta,
    };
  }
  const head = unpacked.body.slice(0, idx).trim();
  const tail = unpacked.body.slice(idx + EXAMPLES_DELIMITER.length);
  const examples: ExampleSentence[] = [];
  for (const line of tail.split("\n")) {
    const t = line.replace(/^[•\-*\s]+/, "").trim();
    if (!t) continue;
    // Format we write: "TARGET — NATIVE". Split on " — " (em dash)
    // first, fall back to " - " (hyphen) for legacy edits.
    const m = t.split(/\s+—\s+|\s+-\s+/);
    if (m.length >= 2) {
      examples.push({ target: m[0].trim(), native: m.slice(1).join(" - ").trim() });
    } else {
      examples.push({ target: t, native: "" });
    }
  }
  return { gloss: head, examples, ...unpacked.meta };
}

export function fromDict(e: DictEntry): LookupResult {
  const {
    gloss,
    examples,
    partOfSpeech,
    definitionEn,
    readingUs,
    readingUk,
    derivatives,
    root,
    prefixes,
    suffixes,
  } =
    parseGlossWithExamples(e.gloss);
  return {
    reading: e.reading,
    gloss,
    partOfSpeech,
    definitionEn,
    readingUs,
    readingUk,
    derivatives,
    root,
    prefixes,
    suffixes,
    traditional: e.altWord,
    examples: examples.length > 0 ? examples : undefined,
    inflectionOf: e.inflectionOf,
    pitchAccent: e.pitchAccent ?? null,
  };
}
