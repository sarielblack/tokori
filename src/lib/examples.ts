/**
 * Per-word example sentences.
 *
 * Saved sentences live alongside the vocabulary row in
 * `vocab_entries.card_notes` as a JSON blob, prefixed with a sentinel
 * so the field stays compatible with handwritten notes that pre-date
 * this feature. Each entry tracks where it came from (`source`) so the
 * UI can distinguish user-saved sentences from unconfirmed AI output.
 *
 * Shared between the dict-detail page (where sentences are added /
 * generated) and the personal-dict Sentences view (where they're
 * browsed across all words).
 */

export type ExampleSentence = {
  /** Stable client id, used as React key + for delete operations. */
  id: string;
  /** Target-language sentence. */
  target: string;
  /** Native-language translation. Optional but encouraged. */
  native?: string;
  /** Where this sentence came from. Used for the small badge under each row. */
  source: "user" | "ai";
};

/** A small, dictionary-derived affix reference.  It is kept separate from
 * the model's morphology hints so the UI can show which information came
 * from Collins rather than presenting a spelling guess as a dictionary fact. */
export type DictionaryAffix = {
  affix: string;
  type: "prefix" | "suffix";
  meaningZh?: string;
  definitionEn?: string;
  exampleEn?: string;
};

/** Compact word-formation hints shown on vocabulary cards. These are kept
 * deliberately conservative: an empty field means the model could not make
 * a reliable claim, rather than an invented etymology. */
export type WordMorphology = {
  root?: string;
  components?: string[];
  prefixes?: string[];
  suffixes?: string[];
  family?: string[];
  note?: string;
  /** These hints are deliberately labelled: they are not formal dictionary
   * etymologies unless a trusted dictionary source is attached. */
  source?: "ai" | "dictionary";
  confidence?: "high" | "medium" | "low";
  dictionaryAffixes?: DictionaryAffix[];
};

/** Sentinel that prefixes the JSON in `card_notes`. Lets us tell
 *  apart structured example data from free-form notes a user might
 *  have written before this feature shipped. Pre-tokori-rename rows
 *  used `POLOT_EXAMPLES_V1` and were rewritten in migration v25. */
export const EXAMPLE_KEY = "TOKORI_EXAMPLES_V1";
export const MORPHOLOGY_KEY = "TOKORI_MORPHOLOGY_V1";

/** Find the end of the first JSON value in a string, respecting quoted
 * strings and escaped characters. This lets us append a second structured
 * section without breaking the original examples JSON. */
function jsonValueEnd(text: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let sawValue = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      sawValue = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
      sawValue = true;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (sawValue && depth === 0) return i + 1;
    }
  }
  return null;
}

