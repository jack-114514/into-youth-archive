import type { MolingPose } from "./moling";
export const emotions = ["happy", "normal", "shy", "thinking", "surprised", "sad", "curious", "excited", "confused", "sleepy", "angry", "love", "proud", "wink"] as const;
export const emotionLabels: Record<Emotion,string> = {happy:"开心",normal:"平静",shy:"害羞",thinking:"思考",surprised:"惊讶",sad:"难过",curious:"好奇",excited:"兴奋",confused:"困惑",sleepy:"困倦",angry:"生气",love:"喜欢",proud:"得意",wink:"眨单眼"};
export const actions = ["idle", "wave", "nod", "thinking", "sleep"] as const;
export type Emotion = typeof emotions[number];
export type Action = typeof actions[number];
export const petFrameRates = [30, 24, 20, 15, 10, 5] as const;
// Legacy settings and presets have no frame cap; retain the default 30 FPS.
export function petFrameRate(value?: number) {
  return petFrameRates.find(rate => rate === value) ?? 30;
}
export type PetSettings = {
  enabled: boolean; aiEnabled: boolean; name: string; character: string; position: string;
  draggable: boolean; randomMove: boolean; mouseFollow: boolean; hoverEnabled: boolean;
  clickEnabled: boolean; idleEnabled: boolean; randomAction: boolean; bubbleEnabled: boolean;
  welcomeEnabled: boolean; autoBubbleEnabled: boolean; autoBubbleInterval: number; modelUrl: string;
  size: number; scale: number; right: number; bottom: number; moveRange: number; moveSpeed: number;
  zIndex: number; opacity: number; followStrength: number; randomInterval: number; bubbleDuration: number; maxFPS?: number;
  lines: Record<string, string[]>; tones?: Record<string, string>; systemPrompt?: string; model?: string; apiUrl?: string; maxTokens?: number;
};
export type VisitorIdentity = { visitorMode: "named" | "guest"; visitorName: string };
export const numericFields: Array<[keyof PetSettings, string, number, number, number]> = [
  ["size", "桌宠高度", 150, 450, 1], ["scale", "角色缩放", .5, 1.5, .05],
  ["right", "距离侧边", 0, 1600, 1], ["bottom", "距离底部", 0, 900, 1],
  ["moveRange", "最大移动范围", 0, 120, 1], ["moveSpeed", "移动速度（像素/秒）", 1, 40, 1],
  ["zIndex", "显示层级", 1, 900, 1], ["opacity", "整体透明度", .2, 1, .05],
  ["followStrength", "鼠标跟随强度", 0, 1, .05], ["randomInterval", "随机动作间隔（秒）", 10, 300, 1],
  ["bubbleDuration", "气泡停留时间（秒）", 2, 30, 1],
  ["autoBubbleInterval", "自动气泡间隔（秒）", 10, 3600, 1],
];
export const booleanFields: Array<[keyof PetSettings, string]> = [
  ["enabled", "开启桌宠"], ["aiEnabled", "开启 AI 对话"], ["draggable", "允许鼠标拖动"],
  ["randomMove", "允许轻微随机移动"], ["mouseFollow", "鼠标跟随"], ["hoverEnabled", "Hover 打招呼"],
  ["clickEnabled", "点击互动"], ["idleEnabled", "静息表情变化"], ["randomAction", "随机动作"],
  ["bubbleEnabled", "对话气泡"],
  ["welcomeEnabled", "主动显示欢迎气泡"], ["autoBubbleEnabled", "定时主动气泡"],
];
export const lineFields = { named: "昵称用户欢迎语", guest: "游客欢迎语", auto: "定时主动气泡台词", morning: "早上自动台词", afternoon: "下午自动台词", evening: "晚上自动台词", hover: "Hover 台词", click: "点击台词", head: "头部点击台词", body: "身体点击台词", idle: "待机备用台词", linger: "长时间停留自动台词", opening: "AI 开场白" };
export function chooseLine(settings: PetSettings, category: string, identity: VisitorIdentity, page: string) {
  const lines = settings.lines[category] || [];
  const line = lines[Math.floor(Math.random() * lines.length)] || "";
  const hour = new Date().getHours();
  return line.replaceAll("{name}", identity.visitorMode === "named" ? identity.visitorName : "")
    .replaceAll("{time}", hour < 12 ? "早上" : hour < 18 ? "下午" : "晚上").replaceAll("{page}", page);
}
export type PetCue = { emotion: Emotion; action: Action; text?: string; id: number; randomMotion?: boolean; pose?: MolingPose };
