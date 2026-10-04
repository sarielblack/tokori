import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { useProfile, type Theme } from "@/lib/profile-context";
import { useDisplay } from "@/lib/display-context";
import { UI_LANGUAGE_OPTIONS, uiText, type UiLanguage } from "@/lib/ui-language";

export function ProfileSection() {
  const { profile, update } = useProfile();
  const tx = (english: string, chinese: string) =>
    uiText(profile.uiLanguage, english, chinese);
  const {
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
  } = useDisplay();
  const fileInput = useRef<HTMLInputElement>(null);

  function chooseBackground(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(tx("Please choose an image file.", "请选择图片文件。"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(tx("Background image is too large", "背景图片太大"), {
        description: tx("Please choose an image smaller than 4 MB.", "请选择小于 4 MB 的图片。"),
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setBackgroundImage(reader.result);
    };
    reader.onerror = () => toast.error(tx("Couldn't read that image.", "无法读取这张图片。"));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {tx("Profile", "个人设置")}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {tx(
            "Used to greet you and to default new workspaces.",
            "用于显示称呼，并作为新工作区的默认设置。",
          )}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">{tx("Name", "名称")}</Label>
          <Input
            id="name"
            value={profile.name}
            placeholder={tx("What should I call you?", "希望 Tokori 如何称呼你？")}
            onChange={(e) => void update({ name: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="theme">{tx("Theme", "主题")}</Label>
          <Select
            value={profile.theme}
            onValueChange={(v) => void update({ theme: v as Theme })}
          >
            <SelectTrigger id="theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{tx("System", "跟随系统")}</SelectItem>
              <SelectItem value="light">{tx("Light", "浅色")}</SelectItem>
              <SelectItem value="dark">{tx("Dark", "深色")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ui-language">
            {tx("Interface language", "界面语言")}
          </Label>
          <Select
            value={profile.uiLanguage}
            onValueChange={(v) => void update({ uiLanguage: v as UiLanguage })}
          >
            <SelectTrigger id="ui-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {tx(
              "Changes Tokori's settings and navigation labels. Learning content stays in your target/native languages.",
              "切换 Tokori 的设置和导航文字；学习内容仍按你的目标语言和母语显示。",
            )}
          </p>
        </div>

        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="native">
            {tx("Default explanation language", "默认释义语言")}
          </Label>
          <Select
            value={profile.defaultNativeLang}
            onValueChange={(v) =>
              void update({ defaultNativeLang: v as LanguageCode })
            }
          >
            <SelectTrigger id="native">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name}{" "}
                  <span className="text-muted-foreground">· {l.nativeName}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {tx("Used as the default for new workspaces.", "作为新工作区的默认语言。")}
          </p>
        </div>

        <div className="space-y-3 md:col-span-2">
          <div>
            <Label>{tx("Personal background", "自定义背景")}</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx(
                "Optional local image behind the app. It is stored only on this computer and does not change your learning data.",
                "可选的本地背景图片。只保存在这台电脑上，不会影响学习数据。",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                chooseBackground(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="size-3.5" />
              {backgroundImage
                ? tx("Change image", "更换图片")
                : tx("Choose image", "选择图片")}
            </Button>
            {backgroundImage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setBackgroundImage(null)}
              >
                <Trash2 className="size-3.5" />
                {tx("Remove", "移除")}
              </Button>
            )}
          </div>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <Label htmlFor="background-opacity">
                {tx("Background opacity", "背景不透明度")}
              </Label>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(backgroundOpacity * 100)}%
              </span>
            </div>
            <input
              id="background-opacity"
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(backgroundOpacity * 100)}
              onChange={(e) => setBackgroundOpacity(Number(e.target.value) / 100)}
              className="w-full accent-[var(--color-brand)]"
              disabled={!backgroundImage}
            />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="background-blur">
                  {tx("Background blur", "背景模糊")}
                </Label>
                <span className="tabular-nums text-muted-foreground">
                  {backgroundBlur}px
                </span>
              </div>
              <input
                id="background-blur"
                type="range"
                min="0"
                max="24"
                step="1"
                value={backgroundBlur}
                onChange={(e) => setBackgroundBlur(Number(e.target.value))}
                className="w-full accent-[var(--color-brand)]"
                disabled={!backgroundImage}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="sidebar-opacity">
                  {tx("Sidebar transparency", "侧边栏透明度")}
                </Label>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(sidebarOpacity * 100)}%
                </span>
              </div>
              <input
                id="sidebar-opacity"
                type="range"
                min="25"
                max="100"
                step="5"
                value={Math.round(sidebarOpacity * 100)}
                onChange={(e) => setSidebarOpacity(Number(e.target.value) / 100)}
                className="w-full accent-[var(--color-brand)]"
                disabled={!backgroundImage}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="card-opacity">
                  {tx("Card transparency", "卡片透明度")}
                </Label>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(cardOpacity * 100)}%
                </span>
              </div>
              <input
                id="card-opacity"
                type="range"
                min="25"
                max="100"
                step="5"
                value={Math.round(cardOpacity * 100)}
                onChange={(e) => setCardOpacity(Number(e.target.value) / 100)}
                className="w-full accent-[var(--color-brand)]"
                disabled={!backgroundImage}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
