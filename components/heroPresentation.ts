export type HeroArtStyle = "editorial" | "dreamy" | "cinematic";
export type HeroMotionLevel = "quiet" | "balanced" | "vivid";

export const defaultHeroPresentationSettings = {
  hero_primary_button: "开始翻阅",
  hero_secondary_button: "进入 3D 粒子树",
  hero_art_style: "editorial",
  hero_motion_level: "vivid",
  hero_show_captions: "1",
};

export function visibleHeroSecondaryButton(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return !text || text === "进入 3D 记忆河" ? "进入 3D 粒子树" : text;
}

export const heroArtStyleOptions: Array<{ value: HeroArtStyle; label: string; description: string }> = [
  { value: "editorial", label: "编辑部拼贴", description: "清透纸感、大字与错落相框，适合校园纪事。" },
  { value: "dreamy", label: "雾光梦境", description: "更柔和的蓝绿光晕与轻盈漂浮感。" },
  { value: "cinematic", label: "夜色电影", description: "深色舞台与高对比照片，更沉浸。" },
];

export const heroMotionLevelOptions: Array<{ value: HeroMotionLevel; label: string; description: string }> = [
  { value: "quiet", label: "安静", description: "保留淡入，关闭持续漂浮与鼠标视差。" },
  { value: "balanced", label: "舒展", description: "轻微漂浮与缓慢环线，适合日常浏览。" },
  { value: "vivid", label: "灵动", description: "更明显的层叠视差与照片呼吸感。" },
];

export function normalizeHeroArtStyle(value: unknown): HeroArtStyle {
  return heroArtStyleOptions.some((option) => option.value === value) ? value as HeroArtStyle : "editorial";
}

export function normalizeHeroMotionLevel(value: unknown): HeroMotionLevel {
  return heroMotionLevelOptions.some((option) => option.value === value) ? value as HeroMotionLevel : "balanced";
}
