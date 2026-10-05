import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Keyboard,
  Pause,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrestartShell } from "@/lib/study/prestart";
import { PauseOverlay, TopBarButton } from "@/lib/study/session-controls";
import { useTTS } from "@/lib/tts-context";
import {
  buildStudySessionQueue,
  UNCAPPED_DAILY_LIMITS,
  useStudyConfig,
} from "@/lib/study-config";
import {
  type Grade,
  type ReviewedCardSummary,
  type StudyPlugin,
  type StudyViewProps,
  type VocabEntry,
} from "@/lib/study/api";
import { parseExamples, type ExampleSentence } from "@/lib/examples";
import {
  maskSpellingTarget,
  normalizeSpellingAnswer,
} from "@/lib/study/spelling-utils";
import { cn } from "@/lib/utils";

const spellingPractice: StudyPlugin = {
  meta: {
    id: "spelling-practice",
    name: "Spelling practice",
    description: "Type the English word from its meaning and context.",
    icon: Keyboard,
    supportedLangs: ["en"],
  },
    StudyView: SpellingStudyView,
};

export default spellingPractice;

type GradeCounts = {
  again: number;
  hard: number;
  good: number;
  easy: number;
};

type SessionBookkeeping = GradeCounts & {
  cardsReviewed: number;
  correct: number;
};

type SpellingStage = "spelling" | "word-card";

const EMPTY_GRADES: GradeCounts = {
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
};

function gradeSnapshot(stats: GradeCounts): GradeCounts {
  return {
    again: stats.again,
    hard: stats.hard,
    good: stats.good,
    easy: stats.easy,
  };
}

