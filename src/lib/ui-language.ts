/** The language used by Tokori's own interface (independent of a workspace's
 * target/native language pair). Keep this deliberately small until the rest
 * of the UI is migrated to the same dictionary. */
export type UiLanguage = "en" | "zh-CN";

export const UI_LANGUAGE_OPTIONS: Array<{
  value: UiLanguage;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
];

export function uiText(language: UiLanguage, english: string, chinese: string) {
  return language === "zh-CN" ? chinese : english;
}
