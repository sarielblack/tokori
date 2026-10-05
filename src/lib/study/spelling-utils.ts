/** Small, deterministic helpers shared by the spelling study mode and tests. */

/**
 * Make a learner's answer forgiving about casing and typographic punctuation
 * without changing the actual answer stored on the vocabulary card.
 */
export function normalizeSpellingAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function isSpellingMatch(input: string, expected: string): boolean {
  const answer = normalizeSpellingAnswer(input);
  return answer.length > 0 && answer === normalizeSpellingAnswer(expected);
}

/**
 * Replace the target word in an example with a blank. Returning null when the
 * target is not present is important: showing the untouched sentence would
 * accidentally reveal the answer in a spelling exercise.
 */
export function maskSpellingTarget(
  sentence: string,
  target: string,
): string | null {
  const escaped = target.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return null;
  const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu");
  if (!match.test(sentence)) return null;
  return sentence.replace(match, "$1_____" );
}
