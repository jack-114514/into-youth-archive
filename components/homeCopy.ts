export type HomeCopySectionId = "hero" | "stories" | "portal" | "campus" | "timeline" | "about" | "comments";
export type HomeCopySize = "small" | "standard" | "large";
export type HomeCopyWeight = "regular" | "medium" | "bold";

export type HomeCopySectionDefinition = {
  id: HomeCopySectionId;
  label: string;
  location: string;
  defaults: {
    kicker: string;
    title: string;
    accent: string;
    subtitle: string;
    extraText: string;
    extraEnabled: string;
    titleSize: HomeCopySize;
    titleWeight: HomeCopyWeight;
  };
};

export type HomepageCopySettings = Record<string, string>;

export const homeCopySizeOptions: ReadonlyArray<{ value: HomeCopySize; label: string }> = [
  { value: "small", label: "紧凑" },
  { value: "standard", label: "标准" },
  { value: "large", label: "醒目" },
];

export const homeCopyWeightOptions: ReadonlyArray<{ value: HomeCopyWeight; label: string }> = [
  { value: "regular", label: "常规" },
  { value: "medium", label: "中等" },
  { value: "bold", label: "粗体" },
];

export const homeCopySectionDefinitions: ReadonlyArray<HomeCopySectionDefinition> = [
  {
    id: "hero",
    label: "首屏主标题",
    location: "首页最上方的主视觉区",
    defaults: {
      kicker: "MEMORIES WE SHARE",
      title: "把青春留在",
      accent: "风经过的地方",
      subtitle: "这里收藏校园里的日常、朋友、黄昏与心事。\n愿每一次打开，都像重新走进那年夏天。",
      extraText: "写给正在发光的我们。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
  {
    id: "stories",
    label: "影像故事标题",
    location: "照片故事列表上方",
    defaults: {
      kicker: "MEMORY ARCHIVE",
      title: "记忆有自己的",
      accent: "显影方式",
      subtitle: "没有宏大的故事，只有被认真收藏的普通日子。每一张照片，都是时间偷偷留下的证词。",
      extraText: "每一次快门，都是一次郑重的保存。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
  {
    id: "portal",
    label: "粒子树入口标题",
    location: "深色 3D 粒子树入口",
    defaults: {
      kicker: "IMMERSIVE ARCHIVE",
      title: "照片不会停在相框里，",
      accent: "它们会沿着时间继续发光。",
      subtitle: "移动鼠标探索另一层光景，再走进原创的 3D 粒子树。",
      extraText: "从一个瞬间，走进整段青春。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "regular",
    },
  },
  {
    id: "campus",
    label: "校园碎片标题",
    location: "校园碎片页面图片列表上方",
    defaults: {
      kicker: "CAMPUS FRAGMENTS",
      title: "那些被定格的",
      accent: "校园片段",
      subtitle: "这里集中展示后台已有的校园影像，不在首页重复铺开。",
      extraText: "",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
  {
    id: "timeline",
    label: "青春时间线标题",
    location: "时间线内容列表上方",
    defaults: {
      kicker: "MOMENTS",
      title: "一些不舍得",
      accent: "忘记的片段",
      subtitle: "",
      extraText: "把时间写成可以回看的章节。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
  {
    id: "about",
    label: "关于我标题",
    location: "个人介绍与联系方式旁",
    defaults: {
      kicker: "ABOUT THE AUTHOR",
      title: "你好，我是这个故事的",
      accent: "记录者。",
      subtitle: "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。",
      extraText: "慢慢记录，也认真生活。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
  {
    id: "comments",
    label: "留言区标题",
    location: "留言输入框上方",
    defaults: {
      kicker: "LEAVE A TRACE",
      title: "来过的话，",
      accent: "留下一点声音吧",
      subtitle: "陌生人的一句话，也可能成为某一天的好心情。\n这里没有标准答案，真诚就好。",
      extraText: "你留下的每句话，都会被认真看见。",
      extraEnabled: "0",
      titleSize: "standard",
      titleWeight: "medium",
    },
  },
] as const;

export function homeCopyKey(id: HomeCopySectionId, field: "kicker" | "title" | "accent" | "subtitle" | "extra_text" | "extra_enabled" | "title_size" | "title_weight") {
  return `home_${id}_${field}`;
}

export const defaultHomepageCopySettings: HomepageCopySettings = Object.fromEntries(
  homeCopySectionDefinitions.flatMap(({ id, defaults }) => [
    [homeCopyKey(id, "kicker"), defaults.kicker],
    [homeCopyKey(id, "title"), defaults.title],
    [homeCopyKey(id, "accent"), defaults.accent],
    [homeCopyKey(id, "subtitle"), defaults.subtitle],
    [homeCopyKey(id, "extra_text"), defaults.extraText],
    [homeCopyKey(id, "extra_enabled"), defaults.extraEnabled],
    [homeCopyKey(id, "title_size"), defaults.titleSize],
    [homeCopyKey(id, "title_weight"), defaults.titleWeight],
  ]),
);

export function getHomeCopy(settings: HomepageCopySettings, id: HomeCopySectionId) {
  const definition = homeCopySectionDefinitions.find((item) => item.id === id)!;
  const read = (field: Parameters<typeof homeCopyKey>[1], fallback: string) => {
    const value = settings[homeCopyKey(id, field)];
    return typeof value === "string" ? value : fallback;
  };
  const size = read("title_size", definition.defaults.titleSize);
  const weight = read("title_weight", definition.defaults.titleWeight);
  return {
    kicker: read("kicker", definition.defaults.kicker),
    title: read("title", definition.defaults.title),
    accent: read("accent", definition.defaults.accent),
    subtitle: id === "portal" && read("subtitle", definition.defaults.subtitle) === "移动鼠标探索另一层光景，再走进原创的 3D 青春时间河。" ? definition.defaults.subtitle : read("subtitle", definition.defaults.subtitle),
    extraText: read("extra_text", definition.defaults.extraText),
    extraEnabled: read("extra_enabled", definition.defaults.extraEnabled) === "1",
    titleSize: (homeCopySizeOptions.some((item) => item.value === size) ? size : "standard") as HomeCopySize,
    titleWeight: (homeCopyWeightOptions.some((item) => item.value === weight) ? weight : "medium") as HomeCopyWeight,
  };
}

export function getHomeCopySectionDefaults(id: HomeCopySectionId) {
  const definition = homeCopySectionDefinitions.find((item) => item.id === id)!;
  return {
    [homeCopyKey(id, "kicker")]: definition.defaults.kicker,
    [homeCopyKey(id, "title")]: definition.defaults.title,
    [homeCopyKey(id, "accent")]: definition.defaults.accent,
    [homeCopyKey(id, "subtitle")]: definition.defaults.subtitle,
    [homeCopyKey(id, "extra_text")]: definition.defaults.extraText,
    [homeCopyKey(id, "extra_enabled")]: definition.defaults.extraEnabled,
    [homeCopyKey(id, "title_size")]: definition.defaults.titleSize,
    [homeCopyKey(id, "title_weight")]: definition.defaults.titleWeight,
  };
}