export function SpellingStudyView({ ctx }: StudyViewProps) {
  const { config } = useStudyConfig(ctx.workspace.id, ctx.workspace.targetLang);
  const tts = useTTS();
  const availableCards = useMemo(
    () =>
      buildStudySessionQueue(
        ctx.dueVocab,
        ctx.vocab,
        ctx.customScope ? UNCAPPED_DAILY_LIMITS : config,
      ),
    [ctx.customScope, ctx.dueVocab, ctx.vocab, config],
  );
  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState<VocabEntry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [mistake, setMistake] = useState<{ actual: string; position: number } | null>(null);
  const [stage, setStage] = useState<SpellingStage>("spelling");
  const [grading, setGrading] = useState(false);
  const [paused, setPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionStartedRef = useRef(false);
  const endedRef = useRef(false);
  const statsRef = useRef<SessionBookkeeping>({
    ...EMPTY_GRADES,
    cardsReviewed: 0,
    correct: 0,
  });
  const reviewedCardsRef = useRef<ReviewedCardSummary[]>([]);

  const studyPaused = paused || ctx.sessionPaused;
  const card = queue?.[index] ?? null;
  const examples = useMemo(
    () => (card ? parseExamples(card.cardNotes) : []),
    [card],
  );
  const example = examples[0] ?? null;
  const maskedExample = example
    ? maskSpellingTarget(example.target, card?.word ?? "")
    : null;
  const targetLetters = card ? spellingLetters(card.word) : "";

  useEffect(() => {
    if (!started || !queue || queue.length === 0 || sessionStartedRef.current) {
      return;
    }
    sessionStartedRef.current = true;
    void ctx.ensureSessionStarted("review");
  }, [ctx, queue, started]);

  useEffect(() => {
    if (!started || stage !== "spelling" || studyPaused) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [index, stage, started, studyPaused]);

  useEffect(() => {
    if (!started || stage !== "spelling" || studyPaused) return;

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || submitted || grading) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        setInput((value) => value.slice(0, -1));
        setMistake(null);
        return;
      }
      if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
        event.preventDefault();
        consumeLetters(event.key);
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [started, stage, studyPaused, submitted, grading, input, targetLetters]);

  const autoplayRun = useRef(0);
  useEffect(() => {
    if (!started || !card || stage !== "word-card" || studyPaused || !config.autoplayAudio) {
      return;
    }
    const run = ++autoplayRun.current;
    let cancelled = false;
    void (async () => {
      await tts.speak(card.word, ctx.workspace.targetLang, { silent: true });
      if (cancelled || run !== autoplayRun.current) return;
      if (example?.target) {
        await tts.speak(example.target, ctx.workspace.targetLang, { silent: true });
      }
    })();
    return () => {
      cancelled = true;
      autoplayRun.current += 1;
      tts.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, card?.id, stage, studyPaused, config.autoplayAudio, example?.target]);

  function resetCard() {
    setInput("");
    setSubmitted(false);
    setCorrect(null);
    setMistake(null);
    setStage("spelling");
    setGrading(false);
  }

  function completeAnswer(value: string) {
    if (!card || submitted) return;
    setInput(value);
    setMistake(null);
    setSubmitted(true);
    setCorrect(true);
    setStage("word-card");
    void ctx.bump("words_seen");
  }

  function revealWordCard() {
    if (!card || submitted || grading) return;
    setInput(targetLetters);
    setMistake(null);
    setSubmitted(true);
    setCorrect(false);
    setStage("word-card");
    void ctx.bump("words_seen");
  }

  function consumeLetters(raw: string) {
    if (!card || submitted || grading || studyPaused) return;
    let next = input;
    let nextMistake: { actual: string; position: number } | null = null;
    for (const rawChar of normalizeSpellingAnswer(raw)) {
      const char = rawChar.toLocaleLowerCase();
      if (!/[a-z]/.test(char)) continue;
      if (next.length >= targetLetters.length) break;
      const expected = targetLetters[next.length];
      if (char !== expected) {
        nextMistake = { actual: char, position: next.length + 1 };
        break;
      }
      next += char;
    }
    setInput(next);
    setMistake(nextMistake);
    if (next.length === targetLetters.length && targetLetters.length > 0) {
      completeAnswer(next);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (submitted || grading || studyPaused) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      setInput((value) => value.slice(0, -1));
      setMistake(null);
      return;
    }
    if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
      event.preventDefault();
      consumeLetters(event.key);
    }
  }

  function handlePaste(event: ReactClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    consumeLetters(event.clipboardData.getData("text"));
  }

  async function gradeCard(grade: Grade) {
    if (!card || !submitted || grading || endedRef.current) return;
    setGrading(true);
    try {
      await ctx.reviewVocab(card.id, grade);
    } catch {
      // Keep the card on screen so a transient persistence failure does not
      // silently advance the spelling session.
      setGrading(false);
      return;
    }

    const stats = statsRef.current;
    stats[grade] += 1;
    stats.cardsReviewed += 1;
    if (correct) stats.correct += 1;
    reviewedCardsRef.current.push({
      word: card.word,
      reading: card.reading,
      gloss: card.gloss,
      grade,
    });

    const nextCount = stats.cardsReviewed;
    setIndex((current) => current + 1);

    if (queue && index + 1 >= queue.length) {
      endedRef.current = true;
      ctx.onSessionEnd({
        cardsReviewed: nextCount,
        durationSecs: ctx.sessionActiveSecs,
        grades: gradeSnapshot(stats),
        reviewedCards: [...reviewedCardsRef.current],
        extra: {
          correct: stats.correct,
          accuracy: nextCount > 0 ? stats.correct / nextCount : 0,
        },
      });
      return;
    }

    resetCard();
  }

  function endSession() {
    if (endedRef.current) return;
    endedRef.current = true;
    ctx.onSessionEnd({
      cardsReviewed: statsRef.current.cardsReviewed,
      durationSecs: ctx.sessionActiveSecs,
      grades: gradeSnapshot(statsRef.current),
      reviewedCards: [...reviewedCardsRef.current],
      extra: {
        correct: statsRef.current.correct,
        accuracy:
          statsRef.current.cardsReviewed > 0
            ? statsRef.current.correct / statsRef.current.cardsReviewed
            : 0,
      },
    });
  }

  function pauseSession() {
    if (studyPaused) return;
    setPaused(true);
    ctx.pauseSession();
  }

  function resumeSession() {
    if (!studyPaused) return;
    setPaused(false);
    ctx.resumeSession();
  }

  if (!started) {
    return (
      <PrestartShell
        icon={Keyboard}
        pluginName="Spelling practice"
        title="Type the word from memory."
        description="Read the meaning, type the English word, then choose how soon to review it."
        drillMode={ctx.drillMode}
        setDrillMode={ctx.setDrillMode}
        srsAnchorState={ctx.srsAnchorState}
        onBack={ctx.onChangeMode}
        onStart={() => {
          setQueue(availableCards);
          setStarted(true);
        }}
        startLabel="Start spelling"
        startDisabled={availableCards.length === 0}
        startHint={
          availableCards.length > 0
            ? `${availableCards.length} cards ready`
            : "No cards are ready to practise"
        }
      >
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
          Submit an answer first. Then choose <span className="font-medium text-foreground">Familiar</span> to review later or <span className="font-medium text-foreground">Not familiar</span> to see it again sooner.
        </div>
      </PrestartShell>
    );
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-3">
          <CheckCircle2 className="mx-auto size-7 text-emerald-600" />
          <h2 className="font-serif text-3xl tracking-tight">No cards ready.</h2>
          <p className="text-sm text-muted-foreground">
            There are no active English cards in today&apos;s study queue.
          </p>
          <Button variant="outline" onClick={() => ctx.onChangeMode?.()}>
            Back to study modes
          </Button>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-3">
          <CheckCircle2 className="mx-auto size-7 text-emerald-600" />
          <h2 className="font-serif text-3xl tracking-tight">Session complete.</h2>
          <p className="text-sm text-muted-foreground">
            {statsRef.current.cardsReviewed} card{statsRef.current.cardsReviewed === 1 ? "" : "s"} reviewed.
          </p>
          <Button onClick={endSession}>See session summary</Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="relative flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TopBarButton
              onClick={endSession}
              tooltip="End spelling session"
            >
              <ArrowLeft className="size-4" />
            </TopBarButton>
            <span>{index + 1} / {queue.length}</span>
          </div>
          <TopBarButton onClick={pauseSession} tooltip="Pause">
            <Pause className="size-4" />
          </TopBarButton>
        </header>

        <main
          className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-10 pt-12"
          onClick={() => {
            if (stage === "spelling") inputRef.current?.focus();
          }}
        >
          <div className="w-full max-w-2xl space-y-7">
            <div className="space-y-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Spelling practice
              </p>
              {stage === "spelling" ? (
                <>
                  <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
                    What&apos;s the word?
                  </h1>
                  <p className="text-base leading-relaxed text-foreground/80">
                    {card.gloss || card.translation || "Recall the English word from memory."}
                  </p>
                </>
              ) : null}
            </div>

            {stage === "spelling" && maskedExample && (
              <div className="rounded-2xl border border-border/70 bg-card/70 px-5 py-4 text-center text-sm leading-relaxed text-foreground/85">
                <p>{maskedExample}</p>
                {example?.native && (
                  <p className="mt-2 text-muted-foreground">{example.native}</p>
                )}
              </div>
            )}

            {stage === "spelling" ? (
              <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
                <SpellingSlots
                  target={targetLetters}
                  typed={input}
                  mistake={mistake != null}
                />
                <Input
                  ref={inputRef}
                  value={input}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  readOnly
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={submitted || grading || studyPaused}
                  className="pointer-events-auto absolute -left-[9999px] h-px w-px border-0 p-0 opacity-0"
                  aria-label="Type the spelling one letter at a time"
                />
                {!submitted && mistake ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-rose-700">
                    <XCircle className="size-4" />
                    <span>That letter is not right — try again.</span>
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Type the letters one at a time.
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={revealWordCard}
                  disabled={grading || studyPaused}
                  className="mx-auto text-muted-foreground"
                >
                  I don&apos;t know
                </Button>
              </div>
            ) : (
              <WordCardReveal
                card={card}
                example={example}
                correct={correct === true}
              />
            )}

            {stage === "word-card" && submitted && (
              <div className="grid grid-cols-2 gap-5 pt-3">
                <GradeButton
                  title="Familiar"
                  subtitle="Review later"
                  onClick={() => void gradeCard("good")}
                  disabled={grading || studyPaused}
                />
                <GradeButton
                  title="Not familiar"
                  subtitle="Review sooner"
                  onClick={() => void gradeCard("again")}
                  disabled={grading || studyPaused}
                />
              </div>
            )}
          </div>
        </main>

        {studyPaused && (
          <PauseOverlay
            progress={(statsRef.current.cardsReviewed / Math.max(1, queue.length)) * 100}
            done={statsRef.current.cardsReviewed}
            total={queue.length}
            elapsedSecs={ctx.sessionActiveSecs}
            onResume={resumeSession}
            onEnd={endSession}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function spellingLetters(word: string): string {
  return normalizeSpellingAnswer(word).replace(/[^a-z]/g, "");
}

function WordCardReveal({
  card,
  example,
  correct,
}: {
  card: VocabEntry;
  example: ExampleSentence | null;
  correct: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/75 px-6 py-8 text-center shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Word card
      </p>
      <h2 className="mt-3 font-serif text-5xl tracking-tight">{card.word}</h2>
      {card.reading && (
        <p className="mt-3 text-sm text-muted-foreground">{card.reading}</p>
      )}
      <p className="mt-5 text-base leading-relaxed text-foreground/85">
        {card.gloss || card.translation || "No saved definition yet."}
      </p>
      {example && (
        <div className="mt-6 rounded-2xl border border-border/60 bg-background/40 px-5 py-4 text-left text-sm leading-relaxed">
          <p>{example.target}</p>
          {example.native && (
            <p className="mt-2 text-muted-foreground">{example.native}</p>
          )}
        </div>
      )}
      <p className="mt-5 text-xs text-muted-foreground">
        {correct
          ? "Spelling correct. Take a moment to review the word."
          : "Here is the word. Take a moment to review it."}
      </p>
    </div>
  );
}

function SpellingSlots({
  target,
  typed,
  mistake,
}: {
  target: string;
  typed: string;
  mistake: boolean;
}) {
  return (
    <div
      className="flex min-h-16 flex-wrap items-end justify-center gap-x-2 gap-y-3 px-2"
      aria-label={`${target.length} letter word`}
    >
      {Array.from(target).map((_, index) => {
        const filled = typed[index] ?? "";
        const active = index === typed.length;
        return (
          <span
            key={index}
            className={cn(
              "flex h-12 w-8 items-end justify-center border-b-2 pb-1 text-2xl font-medium leading-none transition-colors",
              active && mistake
                ? "border-rose-500 text-rose-700"
                : filled
                  ? "border-foreground/70 text-foreground"
                  : "border-foreground/30 text-foreground",
            )}
          >
            {filled}
          </span>
        );
      })}
    </div>
  );
}

function GradeButton({
  title,
  subtitle,
  onClick,
  disabled,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-border bg-card/60 px-4 py-3 text-center transition-colors hover:border-foreground/35 hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="font-medium">{title}</span>
      <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}
