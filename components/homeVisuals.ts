export type HomeBackgroundTone = "archive" | "midnight" | "lake" | "sunset";
export type HomeCardTone = "youth" | "sky" | "peach" | "lavender";
export type HomeCardAspectRatio = "14:9" | "3:2" | "4:3";
export type HomeCardCrop = { left: number; top: number; width: number; height: number };

export type HomeVisualImageKey =
  | "home_profile_avatar"
  | "home_background_url"
  | "home_hero_image"
  | "about_page_image"
  | "home_card_story_image"
  | "home_card_memory_image"
  | "home_card_timeline_image"
  | "home_card_campus_image"
  | "home_card_notes_image"
  | "home_card_about_image"
  | "home_card_messages_image";
export type HomeCardImageKey = Exclude<HomeVisualImageKey, "home_profile_avatar" | "home_background_url" | "home_hero_image" | "about_page_image">;

export const homeBackgroundToneOptions: Array<{
  value: HomeBackgroundTone;
  label: string;
  description: string;
  background: string;
  accent: string;
}> = [
  { value: "archive", label: "档案青绿", description: "延续当前青春档案的深青与荧光绿。", background: "#071f24", accent: "#baff67" },
  { value: "midnight", label: "深夜蓝", description: "更安静的深蓝底色，适合夜景照片。", background: "#081a2b", accent: "#8fd8ff" },
  { value: "lake", label: "湖水青", description: "更明亮的蓝绿色，保留玻璃空间感。", background: "#06343a", accent: "#8fffd0" },
  { value: "sunset", label: "暮色暖棕", description: "偏暖的黄昏底色，适合校园夕阳。", background: "#30211f", accent: "#ffc86a" },
];

export const homeCardToneOptions: Array<{
  value: HomeCardTone;
  label: string;
  description: string;
  color: string;
}> = [
  { value: "youth", label: "青春薄荷", description: "清爽青绿，与当前荧光强调色协调。", color: "#123b3b" },
  { value: "sky", label: "晴空蓝", description: "更轻盈的校园天空蓝，适合明亮照片。", color: "#17364a" },
  { value: "peach", label: "黄昏蜜桃", description: "带一点放学后夕阳的暖橙粉。", color: "#4a302f" },
  { value: "lavender", label: "晚风浅紫", description: "安静柔和的蓝紫色青春氛围。", color: "#34324f" },
];

export const homeCardAspectRatioOptions: Array<{ value: HomeCardAspectRatio; label: string; ratio: number }> = [
  { value: "14:9", label: "14:9 · 宽幅", ratio: 14 / 9 },
  { value: "3:2", label: "3:2 · 经典照片", ratio: 3 / 2 },
  { value: "4:3", label: "4:3 · 更完整主体", ratio: 4 / 3 },
];

export const homeVisualCardDefinitions: Array<{
  key: HomeCardImageKey;
  label: string;
  fallback: string;
}> = [
  { key: "home_card_story_image", label: "青春故事集", fallback: "" },
  { key: "home_card_memory_image", label: "3D 粒子树", fallback: "/assets/demo-1.svg" },
  { key: "home_card_timeline_image", label: "时间线", fallback: "" },
  { key: "home_card_campus_image", label: "校园碎片", fallback: "" },
  { key: "home_card_notes_image", label: "随手记", fallback: "" },
  { key: "home_card_about_image", label: "关于我们", fallback: "" },
  { key: "home_card_messages_image", label: "留言操场", fallback: "" },
];

export const defaultHomeVisualSettings = {
  home_profile_avatar: "",
  home_background_tone: "archive" as HomeBackgroundTone,
  home_background_color: "#071f24",
  home_accent_color: "#baff67",
  home_background_overlay_opacity: "28",
  home_background_blur: "8",
  home_background_url: "",
  home_hero_image: "",
  about_page_image: "",
  home_hero_caption_kicker: "CAMPUS · FRIENDS · SUNSET",
  home_hero_caption_title: "",
  home_card_tone: "youth" as HomeCardTone,
  home_card_tone_color: "#123b3b",
  home_card_surface_opacity: "62",
  home_card_image_overlay_opacity: "42",
  home_card_aspect_ratio: "14:9" as HomeCardAspectRatio,
  home_card_aspects: "{}",
  home_card_crops: "{}",
  home_card_visibility: "{}",
  home_card_order: "[]",
  home_card_story_image: "",
  home_card_memory_image: "",
  home_card_timeline_image: "",
  home_card_campus_image: "",
  home_card_notes_image: "",
  home_card_about_image: "",
  home_card_messages_image: "",
};

export function normalizeHomeCardVisibility(value: unknown): Record<HomeCardImageKey, boolean> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "{}"); } catch { parsed = {}; }
  }
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  return Object.fromEntries(homeVisualCardDefinitions.map(({ key }) => [key, source[key] !== false && source[key] !== 0 && source[key] !== "0"])) as Record<HomeCardImageKey, boolean>;
}

