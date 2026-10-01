import type { CSSProperties } from "react";

export const displaySizePresets = [
  { value: "80", label: "超小", description: "适合希望页面更紧凑的屏幕" },
  { value: "90", label: "小", description: "比标准尺寸收紧一档" },
  { value: "100", label: "标准", description: "普通网站的默认显示尺寸" },
  { value: "110", label: "大", description: "适合需要更醒目内容的场景" },
  { value: "120", label: "超大", description: "最大可读性预设" },
] as const;

export const defaultDisplaySettings = {
  display_font_scale: "100",
  display_media_scale: "100",
};

const allowedDisplayScales = new Set(displaySizePresets.map((preset) => preset.value));

export function normalizeDisplayScale(value: unknown) {
  const normalized = String(value ?? "100");
  return allowedDisplayScales.has(normalized as (typeof displaySizePresets)[number]["value"])
    ? normalized
    : "100";
}

function scaledPixels(value: number, scale: number) {
  return `${Math.round(value * scale * 100) / 100}px`;
}

function scaledViewport(value: number, scale: number) {
  return `${Math.round(value * scale * 1000) / 1000}vw`;
}

export function createDisplaySizingStyle(fontValue: unknown, mediaValue: unknown): CSSProperties {
  const fontScale = Number(normalizeDisplayScale(fontValue)) / 100;
  const mediaScale = Number(normalizeDisplayScale(mediaValue)) / 100;
  const font = (value: number) => scaledPixels(value, fontScale);
  const media = (value: number) => scaledPixels(value, mediaScale);
  const tokens: Record<string, string> = {};

  [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 34, 37, 40, 41, 42, 48, 58, 90].forEach((value) => {
    tokens[`--display-fs-${value}`] = font(value);
  });

  Object.assign(tokens, {
    "--display-hero-title": `clamp(${font(66)}, ${scaledViewport(7.4, fontScale)}, ${font(116)})`,
    "--display-section-title": `clamp(${font(43)}, ${scaledViewport(5, fontScale)}, ${font(74)})`,
    "--display-portal-title": `clamp(${font(42)}, ${scaledViewport(5.4, fontScale)}, ${font(78)})`,
    "--display-footer-title": `clamp(${font(40)}, ${scaledViewport(6.5, fontScale)}, ${font(90)})`,
    "--display-intro-watermark": `clamp(${font(150)}, ${scaledViewport(25, fontScale)}, ${font(430)})`,
    "--display-intro-title": `clamp(${font(40)}, ${scaledViewport(5, fontScale)}, ${font(76)})`,
    "--display-intro-subtitle": `clamp(${font(9)}, ${scaledViewport(.85, fontScale)}, ${font(13)})`,
    "--display-intro-logo-text": `clamp(${font(22)}, ${scaledViewport(2.2, fontScale)}, ${font(34)})`,
    "--display-mobile-hero-title": `clamp(${font(56)}, ${scaledViewport(17, fontScale)}, ${font(80)})`,
    "--display-mobile-intro-title": `clamp(${font(32)}, ${scaledViewport(10, fontScale)}, ${font(45)})`,
    "--display-mobile-intro-watermark": `clamp(${font(120)}, ${scaledViewport(43, fontScale)}, ${font(210)})`,
    "--display-intro-logo": `clamp(${media(132)}, ${scaledViewport(13, mediaScale)}, ${media(190)})`,
    "--display-orbit-height": media(610),
    "--display-ring-a": media(490),
    "--display-ring-b": media(355),
    "--display-orbit-core-width": media(285),
    "--display-orbit-core-height": media(360),
    "--display-orbit-photo-width": media(118),
    "--display-orbit-photo-height": media(145),
    "--display-orbit-note": media(115),
    "--display-story-media-height": media(380),
    "--display-about-media-height": media(620),
    "--display-about-badge": media(124),
    "--display-comment-media-width": media(260),
    "--display-comment-media-height": media(230),
    "--display-mobile-intro-logo": media(112),
    "--display-mobile-orbit-height": media(430),
    "--display-mobile-ring-a": media(335),
    "--display-mobile-ring-b": media(245),
    "--display-mobile-orbit-core-width": media(205),
    "--display-mobile-orbit-core-height": media(275),
    "--display-mobile-orbit-photo-width": media(80),
    "--display-mobile-orbit-photo-height": media(102),
    "--display-mobile-orbit-note": media(82),
    "--display-mobile-story-media-height": media(295),
    "--display-mobile-about-media-height": media(480),
    "--display-mobile-about-badge": media(90),
  });

  return tokens as CSSProperties;
}
