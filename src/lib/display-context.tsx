import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type DisplayContextValue = {
  showPinyin: boolean;
  setShowPinyin: (value: boolean) => void;
  togglePinyin: () => void;
  /** Global override for `((translation))` blurring in chat. When false
   *  (default), each translation span starts blurred and the user has
   *  to click to reveal it — the original "read target first" pedagogy.
   *  When true, every translation in the chat unblurs at once; useful
   *  when the user wants to skim a long reply. */
  showTranslations: boolean;
  setShowTranslations: (value: boolean) => void;
  toggleTranslations: () => void;
  /** Optional local image used behind the app shell. */
  backgroundImage: string | null;
  setBackgroundImage: (value: string | null) => void;
  backgroundOpacity: number;
  setBackgroundOpacity: (value: number) => void;
  backgroundBlur: number;
  setBackgroundBlur: (value: number) => void;
  sidebarOpacity: number;
  setSidebarOpacity: (value: number) => void;
  cardOpacity: number;
  setCardOpacity: (value: number) => void;
  /** True while the user holds Shift — used to "peek" highlights on mastered words. */
  shiftPressed: boolean;
};

const DisplayContext = createContext<DisplayContextValue | null>(null);

const PINYIN_KEY = "display.showPinyin";
const TRANSLATIONS_KEY = "display.showTranslations";
const BACKGROUND_IMAGE_KEY = "display.backgroundImage";
const BACKGROUND_OPACITY_KEY = "display.backgroundOpacity";
const BACKGROUND_BLUR_KEY = "display.backgroundBlur";
// v2 intentionally resets these two surface defaults. Earlier builds used
// nearly opaque panels, which hid the user's background even after the image
// feature was enabled.
const SIDEBAR_OPACITY_KEY = "display.sidebarOpacity.v2";
const CARD_OPACITY_KEY = "display.cardOpacity.v2";

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0, value));
}

function readStoredOpacity(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null || raw === "") return fallback;
  const saved = Number(raw);
  if (!Number.isFinite(saved)) return fallback;
  return clampOpacity(saved > 1 ? saved / 100 : saved);
}

function clampBlur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(24, Math.max(0, value));
}

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [showPinyin, setShowPinyinState] = useState<boolean>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(PINYIN_KEY) : null;
    return saved == null ? true : saved === "1";
  });
  const [showTranslations, setShowTranslationsState] = useState<boolean>(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(TRANSLATIONS_KEY) : null;
    // Default OFF — the blurred-translation pedagogy is the whole
    // point. Users who hate it can flip the EN toggle and the choice
    // sticks.
    return saved === "1";
  });
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(BACKGROUND_IMAGE_KEY);
  });
  const [backgroundOpacity, setBackgroundOpacityState] = useState<number>(() => {
    return readStoredOpacity(BACKGROUND_OPACITY_KEY, 0.2);
  });
  const [backgroundBlur, setBackgroundBlurState] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const raw = localStorage.getItem(BACKGROUND_BLUR_KEY);
    return raw == null ? 0 : clampBlur(Number(raw));
  });
  const [sidebarOpacity, setSidebarOpacityState] = useState<number>(() =>
    readStoredOpacity(SIDEBAR_OPACITY_KEY, 0.38),
  );
  const [cardOpacity, setCardOpacityState] = useState<number>(() =>
    readStoredOpacity(CARD_OPACITY_KEY, 0.62),
  );
  const [shiftPressed, setShiftPressed] = useState(false);

  useEffect(() => {
    localStorage.setItem(PINYIN_KEY, showPinyin ? "1" : "0");
  }, [showPinyin]);
  useEffect(() => {
    localStorage.setItem(TRANSLATIONS_KEY, showTranslations ? "1" : "0");
  }, [showTranslations]);
  useEffect(() => {
    try {
      if (backgroundImage) localStorage.setItem(BACKGROUND_IMAGE_KEY, backgroundImage);
      else localStorage.removeItem(BACKGROUND_IMAGE_KEY);
    } catch {
      // Keep the current run usable if a very large data URL exceeds quota.
    }
  }, [backgroundImage]);
  useEffect(() => {
    try {
      localStorage.setItem(BACKGROUND_OPACITY_KEY, String(backgroundOpacity));
    } catch {
      /* best effort */
    }
  }, [backgroundOpacity]);
  useEffect(() => {
    try {
      localStorage.setItem(BACKGROUND_BLUR_KEY, String(backgroundBlur));
      localStorage.setItem(SIDEBAR_OPACITY_KEY, String(sidebarOpacity));
      localStorage.setItem(CARD_OPACITY_KEY, String(cardOpacity));
    } catch {
      /* best effort */
    }
  }, [backgroundBlur, sidebarOpacity, cardOpacity]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(false);
    };
    const onBlur = () => setShiftPressed(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const setShowPinyin = useCallback((value: boolean) => setShowPinyinState(value), []);
  const togglePinyin = useCallback(() => setShowPinyinState((p) => !p), []);
  const setShowTranslations = useCallback(
    (value: boolean) => setShowTranslationsState(value),
    [],
  );
  const toggleTranslations = useCallback(
    () => setShowTranslationsState((p) => !p),
    [],
  );
  const setBackgroundImage = useCallback(
    (value: string | null) => setBackgroundImageState(value),
    [],
  );
  const setBackgroundOpacity = useCallback(
    (value: number) => setBackgroundOpacityState(clampOpacity(value)),
    [],
  );
  const setBackgroundBlur = useCallback(
    (value: number) => setBackgroundBlurState(clampBlur(value)),
    [],
  );
  const setSidebarOpacity = useCallback(
    (value: number) => setSidebarOpacityState(clampOpacity(value)),
    [],
  );
  const setCardOpacity = useCallback(
    (value: number) => setCardOpacityState(clampOpacity(value)),
    [],
  );

  return (
    <DisplayContext.Provider
      value={{
        showPinyin,
        setShowPinyin,
        togglePinyin,
        showTranslations,
        setShowTranslations,
        toggleTranslations,
        backgroundImage,
        setBackgroundImage,
        backgroundOpacity,
        setBackgroundOpacity,
        backgroundBlur,
        setBackgroundBlur,
        sidebarOpacity,
        setSidebarOpacity,
        cardOpacity,
        setCardOpacity,
        shiftPressed,
      }}
    >
      {children}
    </DisplayContext.Provider>
  );
}

export function useDisplay() {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error("useDisplay outside DisplayProvider");
  return ctx;
}