export function normalizeHomeCardOrder(value: unknown): HomeCardImageKey[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "[]"); } catch { parsed = []; }
  }
  const defaults = homeVisualCardDefinitions.map((card) => card.key);
  const allowed = new Set<HomeCardImageKey>(defaults);
  const ordered: HomeCardImageKey[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (allowed.has(item as HomeCardImageKey) && !ordered.includes(item as HomeCardImageKey)) ordered.push(item as HomeCardImageKey);
    }
  }
  return [...ordered, ...defaults.filter((key) => !ordered.includes(key))];
}

export function assignedHomeCardOrder(order: unknown, visibility: unknown): HomeCardImageKey[] {
  const keys = normalizeHomeCardOrder(order);
  const visible = normalizeHomeCardVisibility(visibility);
  return [...keys.filter((key) => visible[key]), ...keys.filter((key) => !visible[key])];
}

export function normalizeHomeCardAspectRatio(value: unknown): HomeCardAspectRatio {
  return homeCardAspectRatioOptions.some((option) => option.value === value)
    ? value as HomeCardAspectRatio
    : "14:9";
}

export function homeCardAspectRatioNumber(value: unknown) {
  const normalized = normalizeHomeCardAspectRatio(value);
  return homeCardAspectRatioOptions.find((option) => option.value === normalized)?.ratio || 14 / 9;
}

export function normalizeHomeCardAspects(value: unknown): Partial<Record<HomeCardImageKey, HomeCardAspectRatio>> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "{}"); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const result: Partial<Record<HomeCardImageKey, HomeCardAspectRatio>> = {};
  for (const card of homeVisualCardDefinitions) {
    const selected = (parsed as Record<string, unknown>)[card.key];
    if (homeCardAspectRatioOptions.some((option) => option.value === selected)) result[card.key] = selected as HomeCardAspectRatio;
  }
  return result;
}

export function normalizeHomeCardCrops(value: unknown): Record<string, HomeCardCrop> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value || "{}"); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const allowed = new Set(homeVisualCardDefinitions.map((card) => card.key));
  const result: Record<string, HomeCardCrop> = {};
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!allowed.has(key as HomeCardImageKey) || !raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const left = Number(source.left); const top = Number(source.top); const width = Number(source.width); const height = Number(source.height);
    if (![left, top, width, height].every(Number.isFinite) || width < 1 || height < 1) continue;
    const safeLeft = Math.min(99, Math.max(0, left));
    const safeTop = Math.min(99, Math.max(0, top));
    result[key] = {
      left: Math.round(safeLeft * 100) / 100,
      top: Math.round(safeTop * 100) / 100,
      width: Math.round(Math.min(100 - safeLeft, Math.max(1, width)) * 100) / 100,
      height: Math.round(Math.min(100 - safeTop, Math.max(1, height)) * 100) / 100,
    };
  }
  return result;
}

export function normalizeHomeBackgroundOverlayOpacity(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 28;
  return Math.min(80, Math.max(0, Math.round(parsed)));
}

export function normalizeHomeBackgroundBlur(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(30, Math.max(0, Math.round(parsed)));
}

export function normalizeHomeBackgroundTone(value: unknown): HomeBackgroundTone {
  return homeBackgroundToneOptions.some((option) => option.value === value)
    ? value as HomeBackgroundTone
    : "archive";
}

export function normalizeHomeCardTone(value: unknown): HomeCardTone {
  return homeCardToneOptions.some((option) => option.value === value)
    ? value as HomeCardTone
    : "youth";
}

export function normalizeHomeCardOpacity(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(90, Math.max(0, Math.round(parsed)));
}

export function normalizeHomeVisualColor(value: unknown, fallback: string) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

export function normalizeHomeVisualAsset(value: unknown, fallback = "") {
  const normalized = String(value || "").trim();
  if (normalized === "none") return "";
  if (!normalized) return fallback;
  if (/^\/(?:assets|uploads)\/[a-z0-9._~!$&'()*+,;=:@%/-]+$/i.test(normalized)) return normalized;
  if (/^https:\/\/[a-z0-9.-]+(?:\/[^\s"'<>]*)?$/i.test(normalized)) return normalized;
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(normalized)) return normalized;
  return fallback;
}

export function homeVisualCssUrl(value: string) {
  return value ? `url("${value.replace(/["\\\r\n]/g, "")}")` : "none";
}

export function homeVisualOverlay(color: string, alpha = 0.74) {
  const normalized = normalizeHomeVisualColor(color, "#071f24").slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const safeAlpha = Math.min(0.8, Math.max(0, Number(alpha) || 0));
  return `rgba(${red},${green},${blue},${safeAlpha})`;
}