function stableLegacyId(text: string): string {
  // FNV-1a is enough here: this is only a deterministic React/delete key,
  // not a security or database identifier.
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(16)}`;
}

function dedupeExamples(list: ExampleSentence[]): ExampleSentence[] {
  const byTarget = new Map<string, ExampleSentence>();
  for (const example of list) {
    const target = example.target.trim();
    if (!target) continue;
    const key = target.normalize("NFC").toLowerCase();
    const previous = byTarget.get(key);
    // If an older duplicate had no translation but a newer copy does, keep
    // the useful translation without changing the original sentence.
    if (!previous || (!previous.native?.trim() && example.native?.trim())) {
      byTarget.set(key, { ...example, target });
    }
  }
  return Array.from(byTarget.values());
}

/** Read the old human-readable `Example: ...` form used by early imports. */
export function parseLegacyExamples(raw: string | null | undefined): ExampleSentence[] {
  if (!raw || raw.startsWith(EXAMPLE_KEY)) return [];
  const out: ExampleSentence[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:example|sentence)\s*:\s*(.+?)\s*$/i);
    if (!match?.[1]) continue;
    const target = match[1].trim();
    out.push({
      id: stableLegacyId(target),
      target,
      source: "user",
    });
  }
  return dedupeExamples(out);
}

/** Preserve any free-form note text while removing legacy example lines. */
export function legacyNotesRemainder(raw: string | null | undefined): string {
  if (!raw || raw.startsWith(EXAMPLE_KEY)) return "";
  return raw
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:example|sentence)\s*:\s*.+?\s*$/i.test(line))
    .join("\n")
    .trim();
}

/** Extract examples from a `card_notes` blob. Returns an empty list
 *  for null / non-prefixed values so the caller doesn't have to
 *  branch on every read. */
export function parseExamples(raw: string | null | undefined): ExampleSentence[] {
  if (!raw) return [];
  if (!raw.startsWith(EXAMPLE_KEY)) return parseLegacyExamples(raw);
  try {
    const remainder = raw.slice(EXAMPLE_KEY.length).trim();
    const end = jsonValueEnd(remainder, 0);
    const json = end == null ? remainder : remainder.slice(0, end);
    const parsed = JSON.parse(json) as ExampleSentence[];
    if (!Array.isArray(parsed)) return [];
    return dedupeExamples(
      parsed.filter((e) => e && typeof e.target === "string"),
    );
  } catch {
    return [];
  }
}

export function serialiseExamples(list: ExampleSentence[]): string {
  return `${EXAMPLE_KEY}${JSON.stringify(dedupeExamples(list))}`;
}

function cleanMorphology(value: unknown): WordMorphology | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const stringList = (raw: unknown): string[] | undefined => {
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    if (!Array.isArray(raw)) return undefined;
    const values = raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  };
  const result: WordMorphology = {};
  if (typeof input.root === "string" && input.root.trim()) result.root = input.root.trim();
  const components = stringList(input.components);
  const prefixes = stringList(input.prefixes);
  const suffixes = stringList(input.suffixes);
  const family = stringList(input.family);
  if (components) result.components = components;
  if (prefixes) result.prefixes = prefixes;
  if (suffixes) result.suffixes = suffixes;
  if (family) result.family = family;
  if (typeof input.note === "string" && input.note.trim()) result.note = input.note.trim();
  if (input.source === "ai" || input.source === "dictionary") result.source = input.source;
  if (input.confidence === "high" || input.confidence === "medium" || input.confidence === "low") {
    result.confidence = input.confidence;
  }
  if (Array.isArray(input.dictionaryAffixes)) {
    const seen = new Set<string>();
    const dictionaryAffixes = input.dictionaryAffixes
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => {
        const affix = typeof item.affix === "string" ? item.affix.trim() : "";
        const type = item.type === "prefix" || item.type === "suffix" ? item.type : null;
        if (!affix || !type) return null;
        const key = `${type}:${affix.toLowerCase()}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const entry: DictionaryAffix = { affix, type };
        for (const field of ["meaningZh", "definitionEn", "exampleEn"] as const) {
          if (typeof item[field] === "string" && item[field].trim()) {
            entry[field] = item[field].trim();
          }
        }
        return entry;
      })
      .filter((item): item is DictionaryAffix => item !== null);
    if (dictionaryAffixes.length > 0) result.dictionaryAffixes = dictionaryAffixes;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Parse the optional morphology section appended after examples. */
export function parseMorphology(raw: string | null | undefined): WordMorphology | null {
  if (!raw) return null;
  const marker = raw.indexOf(MORPHOLOGY_KEY);
  if (marker < 0) return null;
  const remainder = raw.slice(marker + MORPHOLOGY_KEY.length).trim();
  const end = jsonValueEnd(remainder, 0);
  try {
    return cleanMorphology(JSON.parse(end == null ? remainder : remainder.slice(0, end)));
  } catch {
    return null;
  }
}

/** Preserve morphology when an example is edited or generated later. */
export function serialiseExamplesWithMorphology(
  list: ExampleSentence[],
  morphology: WordMorphology | null | undefined,
): string {
  const examples = serialiseExamples(list);
  const clean = cleanMorphology(morphology);
  return clean
    ? `${examples}\n${MORPHOLOGY_KEY}${JSON.stringify(clean)}`
    : examples;
}

/** Stable id for a freshly-minted example. crypto.randomUUID is missing
 *  on some older Tauri webviews (Linux WebKitGTK), so fall back to a
 *  64-bit random hex string — the id is only a React key + delete
 *  handle, so collision safety at this scale is fine. */
export function newExampleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pick the best saved example for `word` from a `card_notes` blob, or
 *  null when none fit. "Best" = the most recently saved entry whose
 *  target sentence actually contains the word, so a cloze mask /
 *  word-highlight still lands. Shared by sentence-mining (reuse a saved
 *  generation instead of re-spending tokens) and sentence-cards (fall
 *  back to a saved sentence when the library / AI yields nothing).
 *
 *  Containment is NFC-normalised and case-insensitive. CJK has no word
 *  boundaries so a plain substring test is correct there; for everything
 *  else we still substring-match because the saved sentence was written
 *  to contain the exact form we're looking for. */
export function pickSavedExample(
  cardNotes: string | null | undefined,
  word: string,
): ExampleSentence | null {
  if (!word) return null;
  const list = parseExamples(cardNotes);
  const w = word.normalize("NFC").toLowerCase();
  for (let i = list.length - 1; i >= 0; i--) {
    const ex = list[i];
    const target = ex.target?.normalize("NFC").toLowerCase();
    if (target && target.includes(w)) return ex;
  }
  return null;
}
