import type { Grade, ReviewedCardSummary, VocabEntry } from "@/lib/study/api";

/**
 * A resumable snapshot for the main vocabulary-recall flow.
 *
 * This intentionally lives in localStorage rather than the SQLite schema:
 * it is transient UI state, not learner history. FSRS grades are already
 * written to SQLite one card at a time by the host.
 */
export type VocabRecallStage = "word" | "reading" | "graded";

export type VocabRecallPhase = "recall" | "promptProd" | "production" | "doneFinal";

export type VocabRecallSnapshot = {
  version: 1;
  workspaceId: number;
  mode: "vocab-recall";
  /** Queue ids are allowed to repeat because Again cards are reinserted. */
  cardIds: number[];
  idx: number;
  sessionSize: number;
  stage: VocabRecallStage;
  knewPronunciation: boolean | null;
  knewMeaning: boolean | null;
  introducedIds: number[];
  phase: VocabRecallPhase;
  reviewedCount: number;
  grades: Record<Grade, number>;
  reviewedCards: ReviewedCardSummary[];
  startedAt: number;
  /** The durable study_sessions row this transient queue belongs to. */
  sessionId?: number;
};

const KEY_PREFIX = "tokori:study-session:";
const MODE = "vocab-recall" as const;
const RESUME_SUFFIX = ":resume";

function keyFor(workspaceId: number): string {
  return `${KEY_PREFIX}${workspaceId}:${MODE}`;
}

function resumeKeyFor(workspaceId: number): string {
  return `${KEY_PREFIX}${workspaceId}:${MODE}${RESUME_SUFFIX}`;
}

export function setVocabRecallResumeIntent(
  workspaceId: number,
  sessionId: number,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(resumeKeyFor(workspaceId), String(sessionId));
  } catch {
    /* noop */
  }
}

export function getVocabRecallResumeIntent(workspaceId: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(resumeKeyFor(workspaceId));
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function clearVocabRecallResumeIntent(workspaceId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(resumeKeyFor(workspaceId));
  } catch {
    /* noop */
  }
}

export function getVocabRecallSnapshotSessionId(workspaceId: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VocabRecallSnapshot>;
    // A session that was only opened, but never had a card graded, is not
    // something the user can meaningfully resume. Clear that empty snapshot
    // instead of surfacing a misleading "0 cards" continuation entry.
    const reviewedCount = parsed.reviewedCount;
    if (
      reviewedCount == null ||
      !Number.isInteger(reviewedCount) ||
      reviewedCount <= 0
    ) {
      clearVocabRecallSnapshot(workspaceId);
      return null;
    }
    const id = Number(parsed.sessionId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function saveVocabRecallSnapshot(snapshot: VocabRecallSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(snapshot.workspaceId), JSON.stringify(snapshot));
  } catch {
    // localStorage can be disabled or full. The live React state remains
    // authoritative until the user leaves the view.
  }
}

export function loadVocabRecallSnapshot(
  workspaceId: number,
  vocab: readonly VocabEntry[],
  dueVocab: readonly VocabEntry[],
): VocabRecallSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VocabRecallSnapshot;
    if (
      parsed?.version !== 1 ||
      parsed.workspaceId !== workspaceId ||
      parsed.mode !== MODE ||
      !Array.isArray(parsed.cardIds) ||
      parsed.cardIds.length === 0 ||
      !Number.isInteger(parsed.idx) ||
      !Number.isInteger(parsed.sessionSize) ||
      parsed.sessionSize <= 0 ||
      !Number.isInteger(parsed.reviewedCount) ||
      parsed.reviewedCount <= 0 ||
      !Array.isArray(parsed.introducedIds) ||
      !Array.isArray(parsed.reviewedCards)
    ) {
      clearVocabRecallSnapshot(workspaceId);
      return null;
    }

    // A snapshot can outlive a card deletion or a card becoming mastered.
    // Keep only cards that still exist in the current study snapshot. The
    // queue order and duplicate reinsertions are preserved.
    const byId = new Map<number, VocabEntry>();
    for (const card of vocab) byId.set(card.id, card);
    for (const card of dueVocab) byId.set(card.id, card);
    const survivingIds = parsed.cardIds.filter((id) => byId.has(id));
    if (survivingIds.length === 0) {
      clearVocabRecallSnapshot(workspaceId);
      return null;
    }

    const maxIdx = survivingIds.length;
    return {
      ...parsed,
      cardIds: survivingIds,
      idx: Math.max(0, Math.min(maxIdx, parsed.idx)),
      introducedIds: parsed.introducedIds.filter((id) => byId.has(id)),
      phase: parsed.phase ?? "recall",
      stage: parsed.stage ?? "word",
      knewPronunciation: parsed.knewPronunciation ?? null,
      knewMeaning: parsed.knewMeaning ?? null,
      reviewedCount: parsed.reviewedCount ?? 0,
      grades: {
        again: parsed.grades?.again ?? 0,
        hard: parsed.grades?.hard ?? 0,
        good: parsed.grades?.good ?? 0,
        easy: parsed.grades?.easy ?? 0,
      },
      startedAt: parsed.startedAt || Math.floor(Date.now() / 1000),
    };
  } catch {
    clearVocabRecallSnapshot(workspaceId);
    return null;
  }
}

export function clearVocabRecallSnapshot(workspaceId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(workspaceId));
  } catch {
    /* noop */
  }
}

export function hasVocabRecallSnapshot(workspaceId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(keyFor(workspaceId)) != null;
  } catch {
    return false;
  }
}
