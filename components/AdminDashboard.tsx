"use client";

import { NotesManager } from "./NotesJournal";

import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Cropper, ImageRestriction } from "react-advanced-cropper";
import type { CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import { SelectionCircleStencil, SelectionRectangleStencil, SelectionSquareStencil, setInitialCropAspect } from "./cropSelection";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import LandingIntro, { defaultHomepageIntroNodes, defaultHomepageIntroSettings, HomepageIntroNode, HomepageIntroSettings, normalizeHomepageIntroSettings } from "./LandingIntro";
import HomeVisualPreview from "./HomeVisualPreview";
import { defaultDisplaySettings, displaySizePresets, normalizeDisplayScale } from "./displaySizing";
import { defaultGalaxySettings, galaxyScenePresets, GalaxyScenePreset, normalizeGalaxyColor, normalizeGalaxyNumber, normalizeGalaxyPercent } from "./galaxySettings";
import { defaultHomepageCopySettings, getHomeCopySectionDefaults, homeCopyKey, homeCopySectionDefinitions, homeCopySizeOptions, homeCopyWeightOptions, HomeCopySectionId } from "./homeCopy";
import { defaultHomeVisualSettings, homeBackgroundToneOptions, homeCardToneOptions, homeCardAspectRatioOptions, homeVisualCardDefinitions, HomeVisualImageKey, type HomeCardImageKey, type HomeCardCrop, type HomeCardAspectRatio, normalizeHomeCardAspectRatio, normalizeHomeCardAspects, normalizeHomeCardCrops, assignedHomeCardOrder, normalizeHomeCardVisibility, normalizeHomeBackgroundBlur, normalizeHomeBackgroundOverlayOpacity, normalizeHomeCardOpacity, normalizeHomeCardTone, normalizeHomeVisualAsset } from "./homeVisuals";
import { readCustomContactLinks, safeContactUrl, type CustomContactLink } from "./contactLinks";
import { defaultHeroPresentationSettings, heroArtStyleOptions, heroMotionLevelOptions, normalizeHeroArtStyle, normalizeHeroMotionLevel, visibleHeroSecondaryButton } from "./heroPresentation";
import { defaultMusicSettings, normalizeMusicPlaylist, normalizeMusicVolume, type MusicTrack } from "./musicSettings";

type Row = Record<string, string | number | null>;
type TimelineItem = { date: string; title: string; text: string };
type MediaTarget = "primary" | "companion" | { id: number; field: "url" | "video_url" };
type AdminDataTab = "comments" | "submissions" | "media";
type AdminTab = "status" | AdminDataTab | "inbox" | "river" | "campus" | "timeline" | "notes" | "about" | "messages" | "images" | "intro" | "settings" | "music" | "account" | "pet";
type MediaSectionTab = "media" | "river" | "campus";
type MediaVisibilityFlag = "show_in_stories" | "show_in_3d" | "show_on_home";
const mediaSectionFlags: Record<MediaSectionTab, MediaVisibilityFlag> = { media: "show_in_stories", river: "show_in_3d", campus: "show_on_home" };
const mediaVisibilityOptions: Array<{ key: MediaVisibilityFlag; label: string }> = [
  { key: "show_in_3d", label: "同步到 3D 粒子树" },
  { key: "show_on_home", label: "同步到校园碎片" },
  { key: "show_in_stories", label: "同步到青春故事集" },
];
const mediaDestinationsForTab = (tab: MediaSectionTab): Record<MediaVisibilityFlag, boolean> => ({
  show_in_stories: tab === "media", show_in_3d: tab === "river", show_on_home: tab === "campus",
});
const cardForTab: Partial<Record<AdminTab, HomeCardImageKey>> & Record<MediaSectionTab, HomeCardImageKey> = { media: "home_card_story_image", river: "home_card_memory_image", campus: "home_card_campus_image", timeline: "home_card_timeline_image", notes: "home_card_notes_image", about: "home_card_about_image", messages: "home_card_messages_image" };
const isMediaSectionTab = (value: AdminTab): value is MediaSectionTab => value === "media" || value === "river" || value === "campus";
const PetSettingsPanel = lazy(() => import("./desktop-pet/PetSettingsPanel"));
type AdminServiceStatus = "checking" | "online" | "offline";
type ServerStatusSnapshot = {
  ok: boolean;
  server_time: string;
  service: { status: "online"; started_at: string; uptime_seconds: number; load_1m: number | null };
  database: { status: "connected"; size_bytes: number; updated_at: string | null };
  storage: { uploads_bytes: number; disk_total_bytes: number; disk_free_bytes: number; disk_used_percent: number };
  memory: { total_bytes: number; available_bytes: number; used_percent: number | null };
  counts: { media: number; comments: number; visible_comments: number; submissions: number; pending_submissions: number; page_views: number };
};
type SaveDialogState = {
  phase: "saving" | "success" | "error";
  title: string;
  detail: string;
};
type DeleteDialogState = {
  title: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
};
type MediaPreviewState = { url: string; title: string; video: boolean };
type MediaCropState = { source: string; target: MediaTarget; replaceOriginal: boolean };

const adminNavigationItems: Array<{ key: AdminTab; label: string; icon: string }> = [
  { key: "status", label: "服务器状态", icon: "●" },
  { key: "images", label: "内容概览", icon: "▤" },
  { key: "media", label: "青春故事集", icon: "▣" },
  { key: "inbox", label: "留言与投稿信箱", icon: "✉" },
  { key: "river", label: "3D 粒子树", icon: "◇" },
  { key: "campus", label: "校园碎片", icon: "▧" },
  { key: "timeline", label: "时间线", icon: "◌" },
  { key: "notes", label: "随手记", icon: "✎" },
  { key: "about", label: "关于我们", icon: "◎" },
  { key: "messages", label: "留言操场", icon: "✦" },
  { key: "intro", label: "首页开场", icon: "◌" },
  { key: "settings", label: "网站设置", icon: "◇" },
  { key: "music", label: "音乐播放器", icon: "♫" },
  { key: "pet", label: "AI 桌宠设置", icon: "✧" },
  { key: "account", label: "账号管理", icon: "◉" },
];
const adminContentTabs: readonly AdminTab[] = ["images", "media", "river", "campus", "timeline", "notes", "about", "messages"];

const adminTabTitles: Record<AdminTab, string> = {
  status: "服务器状态",
  comments: "留言管理",
  submissions: "投稿信箱",
  inbox: "留言与投稿信箱",
  media: "青春故事集",
  river: "3D 粒子树",
  campus: "校园碎片",
  timeline: "青春时间线",
  notes: "随手记",
  about: "关于我们",
  messages: "留言操场",
  images: "内容概览",
  intro: "首页开场",
  settings: "网站设置",
  music: "音乐播放器",
  pet: "AI 桌宠设置",
  account: "账号管理",
};

const adminDataTabs: readonly AdminDataTab[] = ["comments", "submissions", "media"];

function maskAccountEmail(value: string): string {
  const [local, domain] = value.trim().split("@");
  return local && domain ? `${local.slice(0, 2)}***@${domain}` : "";
}

function isAdminDataTab(value: string): value is AdminDataTab {
  return adminDataTabs.includes(value as AdminDataTab);
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstilePhase = "loading" | "ready" | "verified" | "expired" | "error" | "unsupported" | "unconfigured";
const TURNSTILE_SCRIPT_SELECTOR = 'script[data-into-turnstile="true"]';

function TurnstileVerification({ onVerify, resetSignal, theme }: { onVerify: (token: string) => void; resetSignal: number; theme: "light" | "dark" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<TurnstilePhase>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public-config", { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("配置读取失败"); return response.json(); })
      .then((config) => setSiteKey(config.password_recovery_enabled ? String(config.turnstile_site_key || "") : ""))
      .catch(() => { if (!controller.signal.aborted) setSiteKey(""); });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    onVerify("");
    if (siteKey === null) return;
    if (!siteKey) { setPhase("unconfigured"); return; }
    setPhase("loading");
    let cancelled = false;
    let attachedScript: HTMLScriptElement | null = null;
    let createdScript = false;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearLoadTimeout = () => {
      clearTimeout(loadTimeout);
      loadTimeout = undefined;
    };
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      clearLoadTimeout();
      try {
        setPhase("ready");
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "admin_password_recovery",
          theme,
          size: "flexible",
          retry: "auto",
          "retry-interval": 8000,
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (value: string) => { setPhase("verified"); onVerify(value); },
          "expired-callback": () => { setPhase("expired"); onVerify(""); },
          "timeout-callback": () => { setPhase("expired"); onVerify(""); },
          "error-callback": () => { setPhase("error"); onVerify(""); },
          "unsupported-callback": () => { setPhase("unsupported"); onVerify(""); },
        });
      } catch {
        setPhase("error");
        onVerify("");
      }
    };
    const handleScriptError = () => {
      clearLoadTimeout();
      if (cancelled) return;
      if (attachedScript) attachedScript.dataset.intoTurnstileFailed = "true";
      setPhase("error");
      onVerify("");
    };
    const attachScript = (script: HTMLScriptElement) => {
      attachedScript = script;
      script.addEventListener("load", renderWidget, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });
    };
    const createScript = () => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.intoTurnstile = "true";
      createdScript = true;
      attachScript(script);
      document.head.appendChild(script);
    };

    const existing = document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR);
    if (window.turnstile) {
      renderWidget();
    } else if (existing?.dataset.intoTurnstileFailed === "true") {
      existing.remove();
      createScript();
    } else if (existing) {
      attachScript(existing);
    } else {
      createScript();
    }
    loadTimeout = setTimeout(() => {
      if (cancelled || window.turnstile || widgetIdRef.current) return;
      if (attachedScript) attachedScript.dataset.intoTurnstileFailed = "true";
      setPhase("error");
      onVerify("");
    }, 12_000);
    return () => {
      cancelled = true;
      clearLoadTimeout();
      attachedScript?.removeEventListener("load", renderWidget);
      attachedScript?.removeEventListener("error", handleScriptError);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      if (createdScript && !window.turnstile) attachedScript?.remove();
      widgetIdRef.current = null;
    };
  }, [loadAttempt, onVerify, theme, siteKey]);

  useEffect(() => {
    if (resetSignal && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onVerify("");
      setPhase("ready");
    }
  }, [resetSignal, onVerify]);

  const statusText = phase === "unconfigured" ? "本站尚未配置 Cloudflare Turnstile 和恢复邮箱，请由站点管理员在服务器配置" : phase === "loading" ? "正在加载人机验证…"
    : phase === "verified" ? "人机验证已通过，可以发送邮箱验证码"
      : phase === "expired" ? "验证已过期并刷新，请重新完成验证"
        : phase === "unsupported" ? "当前浏览器不支持人机验证，请更新浏览器后重试"
          : phase === "error" ? "人机验证暂时异常，系统会自动重试"
            : "通过安全验证后才能发送邮箱验证码";

  const retryVerification = () => {
    setPhase("loading");
    onVerify("");
    setLoadAttempt((value) => value + 1);
  };

  return <div className="turnstile-box"><div ref={containerRef} /><small role="status">{statusText}</small>{phase === "error" && <button type="button" onClick={retryVerification}>重新加载人机验证</button>}</div>;
}

const defaultTimelineItems: TimelineItem[] = [
  { date: "2023.09", title: "第一次走进这里", text: "风很轻，书包很重，未来还是一张没有写字的纸。" },
  { date: "2024.03", title: "春天在操场集合", text: "我们用一整个下午，把笑声留在跑道边。" },
  { date: "2025.06", title: "教室最后一排", text: "黑板上的倒计时越来越小，想说的话却越来越多。" },
  { date: "NOW", title: "故事仍在继续", text: "今天也值得记录。等未来回头看，它一定很亮。" },
];

function parseTimelineItems(value: unknown): TimelineItem[] {
  try {
    const parsed = JSON.parse(String(value || ""));
    return Array.isArray(parsed) && parsed.length ? parsed.slice(0, 8).map((item) => ({
      date: String(item?.date || ""), title: String(item?.title || ""), text: String(item?.text || ""),
    })) : defaultTimelineItems;
  } catch {
    return defaultTimelineItems;
  }
}

async function api(path: string, options: RequestInit = {}, token = "") {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data.error || "请求失败");
    const method = String(options.method || "GET").toUpperCase();
    if (response.status === 404 && detail === "未找到接口") {
      throw new Error(`后台接口未同步，请重新启动或更新后台服务（${method} ${path}）`);
    }
    throw new Error(detail);
  }
  return data;
}

function formatDate(value: unknown) {
  if (!value) return "";
  return new Date(String(value)).toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(value: number) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function formatServerTime(value?: string | null) {
  if (!value) return "尚未取得";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未取得";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function ServerStatusPanel({
  snapshot,
  loading,
  error,
  latencyMs,
  onRefresh,
  onNavigate,
}: {
  snapshot: ServerStatusSnapshot | null;
  loading: boolean;
  error: string;
  latencyMs: number | null;
  onRefresh: () => void;
  onNavigate: (tab: AdminTab) => void;
}) {
  if (!snapshot && loading) {
    return <section className="server-status-loading" aria-live="polite"><i /><strong>正在读取服务器状态</strong><span>正在检查服务、数据库与存储空间…</span></section>;
  }
  if (!snapshot) {
    return <section className="server-status-error" role="alert"><strong>暂时无法读取服务器状态</strong><span>{error || "服务器没有返回状态数据"}</span><button type="button" onClick={onRefresh}>重新检查</button></section>;
  }

  const diskUsed = Math.max(0, Math.min(100, Number(snapshot.storage.disk_used_percent) || 0));
  const memoryUsed = snapshot.memory.used_percent == null ? null : Math.max(0, Math.min(100, Number(snapshot.memory.used_percent) || 0));
  const memoryUsedBytes = Math.max(0, snapshot.memory.total_bytes - snapshot.memory.available_bytes);
  return (
    <div className="server-dashboard">
      <section className="server-hero" aria-labelledby="server-overview-title">
        <div className="server-hero-copy">
          <span className="server-live-badge"><i /> SYSTEM ONLINE</span>
          <h2 id="server-overview-title">网站服务运行正常</h2>
          <p>网站接口、数据库与内容存储均已连接。状态页每 30 秒自动更新，也可以立即手动检查。</p>
          {error && <div className="server-refresh-warning" role="status">最近一次自动刷新失败，当前显示上次成功数据：{error}</div>}
        </div>
        <button type="button" className="server-refresh-button" onClick={onRefresh} disabled={loading}><span className={loading ? "is-spinning" : ""}>↻</span>{loading ? "正在检查" : "立即刷新"}</button>
        <dl className="server-hero-meta">
          <div><dt>响应时间</dt><dd>{latencyMs == null ? "—" : `${latencyMs} ms`}</dd></div>
          <div><dt>持续运行</dt><dd>{formatDuration(snapshot.service.uptime_seconds)}</dd></div>
          <div><dt>服务器时间</dt><dd>{formatServerTime(snapshot.server_time)}</dd></div>
        </dl>
      </section>

      <section className="server-stat-grid" aria-label="网站内容概况">
        <article><span>已收录图片</span><strong>{snapshot.counts.media}</strong><small>故事、校园与 3D 场景图片</small><button type="button" onClick={() => onNavigate("media")}>管理故事图片 <b className="micro-arrow">↗</b></button></article>
        <article className={snapshot.counts.pending_submissions ? "has-attention" : ""}><span>待处理投稿</span><strong>{snapshot.counts.pending_submissions}</strong><small>共 {snapshot.counts.submissions} 条投稿</small><button type="button" onClick={() => onNavigate("submissions")}>查看投稿 <b className="micro-arrow">↗</b></button></article>
        <article><span>留言数量</span><strong>{snapshot.counts.comments}</strong><small>{snapshot.counts.visible_comments} 条正在展示</small><button type="button" onClick={() => onNavigate("comments")}>管理留言 <b className="micro-arrow">↗</b></button></article>
        <article><span>真实访问</span><strong>{snapshot.counts.page_views}</strong><small>网站累计访问次数</small><a href="/" target="_blank" rel="noreferrer">打开网站 <b className="micro-arrow">↗</b></a></article>
      </section>

      <section className="server-health-grid" aria-label="服务器资源状态">
        <article className="server-health-card">
          <header><div><span>STORAGE</span><h3>磁盘与网站文件</h3></div><strong className={diskUsed >= 85 ? "is-warning" : ""}>{diskUsed.toFixed(1)}%</strong></header>
          <div className="server-progress" role="progressbar" aria-label="服务器磁盘使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={diskUsed}><i style={{ width: `${diskUsed}%` }} /></div>
          <dl>
            <div><dt>剩余空间</dt><dd>{formatBytes(snapshot.storage.disk_free_bytes)}</dd></div>
            <div><dt>磁盘总量</dt><dd>{formatBytes(snapshot.storage.disk_total_bytes)}</dd></div>
            <div><dt>上传文件</dt><dd>{formatBytes(snapshot.storage.uploads_bytes)}</dd></div>
          </dl>
        </article>
        <article className="server-health-card">
          <header><div><span>RUNTIME</span><h3>内存与运行负载</h3></div><strong className={memoryUsed != null && memoryUsed >= 85 ? "is-warning" : ""}>{memoryUsed == null ? "—" : `${memoryUsed.toFixed(1)}%`}</strong></header>
          <div className="server-progress" role="progressbar" aria-label="服务器内存使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={memoryUsed ?? 0}><i style={{ width: `${memoryUsed ?? 0}%` }} /></div>
          <dl>
            <div><dt>已用内存</dt><dd>{memoryUsed == null ? "不可用" : formatBytes(memoryUsedBytes)}</dd></div>
            <div><dt>内存总量</dt><dd>{formatBytes(snapshot.memory.total_bytes)}</dd></div>
            <div><dt>1 分钟负载</dt><dd>{snapshot.service.load_1m == null ? "不可用" : snapshot.service.load_1m.toFixed(2)}</dd></div>
          </dl>
        </article>
        <article className="server-health-card is-database">
          <header><div><span>DATABASE</span><h3>网站数据库</h3></div><strong>已连接</strong></header>
          <div className="database-status-row"><i /><div><b>SQLite 数据读取正常</b><span>状态接口已成功查询内容与访问统计</span></div></div>
          <dl>
            <div><dt>数据库大小</dt><dd>{formatBytes(snapshot.database.size_bytes)}</dd></div>
            <div><dt>最近写入</dt><dd>{formatServerTime(snapshot.database.updated_at)}</dd></div>
            <div><dt>服务启动</dt><dd>{formatServerTime(snapshot.service.started_at)}</dd></div>
          </dl>
        </article>
      </section>
    </div>
  );
}

function isVideoUrl(value: unknown) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(String(value || "")) || String(value || "").startsWith("data:video/");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

async function compressIntroImage(file: File, maxDimension: number) {
  const source = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(preview);
    preview.onerror = () => reject(new Error("无法解析图片"));
    preview.src = source;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.type === "image/webp") return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/webp", 0.86);
  return compressed.length < source.length ? compressed : source;
}

type CropViewport = "desktop" | "mobile";

type CropRect = { left: number; top: number; width: number; height: number };

const clampNum = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Cover-fit "reference width" in source pixels for a frame with the given aspect ratio.
const coverReference = (iw: number, ih: number, aspect: number) => Math.min(iw, aspect * ih);

// Convert a crop rectangle (source-image pixels) into the site's object-position + scale settings.
function cropRectToIntroSettings(
  rect: CropRect,
  iw: number,
  ih: number,
  aspect: number,
): { x: number; y: number; zoom: number } {
  const m = coverReference(iw, ih, aspect);
  const zoom = clampNum((m / Math.max(1, rect.width)) * 100, 100, 400);
  // x%/y% are pan fractions: 0 = crop window at image's leading edge, 100 = trailing edge.
  const x = rect.width < iw ? (100 * rect.left) / Math.max(1, iw - rect.width) : 50;
  const y = rect.height < ih ? (100 * rect.top) / Math.max(1, ih - rect.height) : 50;
  return {
    x: Math.round(clampNum(x, 0, 100)),
    y: Math.round(clampNum(y, 0, 100)),
    zoom: Math.round(zoom),
  };
}

// Convert the site's x%/y%/zoom% settings back into a crop rectangle (source-image pixels).
function introSettingsToCropRect(
  x: number,
  y: number,
  zoom: number,
  iw: number,
  ih: number,
  aspect: number,
): CropRect {
  const m = coverReference(iw, ih, aspect);
  const width = Math.max(1, m / Math.max(1, zoom / 100));
  const height = width / aspect;
  const left = clampNum((x / 100) * (iw - width), 0, Math.max(0, iw - width));
  const top = clampNum((y / 100) * (ih - height), 0, Math.max(0, ih - height));
  return { left, top, width, height };
}

function CropPanel({
  viewport,
  settings,
  onChange,
}: {
  viewport: CropViewport;
  settings: HomepageIntroSettings;
  onChange: (key: keyof HomepageIntroSettings, value: string) => void;
}) {
  const label = viewport === "desktop" ? "电脑横屏" : "手机竖屏";
  const suggestedAspect = viewport === "desktop" ? 16 / 9 : 9 / 16;
  const source = settings[`intro_background_${viewport}_image`] || settings.intro_background_desktop_image || settings.intro_background_image;
  const x = Number(settings[`intro_background_${viewport}_x`]);
  const y = Number(settings[`intro_background_${viewport}_y`]);
  const zoom = Number(settings[`intro_background_${viewport}_zoom`]);
  const cropperRef = useRef<CropperRef | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [restored, setRestored] = useState(false);
  const appliedKey = useRef("");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    setImageSize(null);
    setRestored(false);
    appliedKey.current = "";
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, [source]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  const applySettings = (cx: number, cy: number, cz: number, restoreSavedCrop = false) => {
    const instance = cropperRef.current;
    if (!instance || !imageSize) return;
    const savedWidth = Number(settings[`intro_background_${viewport}_crop_width`]);
    const savedHeight = Number(settings[`intro_background_${viewport}_crop_height`]);
    const hasSavedRect = restoreSavedCrop && Number.isFinite(savedWidth) && Number.isFinite(savedHeight) && savedWidth > 0 && savedHeight > 0;
    const rect = hasSavedRect ? {
      left: imageSize.width * clampNum(Number(settings[`intro_background_${viewport}_crop_left`]), 0, 100) / 100,
      top: imageSize.height * clampNum(Number(settings[`intro_background_${viewport}_crop_top`]), 0, 100) / 100,
      width: imageSize.width * clampNum(savedWidth, 1, 100) / 100,
      height: imageSize.height * clampNum(savedHeight, 1, 100) / 100,
    } : introSettingsToCropRect(cx, cy, cz, imageSize.width, imageSize.height, suggestedAspect);
    instance.setCoordinates({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    appliedKey.current = `${cx}|${cy}|${cz}`;
  };

  // Restore the saved crop once the image is ready.
  useEffect(() => {
    if (!imageSize || restored) return;
    applySettings(x, y, zoom, true);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize, restored]);

  // Re-apply when x/y/zoom change from the sliders (external control).
  useEffect(() => {
    if (!imageSize || !restored) return;
    const key = `${x}|${y}|${zoom}`;
    if (appliedKey.current === key) return;
    applySettings(x, y, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, zoom, imageSize, restored]);

  const handleReady = (instance: CropperRef) => {
    cropperRef.current = instance;
    const image = instance.getImage();
    if (image) setImageSize({ width: image.width, height: image.height });
  };

  const handleUpdate = (instance: CropperRef) => {
    if (!restored) return;
    const coordinates = instance.getCoordinates();
    const image = instance.getImage();
    if (!coordinates || !image) return;
    const next = cropRectToIntroSettings(coordinates, image.width, image.height, suggestedAspect);
    const crop = {
      left: Math.round(clampNum(100 * coordinates.left / image.width, 0, 100) * 100) / 100,
      top: Math.round(clampNum(100 * coordinates.top / image.height, 0, 100) * 100) / 100,
      width: Math.round(clampNum(100 * coordinates.width / image.width, 1, 100) * 100) / 100,
      height: Math.round(clampNum(100 * coordinates.height / image.height, 1, 100) * 100) / 100,
    };
    appliedKey.current = `${next.x}|${next.y}|${next.zoom}`;
    // Defer the parent state writes so a continuous drag doesn't re-render the whole
    // admin on every pointer frame (that is what caused the dragging stutter).
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      if (next.x !== x) onChange(`intro_background_${viewport}_x`, String(next.x));
      if (next.y !== y) onChange(`intro_background_${viewport}_y`, String(next.y));
      if (next.zoom !== zoom) onChange(`intro_background_${viewport}_zoom`, String(next.zoom));
      onChange(`intro_background_${viewport}_crop_left`, String(crop.left));
      onChange(`intro_background_${viewport}_crop_top`, String(crop.top));
      onChange(`intro_background_${viewport}_crop_width`, String(crop.width));
      onChange(`intro_background_${viewport}_crop_height`, String(crop.height));
    }, 120);
  };

  return (
    <section className={`intro-crop-viewport is-${viewport}`}>
      <header><strong>{label}</strong><div><span>建议 {viewport === "desktop" ? "16:9" : "9:16"} · 边缘自由调整 · 四角等比</span></div></header>
      <div className="intro-crop-frame" aria-label={`${label}背景裁切预览：框内拖动选框，框外拖动图片，拖动整条边调整比例，四角等比缩放`}>
        {source ? (
          <Cropper
            ref={cropperRef}
            src={source}
            className="intro-crop-canvas"
            stencilComponent={SelectionRectangleStencil}
            imageRestriction={ImageRestriction.fillArea}
            scaleImage
            moveImage
            rotateImage={false}
            autoZoom={false}
            transitions={false}
            onReady={handleReady}
            onUpdate={handleUpdate}
          />
        ) : <span>请先上传{label}背景图片</span>}
      </div>
      <label>水平位置 <output>{x}%</output><input type="range" min="0" max="100" value={x} onChange={(event) => onChange(`intro_background_${viewport}_x`, event.target.value)} /></label>
      <label>垂直位置 <output>{y}%</output><input type="range" min="0" max="100" value={y} onChange={(event) => onChange(`intro_background_${viewport}_y`, event.target.value)} /></label>
      <label>画面缩放 <output>{zoom}%</output><input type="range" min="100" max="400" step="1" value={zoom} onChange={(event) => onChange(`intro_background_${viewport}_zoom`, event.target.value)} /></label>
    </section>
  );
}

function BackgroundCropEditor({
  settings,
  onChange,
}: {
  settings: HomepageIntroSettings;
  onChange: (key: keyof HomepageIntroSettings, value: string) => void;
}) {
  return (
    <div className="intro-crop-editor">
      {(["desktop", "mobile"] as CropViewport[]).map((viewport) => {
        return <CropPanel key={viewport} viewport={viewport} settings={settings} onChange={onChange} />;
      })}
    </div>
  );
}

function CircleImageCropEditor({
  source,
  label,
  onCancel,
  onConfirm,
  onError,
}: {
  source: string;
  label: string;
  onCancel: () => void;
  onConfirm: (image: string) => void;
  onError: (message: string) => void;
}) {
  const cropperRef = useRef<CropperRef | null>(null);

  const confirmCrop = () => {
    const canvas = cropperRef.current?.getCanvas({
      width: 1024,
      height: 1024,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    if (!canvas) {
      onError(`${label}图片尚未加载完成，请稍候再试`);
      return;
    }
    try {
      onConfirm(canvas.toDataURL("image/webp", 0.9));
    } catch {
      onError(`无法生成${label}裁切结果，请重新上传图片`);
    }
  };

  return (
    <>
      <div className="intro-logo-crop-stage" aria-label={`${label}圆形裁切区域：圆内拖动圆框，圆外拖动图片，拖动圆周等比调整取景范围，滚轮缩放图片`}>
        <Cropper
          ref={cropperRef}
          src={source}
          className="intro-logo-crop-canvas"
          stencilComponent={SelectionCircleStencil}
          imageRestriction={ImageRestriction.fillArea}
          scaleImage
          moveImage
          rotateImage={false}
          autoZoom={false}
          transitions={false}
        />
      </div>
      <p className="intro-logo-crop-note">圆框内的内容会保存为方形图片，并在网站中以圆形显示；圆框外的区域不会显示。</p>
      <footer>
        <button type="button" onClick={confirmCrop}>使用此裁切</button>
        <button type="button" className="secondary" onClick={onCancel}>取消</button>
      </footer>
    </>
  );
}

function CardCropEditor({ source, label, isHero = false, onCancel, onConfirm, onError }: { source: string; label: string; isHero?: boolean; onCancel: () => void; onConfirm: (image: string) => void; onError: (message: string) => void }) {
  const cropperRef = useRef<CropperRef | null>(null);
  const initialAspect = isHero ? 16 / 9 : 14 / 9;
  const confirmCrop = () => {
    const canvas = cropperRef.current?.getCanvas({ width: isHero ? 1920 : 1400, height: isHero ? 1080 : 900, imageSmoothingEnabled: true, imageSmoothingQuality: "high" });
    if (!canvas) return onError("图片尚未加载完成，请稍候再试");
    try { onConfirm(canvas.toDataURL("image/webp", 0.88)); } catch { onError("无法生成卡片裁切结果，请重新上传图片"); }
  };
  return <>
    <div className="intro-crop-viewport is-desktop"><div className="intro-crop-frame" aria-label={`${label}裁切预览：框内拖动选框，框外拖动图片，整条边自由调整，四角等比缩放`}><Cropper ref={cropperRef} src={source} className="intro-crop-canvas" stencilComponent={SelectionRectangleStencil} imageRestriction={ImageRestriction.fillArea} scaleImage moveImage rotateImage={false} autoZoom transitions={false} onReady={(instance) => setInitialCropAspect(instance, initialAspect)} /></div></div>
    <p className="intro-logo-crop-note">建议使用 {isHero ? "16:9" : "14:9"} 横向构图，图片会保存为{isHero ? "首页主视觉" : "卡片专用封面"}；原有文章和媒体内容不会改变。</p>
    <footer><button type="button" onClick={confirmCrop}>使用此裁切</button><button type="button" className="secondary" onClick={onCancel}>取消</button></footer>
  </>;
}

function MediaSquareCropEditor({ source, onCancel, onConfirm, onError }: { source: string; onCancel: () => void; onConfirm: (image: string) => void; onError: (message: string) => void }) {
  const cropperRef = useRef<CropperRef | null>(null);
  const confirmCrop = () => {
    const canvas = cropperRef.current?.getCanvas({ width: 1024, height: 1024, imageSmoothingEnabled: true, imageSmoothingQuality: "high" });
    if (!canvas) return onError("图片尚未加载完成，请稍候再试");
    try { onConfirm(canvas.toDataURL("image/webp", 0.88)); } catch { onError("无法生成展示图，请重新选择图片"); }
  };
  return <>
    <div className="media-square-crop-stage" aria-label="方形取景：框内拖动选框，框外拖动图片，边缘与四角缩放始终保持正方形"><Cropper ref={cropperRef} src={source} className="intro-logo-crop-canvas" stencilComponent={SelectionSquareStencil} imageRestriction={ImageRestriction.fillArea} moveImage rotateImage={false} autoZoom transitions={false} onReady={(instance) => setInitialCropAspect(instance, 1)} /></div>
    <p className="intro-logo-crop-note">方框内会作为网站卡片与 3D 照片的预览。上传原图会单独保留，访客点开详情时显示完整长宽比。</p>
    <footer><button type="button" onClick={confirmCrop}>使用此取景</button><button type="button" className="secondary" onClick={onCancel}>取消</button></footer>
  </>;
}

function CardFocusEditor({ source, label, aspect, savedCrop, onCancel, onConfirm, onError }: { source: string; label: string; aspect: number; savedCrop?: HomeCardCrop; onCancel: () => void; onConfirm: (crop: HomeCardCrop) => void; onError: (message: string) => void }) {
  const cropperRef = useRef<CropperRef | null>(null);
  const restoreCrop = (instance: CropperRef) => {
    cropperRef.current = instance;
    const image = instance.getImage();
    if (!image) return;
    if (!savedCrop) return setInitialCropAspect(instance, aspect);
    instance.setCoordinates({ left: image.width * savedCrop.left / 100, top: image.height * savedCrop.top / 100, width: image.width * savedCrop.width / 100, height: image.height * savedCrop.height / 100 });
  };
  const confirmFocus = () => {
    const coordinates = cropperRef.current?.getCoordinates();
    const image = cropperRef.current?.getImage();
    if (!coordinates || !image) return onError("图片尚未加载完成，请稍候再试");
    onConfirm({
      left: Math.round(10000 * coordinates.left / image.width) / 100,
      top: Math.round(10000 * coordinates.top / image.height) / 100,
      width: Math.round(10000 * coordinates.width / image.width) / 100,
      height: Math.round(10000 * coordinates.height / image.height) / 100,
    });
  };
  return <>
    <div className="intro-crop-viewport is-desktop"><div className="intro-crop-frame" aria-label={`${label}取景参考：框内拖动选框，框外拖动图片，整条边自由调整，四角等比缩放`}><Cropper ref={cropperRef} src={source} className="intro-crop-canvas" stencilComponent={SelectionRectangleStencil} imageRestriction={ImageRestriction.fillArea} onReady={restoreCrop} /></div></div>
    <p className="intro-logo-crop-note">这里只保存相对于原图的取景参考，不会裁掉原图。实际显示范围会随卡片尺寸变化，尽量以选中区域为中心。</p>
    <footer><button type="button" onClick={confirmFocus}>使用此取景区域</button><button type="button" className="secondary" onClick={onCancel}>取消</button></footer>
  </>;
}

function animateSettingsDrawer(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const summary = target.closest("summary");
  const details = summary?.parentElement;
  if (!(summary instanceof HTMLElement) || !(details instanceof HTMLDetailsElement) || !details.classList.contains("admin-settings-accordion")) return;
  event.preventDefault();
  const opening = details.dataset.drawerTarget ? details.dataset.drawerTarget !== "open" : !details.open;
  const startingHeight = details.getBoundingClientRect().height;
  details.dataset.drawerTarget = opening ? "open" : "closed";
  const contents = Array.from(details.children).filter((child): child is HTMLElement => child !== summary && child instanceof HTMLElement);
  details.getAnimations().filter((animation) => animation.id === "admin-settings-drawer").forEach((animation) => animation.cancel());
  contents.forEach((content) => content.getAnimations().filter((animation) => animation.id === "admin-settings-drawer-content").forEach((animation) => animation.cancel()));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    details.open = opening;
    details.style.height = "";
    details.style.overflow = "";
    return;
  }
  details.style.height = `${startingHeight}px`;
  details.style.overflow = "hidden";
  if (opening) details.open = true;
  const endingHeight = opening ? details.scrollHeight : summary.getBoundingClientRect().height + 2;
  const duration = opening ? 560 : 420;
  const contentAnimations = contents.map((content) => {
    const animation = content.animate(
      opening
        ? [{ opacity: 0, transform: "translateY(-24px)", clipPath: "inset(0 0 85% 0)" }, { opacity: 1, transform: "translateY(0)", clipPath: "inset(0 0 0 0)" }]
        : [{ opacity: 1, transform: "translateY(0)", clipPath: "inset(0 0 0 0)" }, { opacity: 0, transform: "translateY(-18px)", clipPath: "inset(0 0 85% 0)" }],
      { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
    );
    animation.id = "admin-settings-drawer-content";
    return animation;
  });
  const animation = details.animate(
    [{ height: `${startingHeight}px` }, { height: `${endingHeight}px` }],
    { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
  );
  animation.id = "admin-settings-drawer";
  animation.onfinish = () => {
    details.open = opening;
    details.style.height = "";
    details.style.overflow = "";
    contentAnimations.forEach((contentAnimation) => contentAnimation.cancel());
    animation.cancel();
  };
}

export default function AdminDashboard() {
  const reduceMotion = useReducedMotion();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [accountEmailMask, setAccountEmailMask] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<AdminTab>("status");
  const [inboxView, setInboxView] = useState<"comments" | "submissions">("comments");
  const [rows, setRows] = useState<Row[]>([]);
  const [dirtyMediaIds, setDirtyMediaIds] = useState<number[]>([]);
  const [expandedMediaId, setExpandedMediaId] = useState<number | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState | null>(null);
  const [mediaCrop, setMediaCrop] = useState<MediaCropState | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadData, setUploadData] = useState("");
  const [uploadThumbnailData, setUploadThumbnailData] = useState("");
  const [videoUploadData, setVideoUploadData] = useState("");
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaMeta, setMediaMeta] = useState("");
  const [mediaBody, setMediaBody] = useState("");
  const [mediaTakenAt, setMediaTakenAt] = useState("");
  const [mediaSortOrder, setMediaSortOrder] = useState("");
  const [mediaDestinations, setMediaDestinations] = useState(mediaDestinationsForTab("media"));
  const [settings, setSettings] = useState({ site_title: "我的记忆档案", footer_title: "我的记忆档案", footer_subtitle: "", hero_title: "把青春留在风经过的地方", profile_text: "", github_url: "", contact_email: "", contact_douyin_url: "", contact_custom_links: "[]", notes_title: "随手记", notes_body: "这里会慢慢收集校园里真实发生的片段。", timeline_items: JSON.stringify(defaultTimelineItems), ...defaultDisplaySettings, ...defaultGalaxySettings, ...defaultHomepageIntroSettings, ...defaultHomepageCopySettings, ...defaultHeroPresentationSettings, ...defaultHomeVisualSettings, ...defaultMusicSettings });
  const [introNodes, setIntroNodes] = useState<HomepageIntroNode[]>(defaultHomepageIntroNodes);
  const [introPreviewKey, setIntroPreviewKey] = useState(0);
  const [introPreviewOpen, setIntroPreviewOpen] = useState(false);
  const [introPreviewViewport, setIntroPreviewViewport] = useState<CropViewport>("desktop");
  const [homePreviewKey, setHomePreviewKey] = useState(0);
  const [homePreviewOpen, setHomePreviewOpen] = useState(false);
  const [homePreviewViewport, setHomePreviewViewport] = useState<CropViewport>("desktop");
  const [introCropOpen, setIntroCropOpen] = useState(false);
  const [introLogoCropOpen, setIntroLogoCropOpen] = useState(false);
  const [introLogoCropSource, setIntroLogoCropSource] = useState("");
  const [avatarCropSource, setAvatarCropSource] = useState("");
  const [cardCropField, setCardCropField] = useState<HomeVisualImageKey | null>(null);
  const introSettingsFormRef = useRef<HTMLFormElement>(null);
  const siteSettingsFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = tab === "intro" ? introSettingsFormRef.current : tab === "settings" || tab === "music" || tab === "images" || tab === "media" || tab === "river" || tab === "campus" || tab === "timeline" || tab === "notes" || tab === "about" || tab === "messages" ? siteSettingsFormRef.current : null;
    form?.addEventListener("click", animateSettingsDrawer);
    return () => form?.removeEventListener("click", animateSettingsDrawer);
  }, [tab]);
  const cardCrops = normalizeHomeCardCrops(settings.home_card_crops);
  const cardVisibility = normalizeHomeCardVisibility(settings.home_card_visibility);
  const cardOrder = assignedHomeCardOrder(settings.home_card_order, settings.home_card_visibility);
  const visibleCardCount = Object.values(cardVisibility).filter(Boolean).length;
  const currentCard = cardForTab[tab];
  const setCardVisible = (key: HomeCardImageKey, visible: boolean) => {
    if (!visible && visibleCardCount <= 4) {
      setMessage("首页至少保留 4 张栏目卡片");
      return;
    }
    setSettings((current) => {
      const previousVisibility = normalizeHomeCardVisibility(current.home_card_visibility);
      if (previousVisibility[key] === visible) return current;
      const nextVisibility = { ...previousVisibility, [key]: visible };
      const remaining = assignedHomeCardOrder(current.home_card_order, current.home_card_visibility).filter((card) => card !== key);
      const insertion = remaining.filter((card) => nextVisibility[card]).length;
      const nextOrder = visible
        ? [...remaining.slice(0, insertion), key, ...remaining.slice(insertion)]
        : [...remaining, key];
      return { ...current, home_card_visibility: JSON.stringify(nextVisibility), home_card_order: JSON.stringify(nextOrder) };
    });
  };
  const moveCardTo = (key: HomeCardImageKey, target: number) => {
    setSettings((current) => {
      const order = assignedHomeCardOrder(current.home_card_order, current.home_card_visibility);
      const assignedCount = Object.values(normalizeHomeCardVisibility(current.home_card_visibility)).filter(Boolean).length;
      const from = order.indexOf(key);
      if (from < 0 || from >= assignedCount || target < 0 || target >= assignedCount || from === target) return current;
      order.splice(from, 1);
      order.splice(target, 0, key);
      return { ...current, home_card_order: JSON.stringify(order) };
    });
  };
  const customContactLinks = readCustomContactLinks(settings.contact_custom_links);
  const changeCustomContactLinks = (change: (links: CustomContactLink[]) => CustomContactLink[]) => {
    setSettings((current) => ({ ...current, contact_custom_links: JSON.stringify(change(readCustomContactLinks(current.contact_custom_links))) }));
  };
  const addCustomContactLink = (label: string) => {
    if (customContactLinks.length >= 12) return setMessage("最多添加 12 个自定义联系方式");
    changeCustomContactLinks((links) => [...links, { label, url: "" }]);
  };
  const cardAspects = normalizeHomeCardAspects(settings.home_card_aspects);
  const cardAspectFor = (field: HomeCardImageKey) => homeCardAspectRatioOptions.find((option) => option.value === (cardAspects[field] || normalizeHomeCardAspectRatio(settings.home_card_aspect_ratio)))?.ratio || 14 / 9;
  const updateCardAspect = (field: HomeCardImageKey, ratio: HomeCardAspectRatio) => {
    setSettings((current) => ({ ...current, home_card_aspects: JSON.stringify({ ...normalizeHomeCardAspects(current.home_card_aspects), [field]: ratio }) }));
  };
  const updateCardCrop = (field: HomeCardImageKey, crop?: HomeCardCrop) => {
    setSettings((current) => {
      const next = { ...normalizeHomeCardCrops(current.home_card_crops) };
      if (crop) next[field] = crop;
      else delete next[field];
      return { ...current, home_card_crops: JSON.stringify(next) };
    });
  };
  const musicPlaylist = normalizeMusicPlaylist(settings.music_playlist);
  const setMusicPlaylist = (tracks: MusicTrack[]) => setSettings((current) => ({ ...current, music_playlist: JSON.stringify(tracks) }));
  const updateMusicTrack = (index: number, patch: Partial<MusicTrack>) => setMusicPlaylist(musicPlaylist.map((track, trackIndex) => trackIndex === index ? { ...track, ...patch } : track));
  const moveMusicTrack = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= musicPlaylist.length) return;
    const next = [...musicPlaylist];
    [next[index], next[target]] = [next[target], next[index]];
    setMusicPlaylist(next);
  };
  const chooseMusicTrack = async (file: File | undefined, replaceIndex?: number) => {
    if (!file) return;
    if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) return setMessage("背景音乐仅支持 MP3 文件");
    if (file.size > 12 * 1024 * 1024) return setMessage("每首音乐不能超过 12MB");
    if (replaceIndex == null && musicPlaylist.length >= 20) return setMessage("歌单最多可添加 20 首音乐");
    try {
      const data = await readFileAsDataUrl(file);
      const suggestedName = file.name.replace(/\.mp3$/i, "").trim().slice(0, 80) || "未命名歌曲";
      if (replaceIndex == null) {
        setMusicPlaylist([...musicPlaylist, { id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: suggestedName, url: data }]);
      } else {
        updateMusicTrack(replaceIndex, { url: data, name: musicPlaylist[replaceIndex]?.name || suggestedName });
      }
      setMessage(replaceIndex == null ? "音乐已加入歌单预览，保存音乐设置后生效" : "音乐文件已更换，保存音乐设置后生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取音乐文件");
    }
  };
  const [draggedIntroNode, setDraggedIntroNode] = useState<number | string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [securityMessage, setSecurityMessage] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCodeSent, setRecoveryCodeSent] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [inboxMenuOpen, setInboxMenuOpen] = useState(false);
  const [adminFontSize, setAdminFontSize] = useState(100);
  const [adminFontSizeDraft, setAdminFontSizeDraft] = useState(100);
  const fontSliderDragging = useRef(false);
  const [adminTheme, setAdminTheme] = useState<"light" | "dark">("light");
  const [saveDialog, setSaveDialog] = useState<SaveDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [serviceStatus, setServiceStatus] = useState<AdminServiceStatus>("checking");
  const [serverStatus, setServerStatus] = useState<ServerStatusSnapshot | null>(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const [serverStatusError, setServerStatusError] = useState("");
  const [serverStatusLatency, setServerStatusLatency] = useState<number | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("into-admin-token");
    if (saved) setToken(saved);
    setAccountEmailMask(sessionStorage.getItem("into-admin-email-mask") || "");
    setSidebarCollapsed(localStorage.getItem("into-admin-sidebar-collapsed") === "1");
    setAdminTheme(localStorage.getItem("into-admin-theme") === "dark" ? "dark" : "light");
    const savedFontSize = localStorage.getItem("into-admin-font-size");
    const savedPercent = Number(savedFontSize);
    if (savedFontSize !== null && Number.isFinite(savedPercent)) {
      const restoredPercent = Math.max(50, Math.min(160, savedPercent));
      setAdminFontSize(restoredPercent);
      setAdminFontSizeDraft(restoredPercent);
      localStorage.setItem("into-admin-font-size", String(restoredPercent));
    }
  }, []);

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;
    const checkHealth = async () => {
      requestController?.abort();
      requestController = new AbortController();
      const timeout = window.setTimeout(() => requestController?.abort(), 5000);
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: requestController.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) throw new Error("health check failed");
        if (active) setServiceStatus("online");
      } catch {
        if (active) setServiceStatus("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void checkHealth();
    const interval = window.setInterval(checkHealth, 30_000);
    return () => {
      active = false;
      requestController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!introPreviewOpen && !homePreviewOpen && !introCropOpen && !introLogoCropOpen && !avatarCropSource && !cardCropField && !mediaPreview && !mediaCrop) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIntroPreviewOpen(false);
      setHomePreviewOpen(false);
      setIntroCropOpen(false);
      setIntroLogoCropOpen(false);
      setAvatarCropSource("");
      setCardCropField(null);
      setMediaPreview(null);
      setMediaCrop(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [avatarCropSource, cardCropField, homePreviewOpen, introCropOpen, introLogoCropOpen, introPreviewOpen, mediaPreview, mediaCrop]);

  async function loadServerStatus(silent = false) {
    if (!token) return;
    if (!silent) setServerStatusLoading(true);
    setServerStatusError("");
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const data = await api("/api/admin/status", { signal: controller.signal, cache: "no-store" }, token) as ServerStatusSnapshot;
      setServerStatus(data);
      setServerStatusLatency(Math.max(1, Math.round(performance.now() - startedAt)));
      setServiceStatus("online");
    } catch (error) {
      const detail = error instanceof DOMException && error.name === "AbortError"
        ? "检查超时，请稍后重试"
        : error instanceof Error ? error.message : "状态读取失败";
      setServerStatusError(detail);
      if (detail.includes("重新登录")) {
        sessionStorage.removeItem("into-admin-token");
        setToken("");
        setRows([]);
      }
    } finally {
      window.clearTimeout(timeout);
      setServerStatusLoading(false);
    }
  }

  const loadHomepageIntro = async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/admin/homepage-intro", {}, token);
      setSettings((current) => ({ ...current, ...normalizeHomepageIntroSettings(data.settings) }));
      setIntroNodes(Array.isArray(data.nodes) ? data.nodes : defaultHomepageIntroNodes);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开场设置加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTab = async (target: AdminDataTab) => {
    setLoading(true);
    setMessage("");
    try {
      const data = await api(`/api/admin/${target}`, {}, token);
      setRows(data[target] || []);
      if (target === "media") setDirtyMediaIds([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
      if (String(error).includes("重新登录")) logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (tab === "status") void loadServerStatus();
    else if (tab === "intro") loadHomepageIntro();
    else if (tab === "inbox") loadTab(inboxView);
    else if (isMediaSectionTab(tab)) loadTab("media");
    else if (isAdminDataTab(tab)) loadTab(tab);
    else setLoading(false);
    api("/api/content").then((data) => setSettings((current) => ({ ...current, ...(data.settings || {}) }))).catch(() => undefined);
  }, [token, tab, inboxView]);

  useEffect(() => {
    if (!token || tab !== "status") return;
    const interval = window.setInterval(() => { void loadServerStatus(true); }, 30_000);
    return () => window.clearInterval(interval);
  }, [token, tab]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      sessionStorage.setItem("into-admin-token", data.token);
      const masked = maskAccountEmail(username);
      sessionStorage.setItem("into-admin-email-mask", masked);
      setAccountEmailMask(masked);
      setToken(data.token);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  };

  const logout = () => {
    sessionStorage.removeItem("into-admin-token");
    sessionStorage.removeItem("into-admin-email-mask");
    setToken("");
    setAccountEmailMask("");
    setUsername("");
    setRows([]);
    setServerStatus(null);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("into-admin-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const changeAdminFontSize = (value: number) => {
    const percent = Math.max(50, Math.min(160, value));
    setAdminFontSize(percent);
    setAdminFontSizeDraft(percent);
    localStorage.setItem("into-admin-font-size", String(percent));
  };

  const previewAdminFontSize = (value: number) => {
    setAdminFontSizeDraft(value);
    if (!fontSliderDragging.current) changeAdminFontSize(value);
  };

  const selectTab = (nextTab: AdminTab) => {
    if (nextTab !== tab && isMediaSectionTab(tab) && dirtyMediaIds.length && !window.confirm("有未保存的图片修改。离开后这些修改会丢失，确定离开吗？")) return;
    if (nextTab !== tab && isMediaSectionTab(tab)) setDirtyMediaIds([]);
    setTab(nextTab);
    if (adminContentTabs.includes(nextTab)) setContentMenuOpen(true);
    if (nextTab === "inbox") setInboxMenuOpen(true);
    if (isMediaSectionTab(nextTab)) setMediaDestinations(mediaDestinationsForTab(nextTab));
    setMessage("");
    setSecurityMessage("");
    setExpandedMediaId(null);
    setDeleteDialog(null);
  };

  const selectInboxView = (view: "comments" | "submissions") => {
    setInboxView(view);
    selectTab("inbox");
  };

  const requestDeletion = (title: string, detail: string, onConfirm: () => void | Promise<void>, confirmLabel = "确认删除") => {
    setDeleteDialog({ title, detail, confirmLabel, onConfirm });
  };

  const confirmDeletion = () => {
    if (!deleteDialog) return;
    const action = deleteDialog.onConfirm;
    setDeleteDialog(null);
    void action();
  };

  const remove = async (id: number) => {
    try {
      await api(`/api/admin/${tab === "inbox" ? inboxView : isMediaSectionTab(tab) ? "media" : tab}/${id}`, { method: "DELETE" }, token);
      setRows((items) => items.filter((item) => Number(item.id) !== id));
      setDirtyMediaIds((ids) => ids.filter((value) => value !== id));
      setMessage("已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  const chooseMedia = (file?: File, target: MediaTarget = "primary") => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (/\.(heic|heif)$/.test(lowerName) || /image\/(heic|heif)/.test(file.type)) return setMessage("苹果实况照片请先从相册导出为 JPEG；当前会按静态照片保存");
    if (lowerName.endsWith(".mov") || file.type === "video/quicktime") return setMessage("苹果实况视频请先转换成 720P MP4 再上传");
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
    if (!isVideo && !isImage) return setMessage("仅支持 JPG、PNG、WebP、GIF、MP4 或 WebM");
    const companionTarget = target === "companion" || (typeof target === "object" && target.field === "video_url");
    if (companionTarget && !isVideo) return setMessage("关联内容只能选择 MP4 或 WebM 短视频");
    if (!isVideo && file.size > 5 * 1024 * 1024) return setMessage("图片不能超过 5MB");
    if (isVideo && file.size > 12 * 1024 * 1024) return setMessage("短视频不能超过 12MB");
    const read = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const source = String(reader.result);
        if (typeof target === "object") { updateMediaRow(target.id, target.field, source); if (target.field === "url") updateMediaRow(target.id, "thumbnail_url", ""); }
        else if (target === "companion") setVideoUploadData(source);
        else { setUploadData(source); setUploadThumbnailData(""); }
      };
      reader.onerror = () => setMessage("无法读取这个文件");
      reader.readAsDataURL(file);
    };
    if (!isVideo) return read();
    const previewUrl = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(previewUrl);
      if (!Number.isFinite(probe.duration) || probe.duration > 10.1) return setMessage("视频最长为 10 秒，建议控制在 5 秒左右");
      read();
    };
    probe.onerror = () => { URL.revokeObjectURL(previewUrl); setMessage("无法读取视频时长，请换成 MP4 或 WebM"); };
    probe.src = previewUrl;
  };

  const addMedia = async (event: FormEvent) => {
    event.preventDefault();
    if (dirtyMediaIds.length) return setMessage("请先点击顶部“保存全部设置”，再添加新图片，以免丢失尚未保存的编辑");
    if (!uploadData) return setMessage("请先选择图片或短视频");
    if (videoUploadData && isVideoUrl(uploadData)) return setMessage("只有照片可以再关联一个视频；如果只上传视频，请清除右侧关联视频");
    if (!Object.values(mediaDestinations).some(Boolean)) return setMessage("请至少选择一个图片展示栏目");
    try {
      setLoading(true);
      const uploaded = await api("/api/upload", { method: "POST", body: JSON.stringify({ data: uploadData }) });
      const thumbnail = uploadThumbnailData ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: uploadThumbnailData }) }) : { url: "" };
      const companion = videoUploadData ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: videoUploadData }) }) : { url: "" };
      await api("/api/admin/media", { method: "POST", body: JSON.stringify({ url: uploaded.url, thumbnail_url: thumbnail.url, video_url: companion.url, title: mediaTitle || "新的青春片段", meta: mediaMeta || "校园日常", body: mediaBody, taken_at: mediaTakenAt, sort_order: mediaSortOrder.trim() ? Number(mediaSortOrder) : null, show_on_home: mediaDestinations.show_on_home ? 1 : 0, show_in_3d: mediaDestinations.show_in_3d ? 1 : 0, show_in_stories: mediaDestinations.show_in_stories ? 1 : 0 }) }, token);
      setUploadData(""); setUploadThumbnailData(""); setVideoUploadData(""); setMediaTitle(""); setMediaMeta(""); setMediaBody(""); setMediaTakenAt(""); setMediaSortOrder("");
      setMessage(`${adminTabTitles[tab]}图片已添加`);
      await loadTab("media");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setLoading(false);
    }
  };

  const updateMediaRow = (id: number, key: string, value: string | number) => {
    setRows((items) => items.map((item) => Number(item.id) === id ? { ...item, [key]: value } : item));
    setDirtyMediaIds((ids) => ids.includes(id) ? ids : [...ids, id]);
  };

  const updateMediaOrder = (id: number, value: string) => {
    setRows((items) => items.map((item) => Number(item.id) === id ? { ...item, sort_order_input: value, sort_order_dirty: 1 } : item));
    setDirtyMediaIds((ids) => ids.includes(id) ? ids : [...ids, id]);
  };

  const removeRowMedia = async (row: Row, field: "url" | "video_url") => {
    const otherField = field === "url" ? "video_url" : "url";
    if (!row[otherField]) return setMessage("每条内容至少要保留一张图片或一个视频；如需全部移除，请删除整条内容");
    await saveMedia({ ...row, [field]: "", ...(field === "url" ? { thumbnail_url: "" } : {}) });
  };

  const persistMediaRow = async (row: Row): Promise<Row> => {
    if (!mediaVisibilityOptions.some(({ key }) => Number(row[key] ?? 0) === 1)) {
      throw new Error(`“${String(row.title || "未命名照片")}”至少需要保留一个图片展示栏目`);
    }
    const primary = String(row.url || "");
    const companion = String(row.video_url || "");
    const savedPrimary = primary.startsWith("data:") ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: primary }) }) : { url: primary };
    const thumbnail = String(row.thumbnail_url || "");
    const savedThumbnail = thumbnail.startsWith("data:") ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: thumbnail }) }) : { url: thumbnail };
    const savedCompanion = companion.startsWith("data:") ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: companion }) }) : { url: companion };
    await api(`/api/admin/media/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: row.title || "未命名照片",
        url: savedPrimary.url,
        thumbnail_url: savedThumbnail.url,
        video_url: savedCompanion.url,
        meta: row.meta || "",
        body: row.body || "",
        taken_at: row.taken_at || "",
        sort_order: String(row.sort_order_input ?? row.sort_order ?? "").trim() && (Number(row.sort_order_dirty) === 1 || Number(row.sort_manual) === 1) ? Number(row.sort_order_input ?? row.sort_order) : null,
        show_on_home: Number(row.show_on_home ?? 1) === 1 ? 1 : 0,
        show_in_3d: Number(row.show_in_3d ?? 1) === 1 ? 1 : 0,
        show_in_stories: Number(row.show_in_stories ?? 0) === 1 ? 1 : 0,
      }),
    }, token);
    return { ...row, url: savedPrimary.url, thumbnail_url: savedThumbnail.url, video_url: savedCompanion.url, sort_order_dirty: 0 };
  };

  async function saveMedia(row: Row) {
    try {
      setLoading(true);
      setSaveDialog({ phase: "saving", title: "正在删除媒体", detail: "正在从这条内容中永久移除所选图片或视频，请稍候。" });
      const savedRow = await persistMediaRow(row);
      setRows((items) => items.map((item) => Number(item.id) === Number(row.id) ? savedRow : item));
      setDirtyMediaIds((ids) => ids.filter((id) => id !== Number(row.id)));
      setMessage("所选图片或视频已删除");
      setSaveDialog({ phase: "success", title: "删除完成", detail: "所选媒体已经从这条内容中移除，无法恢复。" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "删除失败";
      setMessage(detail);
      setSaveDialog({ phase: "error", title: "删除失败", detail });
    } finally {
      setLoading(false);
    }
  }

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    const saveMediaWithSettings = isMediaSectionTab(tab);
    const pendingMedia = saveMediaWithSettings ? rows.filter((row) => dirtyMediaIds.includes(Number(row.id))) : [];
    let savedMediaCount = 0;
    try {
      setLoading(true);
      setSaveDialog({ phase: "saving", title: "正在保存全部设置", detail: saveMediaWithSettings ? "正在保存图片内容和栏目设置，请稍候。" : "正在把当前修改同步到网站，请稍候。" });
      const nextSettings = { ...settings, hero_secondary_button: visibleHeroSecondaryButton(settings.hero_secondary_button) };
      const links = readCustomContactLinks(nextSettings.contact_custom_links);
      if (links.some(({ label, url }) => !label.trim() || label.trim().length > 32 || !safeContactUrl(url))) {
        throw new Error("请为每个自定义联系方式填写名称和有效的 HTTPS 链接，或删除未完成的项目");
      }
      const invalidMedia = pendingMedia.find((row) => !mediaVisibilityOptions.some(({ key }) => Number(row[key] ?? 0) === 1));
      if (invalidMedia) throw new Error(`“${String(invalidMedia.title || "未命名照片")}”至少需要保留一个图片展示栏目`);
      nextSettings.contact_custom_links = JSON.stringify(links.map(({ label, url }) => ({ label: label.trim(), url: url.trim() })));
      for (const row of pendingMedia) {
        setSaveDialog({ phase: "saving", title: "正在保存全部设置", detail: `正在保存图片 ${savedMediaCount + 1} / ${pendingMedia.length}，随后保存栏目设置。` });
        const savedRow = await persistMediaRow(row);
        setRows((items) => items.map((item) => Number(item.id) === Number(row.id) ? savedRow : item));
        setDirtyMediaIds((ids) => ids.filter((id) => id !== Number(row.id)));
        savedMediaCount += 1;
      }
      const visualImageFields: HomeVisualImageKey[] = ["home_profile_avatar", "home_background_url", "home_hero_image", "about_page_image", ...homeVisualCardDefinitions.map((item) => item.key)];
      for (const field of visualImageFields) {
        if (nextSettings[field].startsWith("data:image/")) {
          const uploaded = await api("/api/admin/intro-upload", { method: "POST", body: JSON.stringify({ data: nextSettings[field] }) }, token);
          nextSettings[field] = uploaded.url;
        }
      }
      const uploadedTracks: MusicTrack[] = [];
      for (const track of normalizeMusicPlaylist(nextSettings.music_playlist)) {
        if (track.url.startsWith("data:audio/mpeg;base64,")) {
          const uploaded = await api("/api/admin/music-upload", { method: "POST", body: JSON.stringify({ data: track.url }) }, token);
          uploadedTracks.push({ ...track, url: uploaded.url });
        } else {
          uploadedTracks.push(track);
        }
      }
      nextSettings.music_playlist = JSON.stringify(uploadedTracks);
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify(nextSettings) }, token);
      setSettings(nextSettings);
      setMessage(saveMediaWithSettings ? "图片内容与栏目设置已保存" : "网站设置已经更新");
      setSaveDialog({ phase: "success", title: "保存完成", detail: saveMediaWithSettings ? `已保存 ${savedMediaCount} 条图片修改及栏目设置，前台刷新后即可看到更新。` : "网站设置已保存，前台刷新后即可看到更新。" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "保存失败";
      const detail = savedMediaCount ? `已有 ${savedMediaCount} 条图片保存成功；其他修改尚未全部保存。${reason}` : reason;
      setMessage(detail);
      setSaveDialog({ phase: "error", title: "保存失败", detail });
    } finally {
      setLoading(false);
    }
  };

  const saveMusicSettings = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      setSaveDialog({ phase: "saving", title: "正在保存音乐设置", detail: "正在上传歌单并保存默认播放状态。" });
      const uploadedTracks: MusicTrack[] = [];
      for (const track of normalizeMusicPlaylist(settings.music_playlist)) {
        if (track.url.startsWith("data:audio/mpeg;base64,")) {
          const uploaded = await api("/api/admin/music-upload", { method: "POST", body: JSON.stringify({ data: track.url }) }, token);
          uploadedTracks.push({ ...track, url: uploaded.url });
        } else {
          uploadedTracks.push(track);
        }
      }
      const musicSettings = {
        music_default_on: settings.music_default_on === "1" ? "1" : "0",
        music_default_volume: String(normalizeMusicVolume(settings.music_default_volume)),
        music_playlist: JSON.stringify(uploadedTracks),
      };
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify(musicSettings) }, token);
      setSettings((current) => ({ ...current, ...musicSettings }));
      setMessage("音乐设置已保存");
      setSaveDialog({ phase: "success", title: "保存完成", detail: "歌单和默认播放状态已生效，前台刷新后即可看到更新。" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "保存失败";
      setMessage(detail);
      setSaveDialog({ phase: "error", title: "保存失败", detail });
    } finally {
      setLoading(false);
    }
  };

  const chooseHomeVisualImage = async (file: File | undefined, field: HomeVisualImageKey) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return setMessage("首页图片仅支持 JPG、PNG 或 WebP 格式");
    }
    if (file.size > 10 * 1024 * 1024) return setMessage("原始图片不能超过 10MB");
    try {
      setLoading(true);
      const compressed = field === "home_profile_avatar" ? await readFileAsDataUrl(file) : await compressIntroImage(file, field === "home_background_url" || field === "home_hero_image" ? 2600 : 1800);
      if (field === "home_profile_avatar") {
        setAvatarCropSource(compressed);
        setMessage("请在圆形选框中调整头像取景，确认后再保存全部设置");
        return;
      }
      if (Math.ceil(compressed.length * 0.75) > 5 * 1024 * 1024) return setMessage("压缩后的图片仍超过 5MB，请换一张图片");
      setSettings((current) => {
        const next = { ...current, [field]: compressed };
        if (field.startsWith("home_card_")) {
          const crops = { ...normalizeHomeCardCrops(current.home_card_crops) };
          delete crops[field];
          next.home_card_crops = JSON.stringify(crops);
        }
        return next;
      });
      if (field !== "home_background_url" && field !== "about_page_image") setCardCropField(field);
      setMessage(field === "home_background_url" ? "首页背景已加入预览；保存后会始终从图片中心自适应裁切" : field === "about_page_image" ? "关于我们图片已加入预览；保存全部设置后生效" : field === "home_hero_image" ? "主视觉已加入预览，请完成裁切后保存全部设置" : "原比例图片已加入预览，请选择希望展示的区域后保存全部设置");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片处理失败");
    } finally {
      setLoading(false);
    }
  };

  const applyHomeBackgroundTone = (value: string, background: string, accent: string) => {
    setSettings((current) => ({
      ...current,
      home_background_tone: value,
      home_background_color: background,
      home_accent_color: accent,
    }));
  };

  const setIntroSetting = (key: keyof HomepageIntroSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const chooseIntroImage = async (file: File | undefined, field: "intro_logo" | "intro_background_desktop_image" | "intro_background_mobile_image") => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return setMessage("开场图片仅支持 JPG、PNG 或 WebP；为避免 SVG 脚本风险，后台不接受 SVG 上传");
    }
    if (file.size > 10 * 1024 * 1024) return setMessage("原始图片不能超过 10MB");
    try {
      setLoading(true);
      const compressed = await compressIntroImage(file, field === "intro_logo" ? 1024 : 2400);
      const estimatedBytes = Math.ceil(compressed.length * 0.75);
      if (estimatedBytes > 5 * 1024 * 1024) return setMessage("压缩后的图片仍超过 5MB，请换一张图片");
      if (field === "intro_logo") {
        setIntroLogoCropSource(compressed);
        setIntroLogoCropOpen(true);
        setMessage("Logo 已加入圆形裁切，请调整取景后确认");
      } else {
        const viewport: CropViewport = field === "intro_background_desktop_image" ? "desktop" : "mobile";
        setSettings((current) => ({
          ...current,
          [field]: compressed,
          ...(viewport === "desktop" ? { intro_background_image: compressed } : {}),
          [`intro_background_${viewport}_x`]: "50",
          [`intro_background_${viewport}_y`]: "50",
          [`intro_background_${viewport}_zoom`]: "100",
          [`intro_background_${viewport}_crop_left`]: "",
          [`intro_background_${viewport}_crop_top`]: "",
          [`intro_background_${viewport}_crop_width`]: "",
          [`intro_background_${viewport}_crop_height`]: "",
          [`intro_background_${viewport}_ratio_locked`]: "1",
        }));
        setIntroCropOpen(true);
      }
      if (field !== "intro_logo") setMessage(`${field === "intro_background_desktop_image" ? "电脑端" : "手机端"}背景已压缩并加入预览，保存后生效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片处理失败");
    } finally {
      setLoading(false);
    }
  };

  const updateIntroNode = (id: number | string | undefined, key: "title" | "subtitle" | "enabled", value: string | number) => {
    setIntroNodes((items) => items.map((node) => node.id === id ? { ...node, [key]: value } : node));
  };

  const normalizeIntroNodeOrder = (items: HomepageIntroNode[]) => items.map((node, index) => ({ ...node, sort_order: index + 1 }));

  const moveIntroNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= introNodes.length) return;
    const next = [...introNodes];
    [next[index], next[target]] = [next[target], next[index]];
    setIntroNodes(normalizeIntroNodeOrder(next));
  };

  const dropIntroNode = (targetId: number | string | undefined) => {
    if (draggedIntroNode === null || draggedIntroNode === targetId) return setDraggedIntroNode(null);
    setIntroNodes((items) => {
      const sourceIndex = items.findIndex((node) => node.id === draggedIntroNode);
      const targetIndex = items.findIndex((node) => node.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return items;
      const next = [...items];
      const [moving] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moving);
      return normalizeIntroNodeOrder(next);
    });
    setDraggedIntroNode(null);
  };

  const addIntroNode = () => {
    if (introNodes.length >= 12) return setMessage("路线节点最多 12 个");
    setIntroNodes((items) => [...items, {
      id: `new-${Date.now()}`,
      title: "新的节点",
      subtitle: "NEW MOMENT",
      sort_order: items.length + 1,
      enabled: 1,
    }]);
  };

  const restoreDefaultIntroNodes = () => {
    setIntroNodes(defaultHomepageIntroNodes.map((node) => ({ ...node })));
    setMessage("已恢复默认四个路线节点，请点击“保存首页开场”使前台生效");
  };

  const saveHomepageIntro = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      setSaveDialog({ phase: "saving", title: "正在保存首页开场", detail: "正在上传图片并同步开场设置，请稍候。" });
      const introSettings = normalizeHomepageIntroSettings(settings);
      for (const field of ["intro_logo", "intro_background_desktop_image", "intro_background_mobile_image"] as const) {
        if (introSettings[field].startsWith("data:")) {
          const uploaded = await api("/api/admin/intro-upload", { method: "POST", body: JSON.stringify({ data: introSettings[field] }) }, token);
          introSettings[field] = uploaded.url;
        }
      }
      introSettings.intro_background_image = introSettings.intro_background_desktop_image;
      await api("/api/admin/homepage-intro", {
        method: "POST",
        body: JSON.stringify({ settings: introSettings, nodes: normalizeIntroNodeOrder(introNodes) }),
      }, token);
      setSettings((current) => ({ ...current, ...introSettings }));
      setMessage("首页开场设置已保存，前台刷新后立即生效");
      setSaveDialog({ phase: "success", title: "保存完成", detail: "首页开场设置已保存，前台刷新后立即生效。" });
      await loadHomepageIntro();
      setIntroPreviewKey((value) => value + 1);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "开场设置保存失败";
      setMessage(detail);
      setSaveDialog({ phase: "error", title: "保存失败", detail });
    } finally {
      setLoading(false);
    }
  };

  const timelineItems = parseTimelineItems(settings.timeline_items);
  const introSettings = normalizeHomepageIntroSettings(settings);
  const setTimelineItems = (items: TimelineItem[]) => setSettings({ ...settings, timeline_items: JSON.stringify(items) });
  const setDisplayPreset = (value: string) => setSettings((current) => ({
    ...current,
    display_font_scale: normalizeDisplayScale(value),
    display_media_scale: normalizeDisplayScale(value),
  }));
  const setGalaxyPreset = (value: GalaxyScenePreset) => {
    const preset = galaxyScenePresets.find((item) => item.value === value) || galaxyScenePresets[0];
    setSettings((current) => ({ ...current, galaxy_scene_preset: preset.value, ...preset.settings }));
  };
  const resetHomeCopySection = (id: HomeCopySectionId) => {
    setSettings((current) => ({ ...current, ...getHomeCopySectionDefaults(id) }));
    setMessage("这一组标题已恢复默认；点击页面顶部的“保存全部设置”后前台生效");
  };
  const updateTimelineItem = (index: number, key: keyof TimelineItem, value: string) => {
    const next = timelineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    setTimelineItems(next);
  };
  const moveTimelineItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= timelineItems.length) return;
    const next = [...timelineItems];
    [next[index], next[target]] = [next[target], next[index]];
    setTimelineItems(next);
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/admin/password-recovery/complete", { method: "POST", body: JSON.stringify({ password: newPassword, code: verificationCode }) });
      setMessage("密码已更新，请使用新密码登录");
      setNewPassword("");
      setVerificationCode("");
      setRecoveryCodeSent(false);
      setTurnstileToken("");
      if (token) logout();
      else setRecoveryOpen(false);
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "修改失败");
    }
  };

  const sendPasswordCode = async () => {
    if (!turnstileToken) return setSecurityMessage("请先完成人机验证");
    try {
      setCodeLoading(true);
      setSecurityMessage("");
      const data = await api("/api/admin/password-recovery/code", { method: "POST", body: JSON.stringify({ turnstile_token: turnstileToken }) });
      setSecurityMessage(`验证码已发送到 ${data.email}，10 分钟内有效`);
      setRecoveryCodeSent(true);
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setCodeLoading(false);
      setTurnstileReset((value) => value + 1);
    }
  };

  const managedRows = isMediaSectionTab(tab) ? rows.filter((row) => Number(row[mediaSectionFlags[tab]] ?? 0) === 1) : rows;
  const renderDataList = () => (
          <div className="admin-table-wrap">
            {loading ? <div className="admin-empty">正在整理内容…</div> : managedRows.length === 0 ? <div className="admin-empty">这里暂时还没有内容</div> : (
              <div className={`admin-table ${isMediaSectionTab(tab) ? "media-table-list" : ""}`}>
                {managedRows.map((row) => {
                  const mediaId = Number(row.id);
                  const isMediaTab = isMediaSectionTab(tab);
                  const mediaExpanded = isMediaTab && expandedMediaId === mediaId;
                  return <article key={String(row.id)} className={isMediaTab ? `media-row${mediaExpanded ? " is-expanded" : ""}` : ""}>
                  {isMediaTab && (row.url || row.video_url) ? <div className="media-row-preview">
                    {row.url ? <div className="media-preview-item">
                      <button type="button" className="media-preview-open" aria-label={`预览${String(row.title || "未命名")}的${isVideoUrl(row.url) ? "视频" : "原图"}`} onClick={() => setMediaPreview({ url: String(row.url), title: String(row.title || "未命名"), video: isVideoUrl(row.url) })}>{isVideoUrl(row.url) ? <video src={String(row.url)} muted playsInline preload="metadata" /> : <img src={String(row.thumbnail_url || row.url)} alt="" />}<span>点击预览原图</span></button>
                      <label className="media-preview-replace">更换{isVideoUrl(row.url) ? "视频" : "图片"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => { chooseMedia(event.target.files?.[0], { id: mediaId, field: "url" }); event.currentTarget.value = ""; }} /></label>
                      {!isVideoUrl(row.url) && <button type="button" className="media-preview-replace" onClick={() => setMediaCrop({ source: String(row.url), target: { id: mediaId, field: "url" }, replaceOriginal: false })}>调整取景</button>}
                      <button type="button" className="media-preview-delete" onClick={() => requestDeletion(isVideoUrl(row.url) ? "删除这个视频？" : "删除这张图片？", "确认后会立即从这条内容中永久删除，删除后无法恢复。", () => removeRowMedia(row, "url"))}>{isVideoUrl(row.url) ? "删除视频" : "删除图片"}</button>
                    </div> : <label className="media-preview-empty">＋ 添加图片或视频<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => { chooseMedia(event.target.files?.[0], { id: mediaId, field: "url" }); event.currentTarget.value = ""; }} /></label>}
                    {row.video_url && <div className="media-preview-item">
                      <button type="button" className="media-preview-open" aria-label={`预览${String(row.title || "未命名")}的关联视频`} onClick={() => setMediaPreview({ url: String(row.video_url), title: `${String(row.title || "未命名")} · 关联视频`, video: true })}><video src={String(row.video_url)} muted playsInline preload="metadata" /><span>点击预览</span></button>
                      <label className="media-preview-replace">更换视频<input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: mediaId, field: "video_url" })} /></label>
                      <button type="button" className="media-preview-delete" onClick={() => requestDeletion("删除关联视频？", "确认后会立即永久删除这个关联视频，删除后无法恢复。", () => removeRowMedia(row, "video_url"))}>删除视频</button>
                    </div>}
                  </div> : <div className="row-avatar">{tab === "comments" || tab === "inbox" && inboxView === "comments" ? String(row.avatar || "○") : "✉"}</div>}
                  <div className="row-content">{isMediaTab ? <>
                    <div className="media-card-summary">
                      <div className="media-card-title"><strong>{String(row.title || "未命名")}</strong><time>{formatDate(row.taken_at || row.created_at)}</time></div>
                      <p className="media-card-meta">{String(row.meta || "暂无地点或说明")}</p>
                      <div className="media-card-chips" aria-label="内容展示状态">
                        <span className="media-card-chip">顺序 {String(row.sort_order_input ?? row.sort_order ?? "—")}</span>
                        {mediaVisibilityOptions.filter(({ key }) => Number(row[key] ?? 0) === 1).map(({ key, label }) => <span className="media-card-chip is-active" key={key}>{label.replace("同步到", "")}</span>)}
                        {row.video_url && <span className="media-card-chip is-video">含短视频</span>}
                      </div>
                      <button type="button" className="media-edit-toggle" aria-expanded={mediaExpanded} aria-controls={`media-editor-${mediaId}`} onClick={() => setExpandedMediaId(mediaExpanded ? null : mediaId)}>{mediaExpanded ? "收起编辑" : "编辑内容"}<span aria-hidden="true">{mediaExpanded ? "↑" : "↓"}</span></button>
                    </div>
                    {isMediaTab && <div className={`media-row-editor-drawer${mediaExpanded ? " is-expanded" : ""}`} id={`media-editor-${mediaId}`} aria-hidden={!mediaExpanded} inert={!mediaExpanded}><div className="media-row-editor">
                      <section className="media-edit-panel media-edit-story" aria-label="图片内容">
                        <div className="media-edit-panel-heading"><strong>图片内容</strong><span>编辑访客看到的标题、地点与正文</span></div>
                        <div className="media-edit-field-grid">
                          <label>标题<input value={String(row.title || "")} onChange={(event) => updateMediaRow(mediaId, "title", event.target.value)} /></label>
                          <label>地点 / 说明<input value={String(row.meta || "")} onChange={(event) => updateMediaRow(mediaId, "meta", event.target.value)} /></label>
                          <label className="media-body-field">正文<textarea maxLength={3000} value={String(row.body || "")} onChange={(event) => updateMediaRow(mediaId, "body", event.target.value)} /></label>
                        </div>
                      </section>
                      <div className="media-edit-side">
                        <section className="media-edit-panel media-edit-display" aria-label="展示设置">
                          <div className="media-edit-panel-heading"><strong>展示设置</strong><span>时间、顺序与出现栏目</span></div>
                          <div className="media-edit-field-grid">
                            <label>拍摄时间<input type="datetime-local" value={String(row.taken_at || "")} onChange={(event) => updateMediaRow(mediaId, "taken_at", event.target.value)} /></label>
                            <label>展示顺序<input type="number" min="1" step="1" value={String(row.sort_order_input ?? row.sort_order ?? "")} onChange={(event) => updateMediaOrder(mediaId, event.target.value)} /></label>
                          </div>
                          <fieldset className="media-sync-options"><legend>同步展示到</legend><div>{mediaVisibilityOptions.map(({ key, label }) => <label key={key}><input type="checkbox" checked={Number(row[key] ?? 0) === 1} onChange={(event) => updateMediaRow(mediaId, key, event.target.checked ? 1 : 0)} /><span>{label}</span></label>)}</div><small>可同时选择多个栏目；保存后会共用这条图片和文字。</small></fieldset>
                        </section>
                        <section className="media-edit-panel media-edit-video" aria-label="关联短视频">
                          <div className="media-edit-panel-heading"><strong>关联短视频</strong><span>{row.video_url ? "已关联，左侧可预览" : "未关联"}</span></div>
                          <label className="media-row-video">选择 MP4 或 WebM<input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: mediaId, field: "video_url" })} /><span>{row.video_url ? "可更换现有视频" : "添加后与图片一同展示"}</span></label>
                          {row.video_url && <button type="button" className="media-remove-video" onClick={() => requestDeletion("删除关联视频？", "确认后会立即永久删除这个关联视频，删除后无法恢复。", () => removeRowMedia(row, "video_url"))}>移除关联视频</button>}
                        </section>
                      </div>
                    </div></div>}
                  </> : <><div><strong>{String(row.nickname || row.title || "未命名")}</strong><time>{formatDate(row.created_at)}</time></div><h3>{tab === "submissions" || tab === "inbox" && inboxView === "submissions" ? String(row.title || "") : ""}</h3><p>{String(row.text || row.body || "")}</p>{(tab === "submissions" || tab === "inbox" && inboxView === "submissions") && row.email ? <a className="submission-email" href={`mailto:${String(row.email)}`}>邮件联系 {String(row.email)} <span className="micro-arrow">↗</span></a> : null}{row.image ? <a href={String(row.image)} target="_blank" rel="noreferrer">查看附图 <span className="micro-arrow">↗</span></a> : null}</>}</div>
                  <button className="delete-row" onClick={() => requestDeletion(`删除“${String(row.nickname || row.title || "这条内容")}”？`, "确认后会永久删除整条内容及其信息，删除后无法恢复。", () => remove(Number(row.id)), "永久删除")}>删除</button>
                </article>})}
              </div>
            )}
          </div>
  );

  if (!token) {
    return (
      <main className="admin-shell login-shell" data-admin-theme={adminTheme}>
        <a className="admin-brand" href="/">MEMORY <span>/</span> 记忆档案</a>
        <button className="admin-theme-toggle admin-login-theme-toggle" type="button" aria-pressed={adminTheme === "dark"} onClick={() => { const nextTheme = adminTheme === "dark" ? "light" : "dark"; setAdminTheme(nextTheme); localStorage.setItem("into-admin-theme", nextTheme); }}>{adminTheme === "dark" ? "☀ 浅色模式" : "☾ 深色模式"}</button>
        <form className="admin-login" onSubmit={recoveryOpen ? changePassword : login}>
          <div className="admin-symbol">✦</div>
          <p>CREATOR CONSOLE</p>
          <h1>{recoveryOpen ? <>找回你的<br /><em>管理员密码</em></> : <>回到你的<br /><em>青春控制室</em></>}</h1>
          {recoveryOpen ? <>
            <div className="recovery-steps"><span className="active">1 人机验证</span><span className={recoveryCodeSent ? "active" : ""}>2 邮箱验证</span><span className={recoveryCodeSent ? "active" : ""}>3 新密码</span></div>
            {!recoveryCodeSent && <>
              <p className="recovery-hint">先完成人机验证，再把 6 位验证码发送到管理员邮箱。</p>
              <TurnstileVerification onVerify={setTurnstileToken} resetSignal={turnstileReset} theme={adminTheme} />
              <button type="button" onClick={sendPasswordCode} disabled={codeLoading || !turnstileToken}>{codeLoading ? "正在发送…" : "发送邮箱验证码"}<span className="micro-arrow">↗</span></button>
            </>}
            {recoveryCodeSent && <>
              <label htmlFor="admin-recovery-code">6 位邮箱验证码</label>
              <input id="admin-recovery-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} placeholder="输入邮箱中的验证码" required />
              <label htmlFor="admin-new-password">新管理员密码</label>
              <input id="admin-new-password" type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 12 位" required />
              <button type="submit">验证并更新密码 <span className="micro-arrow">↗</span></button>
            </>}
            {securityMessage && <div className="security-message" role="status">{securityMessage}</div>}
            <button className="login-link-button" type="button" onClick={() => { setRecoveryOpen(false); setRecoveryCodeSent(false); setSecurityMessage(""); setTurnstileToken(""); }}>返回管理员登录</button>
          </> : <>
            <label htmlFor="admin-username">管理员用户名</label>
            <input id="admin-username" type="email" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required placeholder="输入管理员邮箱" />
            <label htmlFor="admin-password">管理员密码</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="输入管理员密码" />
            <button type="submit">进入后台 <span className="micro-arrow">↗</span></button>
            <button className="login-link-button" type="button" onClick={() => { setRecoveryOpen(true); setMessage(""); }}>忘记密码？</button>
            {message && <small>{message}</small>}
          </>}
        </form>
      </main>
    );
  }

  return (
    <main className={"admin-shell" + (sidebarCollapsed ? " sidebar-collapsed" : "")} style={{ "--admin-font-scale": adminFontSize / 100, "--admin-small-font-scale": adminFontSize * 1.5 / 100 } as CSSProperties} data-admin-theme={adminTheme} data-admin-large={adminFontSize >= 140 ? "true" : undefined}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head"><a className="admin-brand" href="/"><b>MEMORY</b> <span>/</span> <em>记忆档案</em></a><button className="admin-sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "展开菜单栏" : "收起菜单栏"} title={sidebarCollapsed ? "展开菜单栏" : "收起菜单栏"}><span className="micro-arrow">{sidebarCollapsed ? "→" : "←"}</span></button></div>
        <nav>
          {adminNavigationItems.map(({ key, label, icon }) => key === "images" ? (
            <div className="admin-nav-group" key="website-content">
              <button type="button" className={`admin-nav-parent${adminContentTabs.includes(tab) ? " is-current" : ""}`} aria-expanded={contentMenuOpen} aria-controls="admin-content-submenu" onClick={() => { setContentMenuOpen((open) => sidebarCollapsed || !open); if (sidebarCollapsed) { setSidebarCollapsed(false); localStorage.setItem("into-admin-sidebar-collapsed", "0"); } }} title={sidebarCollapsed ? "网站内容设置" : undefined}><span>▤</span><b>网站内容设置</b><i aria-hidden="true">⌄</i></button>
              <div id="admin-content-submenu" className={`admin-nav-children${contentMenuOpen ? " is-open" : ""}`} aria-hidden={!contentMenuOpen} inert={!contentMenuOpen}><div className="admin-nav-children-inner">{adminNavigationItems.filter((item) => adminContentTabs.includes(item.key)).map((item) => <button key={item.key} type="button" className={tab === item.key ? "active" : ""} aria-current={tab === item.key ? "page" : undefined} onClick={() => selectTab(item.key)}><span>{item.icon}</span><b>{item.label}</b></button>)}</div></div>
            </div>
          ) : key === "inbox" ? (
            <div className="admin-nav-group" key="inbox">
              <button type="button" className={`admin-nav-parent${tab === "inbox" ? " is-current" : ""}`} aria-expanded={inboxMenuOpen} aria-controls="admin-inbox-submenu" onClick={() => { setInboxMenuOpen((open) => sidebarCollapsed || !open); if (sidebarCollapsed) { setSidebarCollapsed(false); localStorage.setItem("into-admin-sidebar-collapsed", "0"); } }} title={sidebarCollapsed ? label : undefined}><span>{icon}</span><b>{label}</b><i aria-hidden="true">⌄</i></button>
              <div id="admin-inbox-submenu" className={`admin-nav-children admin-inbox-children${inboxMenuOpen ? " is-open" : ""}`} aria-hidden={!inboxMenuOpen} inert={!inboxMenuOpen}><div className="admin-nav-children-inner admin-inbox-children-inner"><button type="button" className={tab === "inbox" && inboxView === "comments" ? "active" : ""} aria-current={tab === "inbox" && inboxView === "comments" ? "page" : undefined} onClick={() => selectInboxView("comments")}><span>◉</span><b>留言管理</b></button><button type="button" className={tab === "inbox" && inboxView === "submissions" ? "active" : ""} aria-current={tab === "inbox" && inboxView === "submissions" ? "page" : undefined} onClick={() => selectInboxView("submissions")}><span>▣</span><b>投稿信箱</b></button></div></div>
            </div>
          ) : adminContentTabs.includes(key) ? null : (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => selectTab(key)} title={sidebarCollapsed ? label : undefined}><span>{icon}</span><b>{label}</b></button>
          ))}
        </nav>
        <div className="sidebar-bottom"><a href="/" target="_blank"><span className="micro-arrow">↗</span><b>查看网站</b></a><button onClick={logout}><span>↩</span><b>退出后台</b></button></div>
      </aside>
      <section className="admin-main">
        <header><div><p>CREATOR CONSOLE / 2026</p><h1>{tab === "inbox" ? inboxView === "comments" ? "留言管理" : "投稿信箱" : adminTabTitles[tab]}</h1></div><div className="admin-header-tools"><button className="admin-theme-toggle" type="button" aria-pressed={adminTheme === "dark"} onClick={() => { const nextTheme = adminTheme === "dark" ? "light" : "dark"; setAdminTheme(nextTheme); localStorage.setItem("into-admin-theme", nextTheme); }}>{adminTheme === "dark" ? "☀ 浅色模式" : "☾ 深色模式"}</button><label className="admin-font-size-control"><span>界面字号</span><input id="admin-font-size-range" type="range" min="50" max="160" step="5" value={adminFontSizeDraft} aria-label="后台界面字号" aria-valuetext={`${adminFontSizeDraft}%`} onPointerDown={() => { fontSliderDragging.current = true; }} onPointerUp={(event) => { fontSliderDragging.current = false; changeAdminFontSize(Number(event.currentTarget.value)); }} onPointerCancel={() => { fontSliderDragging.current = false; setAdminFontSizeDraft(adminFontSize); }} onBlur={(event) => { fontSliderDragging.current = false; changeAdminFontSize(Number(event.currentTarget.value)); }} onChange={(event) => previewAdminFontSize(Number(event.target.value))} /><output htmlFor="admin-font-size-range">{adminFontSizeDraft}%</output></label><span className={`admin-status is-${serviceStatus}`} role="status" aria-live="polite" title="每 30 秒检查一次后台服务"><i /> {serviceStatus === "online" ? "服务在线" : serviceStatus === "offline" ? "服务连接失败" : "正在检查服务"}</span></div></header>
        {message && <div className="admin-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={tab}
            className="admin-tab-panel"
            initial={reduceMotion ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -7, filter: "blur(3px)" }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 0.7, 0.18, 1] }}
          >
        {tab === "status" && (
          <ServerStatusPanel
            snapshot={serverStatus}
            loading={serverStatusLoading}
            error={serverStatusError}
            latencyMs={serverStatusLatency}
            onRefresh={() => { void loadServerStatus(); }}
            onNavigate={selectTab}
          />
        )}
        {isMediaSectionTab(tab) && <div className="settings-save-bar media-section-save-bar">
          <div><strong>{adminTabTitles[tab]}</strong><span>统一保存本栏目图片内容、标题与展示设置。</span></div>
          <div className="settings-save-actions"><label className="admin-card-visibility"><input type="checkbox" checked={cardVisibility[cardForTab[tab]]} disabled={cardVisibility[cardForTab[tab]] && visibleCardCount <= 4} onChange={(event) => setCardVisible(cardForTab[tab], event.target.checked)} /><span>首页显示此卡片{visibleCardCount <= 4 ? " · 至少保留4张" : ""}</span></label><button type="submit" form="admin-site-settings-form" disabled={loading}>{loading && saveDialog?.phase === "saving" ? "正在保存" : "保存全部设置"}</button></div>
        </div>}
        {isMediaSectionTab(tab) && <div className="admin-story-intro"><div><strong>{adminTabTitles[tab]}图片</strong><span>在这里添加和编辑本栏目的照片、短视频与文字。已有图片会按所属栏目显示，内容不会被移动或删除。</span></div></div>}
        {isMediaSectionTab(tab) && (
          <form className="media-form" onSubmit={addMedia}>
            <label className="media-drop">{uploadData ? isVideoUrl(uploadData) ? <video src={uploadData} muted loop autoPlay playsInline /> : <img src={uploadThumbnailData || uploadData} alt="方形展示预览" /> : <><strong>＋</strong><span>选择{adminTabTitles[tab]}照片或短视频</span><small>图片最大 5MB；MP4/WebM 最长 10 秒、最大 12MB。苹果实况照片请导出 JPEG，保留动态则转为 720P MP4。</small></>}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => { chooseMedia(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            <div className="media-create-layout">
              <section className="media-edit-panel media-edit-story">
                <div className="media-edit-panel-heading"><strong>图片内容</strong><span>填写访客将看到的标题、地点与正文</span></div>
                {uploadData && !isVideoUrl(uploadData) && <><small>保存时自动生成压缩预览，原图保留。需要调整画面时可手动取景。</small><button type="button" className="media-recrop-button" onClick={() => setMediaCrop({ source: uploadData, target: "primary", replaceOriginal: false })}>手动调整取景（可选）</button></>}
                <div className="media-edit-field-grid">
                  <label>标题<input placeholder="故事标题" value={mediaTitle} onChange={(event) => setMediaTitle(event.target.value)} /></label>
                  <label>地点 / 说明<input placeholder="例如：初夏 · 操场" value={mediaMeta} onChange={(event) => setMediaMeta(event.target.value)} /></label>
                  <label className="media-body-field">正文<textarea className="media-body-input" placeholder="写下这张照片或视频背后的故事" maxLength={3000} value={mediaBody} onChange={(event) => setMediaBody(event.target.value)} /></label>
                </div>
              </section>
              <div className="media-edit-side">
                <section className="media-edit-panel media-edit-display">
                  <div className="media-edit-panel-heading"><strong>展示设置</strong><span>时间、顺序与出现栏目</span></div>
                  <div className="media-edit-field-grid">
                    <label className="media-field">拍摄时间<input type="datetime-local" value={mediaTakenAt} onChange={(event) => setMediaTakenAt(event.target.value)} /></label>
                    <label className="media-field">展示顺序（可选）<input type="number" min="1" step="1" placeholder="留空则自动排序" value={mediaSortOrder} onChange={(event) => setMediaSortOrder(event.target.value)} /></label>
                  </div>
                  <fieldset className="media-sync-options"><legend>同步展示到</legend><div>{mediaVisibilityOptions.map(({ key, label }) => <label key={key}><input type="checkbox" checked={mediaDestinations[key]} onChange={(event) => setMediaDestinations((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div><small>一张图片可以同时出现在多个栏目。</small></fieldset>
                </section>
                <section className="media-edit-panel media-edit-video">
                  <div className="media-edit-panel-heading"><strong>关联短视频</strong><span>可选，仅照片可关联视频</span></div>
                  <label className="media-companion">选择 MP4 或 WebM<span>{videoUploadData ? <video src={videoUploadData} muted playsInline /> : "先展示左侧照片；视频加载完成后自动播放"}</span><input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], "companion")} /></label>
                  {videoUploadData && <button type="button" className="media-remove-video" onClick={() => requestDeletion("移除待上传的关联视频？", "确认后需要重新选择这个视频；当前尚未上传到网站。", () => setVideoUploadData(""), "确认移除")}>移除关联视频</button>}
                </section>
                <button type="submit" className="media-create-submit" disabled={loading}>{`添加${adminTabTitles[tab]}图片`}</button>
              </div>
            </div>
          </form>
        )}
        {isMediaSectionTab(tab) && <details key={`media-list-${tab}`} className="admin-settings-accordion media-list-accordion"><summary onClick={(event) => animateSettingsDrawer(event.nativeEvent)}>图片内容<span>已收录 {managedRows.length} 条 · 点击展开预览和编辑</span></summary>{renderDataList()}</details>}
        {tab === "status" ? null : tab === "intro" ? (
          <div className="intro-admin-grid">
            <form ref={introSettingsFormRef} className="settings-form intro-settings-form" onSubmit={saveHomepageIntro}>
              <div className="intro-quick-save">
                <div><strong>首页开场</strong><span>修改后随时保存，无需滑到页面底部</span></div>
                <button type="submit" disabled={loading}>{loading && saveDialog?.phase === "saving" ? "正在保存" : "保存首页开场"}</button>
              </div>
              <div className="intro-settings-heading"><div><p>LANDING INTRO</p><h2>首页开场设置</h2></div><label className="intro-master-switch"><input type="checkbox" checked={introSettings.intro_enabled === "1"} onChange={(event) => setIntroSetting("intro_enabled", event.target.checked ? "1" : "0")} /><span>启用开场</span></label></div>
              <details className="admin-settings-accordion intro-settings-accordion"><summary><span className="intro-accordion-copy"><strong>基础内容</strong><small>Logo、开屏背景与标题</small></span></summary>
              <section className="intro-settings-section">
                <h3>基础内容</h3>
                <div className="intro-asset-grid">
                  <div className="intro-asset-card">
                    <span>网站 Logo</span>
                    <div className="intro-logo-preview">{introSettings.intro_logo ? <img src={introSettings.intro_logo} alt="当前开场 Logo" /> : <b>MA</b>}</div>
                    <div className="intro-asset-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseIntroImage(event.target.files?.[0], "intro_logo")} /></label><button type="button" onClick={() => { setIntroLogoCropSource(introSettings.intro_logo); setIntroLogoCropOpen(true); }} disabled={!introSettings.intro_logo}>重新裁切</button><button type="button" onClick={() => requestDeletion("删除网站 Logo？", "确认后会清除当前自定义 Logo；保存首页开场后将无法恢复，只能重新上传。", () => setIntroSetting("intro_logo", ""))}>删除</button><button type="button" onClick={() => setIntroSetting("intro_logo", "")}>恢复默认</button></div>
                    <small>支持 JPG、PNG、WebP。上传后使用强制圆形取景框裁切；SVG 上传为安全原因保持关闭。</small>
                  </div>
                  <div className="intro-asset-card is-background" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void chooseIntroImage(file, "intro_background_desktop_image"); }}>
                    <span>电脑端开屏背景 · 建议 16:9</span>
                    <div className="intro-background-preview">{introSettings.intro_background_desktop_image ? <img src={introSettings.intro_background_desktop_image} alt="电脑端开场背景" /> : <b>使用明亮渐变背景</b>}</div>
                    <div className="intro-asset-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseIntroImage(event.target.files?.[0], "intro_background_desktop_image")} /></label><button type="button" onClick={() => setIntroCropOpen(true)} disabled={!introSettings.intro_background_desktop_image}>裁切画面</button><button type="button" onClick={() => requestDeletion("删除电脑端开屏背景？", "确认后会清除当前电脑端背景；保存首页开场后将无法恢复，只能重新上传。", () => setSettings((current) => ({ ...current, intro_background_desktop_image: "", intro_background_image: "" })))}>删除</button><button type="button" onClick={() => setSettings((current) => ({ ...current, intro_background_desktop_image: "/assets/demo-intro.svg", intro_background_image: "/assets/demo-intro.svg" }))}>恢复默认</button></div>
                    <small>电脑访问时优先使用。上传后默认按 16:9 裁切，也可在裁切窗口解除比例锁定。</small>
                  </div>
                  <div className="intro-asset-card is-background is-mobile-background" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void chooseIntroImage(file, "intro_background_mobile_image"); }}>
                    <span>手机端开屏背景 · 建议 9:16</span>
                    <div className="intro-background-preview">{introSettings.intro_background_mobile_image ? <img src={introSettings.intro_background_mobile_image} alt="手机端开场背景" /> : <b>未设置时使用电脑端背景</b>}</div>
                    <div className="intro-asset-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseIntroImage(event.target.files?.[0], "intro_background_mobile_image")} /></label><button type="button" onClick={() => setIntroCropOpen(true)} disabled={!introSettings.intro_background_mobile_image}>裁切画面</button><button type="button" onClick={() => setIntroSetting("intro_background_mobile_image", "")}>使用电脑背景</button><button type="button" onClick={() => setIntroSetting("intro_background_mobile_image", "/assets/demo-intro.svg")}>恢复默认</button></div>
                    <small>手机访问时优先使用；不单独设置时自动沿用电脑端背景，不会出现空白。</small>
                  </div>
                </div>
                <label>首页主题名称 / 网站主标题<input maxLength={80} value={introSettings.intro_title} onChange={(event) => setIntroSetting("intro_title", event.target.value)} /></label>
                <label>英文 / 拼音副标题<input maxLength={120} value={introSettings.intro_subtitle} onChange={(event) => setIntroSetting("intro_subtitle", event.target.value.toUpperCase())} /></label>
              </section>
              </details>

              <details className="admin-settings-accordion intro-settings-accordion"><summary><span className="intro-accordion-copy"><strong>画面效果</strong><small>磨砂、亮度、蒙层与水印可见度</small></span></summary>
              <section className="intro-settings-section intro-visual-settings">
                <div><h3>画面效果</h3><p>保持默认值即可获得当前效果；滑动后右侧预览会立即变化。</p></div>
                <div className="intro-visual-controls">
                  <label>背景磨砂 <output>{introSettings.intro_background_blur}px</output><input type="range" min="0" max="20" step="1" value={introSettings.intro_background_blur} onChange={(event) => setIntroSetting("intro_background_blur", event.target.value)} /></label>
                  <label>背景亮度 <output>{introSettings.intro_background_brightness}%</output><input type="range" min="70" max="125" step="1" value={introSettings.intro_background_brightness} onChange={(event) => setIntroSetting("intro_background_brightness", event.target.value)} /></label>
                  <label>清新蒙层 <output>{introSettings.intro_background_overlay}%</output><input type="range" min="0" max="100" step="1" value={introSettings.intro_background_overlay} onChange={(event) => setIntroSetting("intro_background_overlay", event.target.value)} /></label>
                  <label>水印可见度 <output>{introSettings.intro_watermark_opacity}%</output><input type="range" min="0" max="30" step="1" value={introSettings.intro_watermark_opacity} onChange={(event) => setIntroSetting("intro_watermark_opacity", event.target.value)} /></label>
                </div>
              </section>
              </details>

              <details className="admin-settings-accordion intro-settings-accordion"><summary><span className="intro-accordion-copy"><strong>背景水印</strong><small>编辑两处背景文字</small></span></summary>
              <section className="intro-settings-section">
                <h3>背景水印</h3>
                <div className="intro-two-fields"><label>水印文字 1<input maxLength={32} value={introSettings.intro_watermark_1} onChange={(event) => setIntroSetting("intro_watermark_1", event.target.value.toUpperCase())} /></label><label>水印文字 2<input maxLength={32} value={introSettings.intro_watermark_2} onChange={(event) => setIntroSetting("intro_watermark_2", event.target.value.toUpperCase())} /></label></div>
              </section>
              </details>

              <details className="admin-settings-accordion intro-settings-accordion"><summary><span className="intro-accordion-copy"><strong>路线节点</strong><small>{introNodes.length} 个节点，调整名称与顺序</small></span></summary>
              <section className="intro-settings-section intro-node-settings">
                <div className="intro-node-heading"><div><h3>路线节点</h3><p>拖动左侧手柄或使用上下按钮调整顺序。前台会根据节点数量自动沿 SVG 路线重新分配位置。</p></div><div className="intro-node-heading-actions"><button type="button" className="secondary" onClick={restoreDefaultIntroNodes}>恢复默认四站</button><button type="button" onClick={addIntroNode}>＋ 新增节点</button></div></div>
                <div className="intro-node-list">
                  {introNodes.map((node, index) => (
                    <fieldset key={node.id ?? index} draggable onDragStart={() => setDraggedIntroNode(node.id ?? index)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropIntroNode(node.id ?? index)}>
                      <legend><span aria-hidden="true">☰</span> 第 {index + 1} 站</legend>
                      <label>中文名称<input maxLength={24} value={node.title} onChange={(event) => updateIntroNode(node.id, "title", event.target.value)} /></label>
                      <label>英文 / 拼音<input maxLength={40} value={node.subtitle} onChange={(event) => updateIntroNode(node.id, "subtitle", event.target.value.toUpperCase())} /></label>
                      <label className="intro-node-enabled"><input type="checkbox" checked={Number(node.enabled) === 1} onChange={(event) => updateIntroNode(node.id, "enabled", event.target.checked ? 1 : 0)} /><span>启用</span></label>
                      <div className="intro-node-actions"><button type="button" disabled={index === 0} onClick={() => moveIntroNode(index, -1)}>上移</button><button type="button" disabled={index === introNodes.length - 1} onClick={() => moveIntroNode(index, 1)}>下移</button><button type="button" onClick={() => requestDeletion(`删除“${node.title || `第 ${index + 1} 站`}”节点？`, "确认后会从当前路线中移除；保存首页开场后将无法恢复。", () => setIntroNodes((items) => normalizeIntroNodeOrder(items.filter((_, itemIndex) => itemIndex !== index))))}>删除</button></div>
                    </fieldset>
                  ))}
                  {introNodes.length === 0 && <div className="intro-node-empty">当前没有路线节点。可以保留空路线，也可以新增一个节点。</div>}
                </div>
              </section>
              </details>

              <details className="admin-settings-accordion intro-settings-accordion"><summary><span className="intro-accordion-copy"><strong>开场动画</strong><small>时长与跳过按钮</small></span></summary>
              <section className="intro-settings-section intro-animation-settings">
                <h3>开场动画</h3>
                <label>Loading 持续时间（秒）<input type="number" min="3" max="10" step="0.5" value={Number(introSettings.intro_loading_duration) / 1000} onChange={(event) => setIntroSetting("intro_loading_duration", String(Math.round(Number(event.target.value || 6) * 1000)))} /></label>
                <label className="intro-inline-toggle"><input type="checkbox" checked={introSettings.intro_show_enter_button === "1"} onChange={(event) => setIntroSetting("intro_show_enter_button", event.target.checked ? "1" : "0")} /><span>显示“进入首页”跳过按钮</span></label>
              </section>
              </details>

              <div className="intro-save-actions"><button type="button" className="secondary" onClick={() => setIntroPreviewKey((value) => value + 1)}>重新播放预览</button><a href="/" target="_blank" rel="noreferrer">打开前台查看</a></div>
            </form>
            <aside className="intro-admin-preview">
              <header><div><strong>实时预览</strong><span>内容编辑后会立即更新</span></div><div className="intro-preview-actions"><button type="button" onClick={() => setIntroPreviewKey((value) => value + 1)}>重播</button><button type="button" onClick={() => setIntroPreviewOpen(true)}>放大</button></div></header>
              <LandingIntro key={introPreviewKey} preview settings={introSettings} nodes={introNodes} />
            </aside>
          </div>
        ) : tab === "pet" ? (
          <Suspense fallback={<div className="admin-empty">正在加载桌宠设置…</div>}><PetSettingsPanel token={token} /></Suspense>
        ) : ["settings", "music", "images", "media", "river", "campus", "timeline", "notes", "about", "messages"].includes(tab) ? (
          <div className={`settings-grid settings-grid-single${tab === "images" ? " images-admin-grid" : ""}`}>
            <form id="admin-site-settings-form" ref={siteSettingsFormRef} className="settings-form" onSubmit={tab === "music" ? saveMusicSettings : saveSettings}>
              {!isMediaSectionTab(tab) && <div className="settings-save-bar">
                <div><strong>{adminTabTitles[tab]}</strong><span>{tab === "music" ? "独立保存歌单、音量和默认播放状态" : currentCard ? `当前展示 ${visibleCardCount} / 7 张卡片，至少保留 4 张` : "只显示本栏目相关的编辑项；保存后立即应用到网站"}</span></div>
                <div className="settings-save-actions">{currentCard && <label className="admin-card-visibility"><input type="checkbox" checked={cardVisibility[currentCard]} disabled={cardVisibility[currentCard] && visibleCardCount <= 4} onChange={(event) => setCardVisible(currentCard, event.target.checked)} /><span>首页显示此卡片{visibleCardCount <= 4 ? " · 至少保留4张" : ""}</span></label>}{tab === "images" && <button type="button" className="images-preview-open" onClick={() => setHomePreviewOpen(true)} aria-haspopup="dialog">实时预览</button>}<button type="submit" disabled={loading}>{loading && saveDialog?.phase === "saving" ? "正在保存" : tab === "music" ? "保存音乐设置" : "保存全部设置"}</button></div>
              </div>}
              {tab === "images" && <section className="content-overview-order" aria-labelledby="content-overview-order-title">
                <div className="content-overview-order-heading"><div><p>HOMEPAGE CARDS</p><h2 id="content-overview-order-title">首页卡片排放顺序</h2><span>只为展示中的卡片分配位置；隐藏后其余卡片依次前移，重新展示时加入末尾。</span></div><small>当前展示 {visibleCardCount} / 7 张</small></div>
                <ol className="content-overview-order-list">{cardOrder.map((key, index) => {
                  const definition = homeVisualCardDefinitions.find((card) => card.key === key);
                  const preview = normalizeHomeVisualAsset(settings[key], definition?.fallback || "");
                  return <li key={key} className={cardVisibility[key] ? "" : "is-hidden"}>
                    <span className="content-overview-order-number">{cardVisibility[key] ? String(index + 1).padStart(2, "0") : "—"}</span>
                    <span className="content-overview-order-thumb">{preview ? <img src={preview} alt="" /> : <span>无图</span>}</span>
                    <span className="content-overview-order-name"><strong>{definition?.label || key}</strong><small>{cardVisibility[key] ? "首页展示" : "暂时隐藏 · 暂无分配"}</small></span>
                    <label className="content-overview-order-visibility"><input type="checkbox" checked={cardVisibility[key]} disabled={cardVisibility[key] && visibleCardCount <= 4} onChange={(event) => setCardVisible(key, event.target.checked)} />展示</label>
                    <label>位置<select aria-label={`${definition?.label || key}的卡片位置`} value={cardVisibility[key] ? index : "unassigned"} disabled={!cardVisibility[key]} onChange={(event) => moveCardTo(key, Number(event.target.value))}>{cardVisibility[key] ? cardOrder.slice(0, visibleCardCount).map((_, position) => <option key={position} value={position}>第 {position + 1} 张</option>) : <option value="unassigned">暂无分配</option>}</select></label>
                    <div className="content-overview-order-actions"><button type="button" aria-label={`将${definition?.label || key}上移`} disabled={!cardVisibility[key] || index === 0} onClick={() => moveCardTo(key, index - 1)}>↑</button><button type="button" aria-label={`将${definition?.label || key}下移`} disabled={!cardVisibility[key] || index === visibleCardCount - 1} onClick={() => moveCardTo(key, index + 1)}>↓</button></div>
                  </li>;
                })}</ol>
                <p>顺序修改会立即显示在右侧预览中；点击顶部“保存全部设置”后应用到前台。</p>
              </section>}
              {tab === "images" && <div className="admin-story-intro"><div><strong>开场画面的图片</strong><span>首页背景、头像和七个栏目图片在下方管理；开场 Logo 与开场背景在独立的首页开场编辑器中。</span></div><button type="button" onClick={() => selectTab("intro")}>编辑开场图片 →</button></div>}
              {tab === "river" && <div className="admin-story-intro"><div><strong>3D 粒子树场景</strong><span>本栏目的照片在上方管理；场景参数在下方调整。</span></div></div>}
              {tab === "messages" && <div className="admin-story-intro"><div><strong>留言与投稿</strong><span>留言操场的标题在下方编辑；访客留言和投稿统一进入信箱。</span></div><button type="button" onClick={() => selectTab("inbox")}>查看信箱 →</button></div>}
              {(tab === "settings" || tab === "about") && <details className="admin-settings-accordion" open={tab === "about"}><summary>网站文字与联系方式<span>网站名称、预留联系信息与自定义链接</span></summary>
              <h2>网站文字</h2>
              <label>网站名称<input value={settings.site_title} onChange={(event) => setSettings({ ...settings, site_title: event.target.value })} /></label>
              {tab === "settings" && <div className="footer-copy-settings"><h3>首页底部文字</h3><label>主文字<input maxLength={64} value={settings.footer_title ?? ""} onChange={(event) => setSettings((current) => ({ ...current, footer_title: event.target.value }))} placeholder="我的记忆档案" /></label><label>补充小字（可选）<textarea maxLength={160} rows={2} value={settings.footer_subtitle ?? ""} onChange={(event) => setSettings((current) => ({ ...current, footer_subtitle: event.target.value }))} placeholder="留空则首页不显示小字" /></label><small>保存后应用到首页底部；其他页面的底部也会使用相同文字。</small></div>}
              <div className="contact-link-settings"><label>邮箱联系<input type="email" placeholder="留空即不显示" value={settings.contact_email} onChange={(event) => setSettings((current) => ({ ...current, contact_email: event.target.value }))} /></label><label>GitHub 链接<input type="url" placeholder="留空即不显示" value={settings.github_url} onChange={(event) => setSettings((current) => ({ ...current, github_url: event.target.value }))} /></label><label>抖音链接<input type="url" placeholder="留空即不显示" value={settings.contact_douyin_url} onChange={(event) => setSettings((current) => ({ ...current, contact_douyin_url: event.target.value }))} /></label><small>左侧“联系”按钮会弹出所有已填写的联系方式；留空的项目不会显示。</small></div>
              <section className="contact-custom-settings" aria-labelledby="contact-custom-title"><div className="contact-custom-heading"><div><h3 id="contact-custom-title">添加更多联系方式</h3><p>可选择常用平台，也可自定义名称。保存后会显示在左侧“联系”和关于我们页面。</p></div><small>{customContactLinks.length} / 12</small></div>
                <div className="contact-custom-presets">{["哔哩哔哩", "YouTube", "TikTok"].map((label) => <button key={label} type="button" onClick={() => addCustomContactLink(label)}>＋ {label}</button>)}<button type="button" onClick={() => addCustomContactLink("")}>＋ 自定义链接</button></div>
                {customContactLinks.length > 0 && <div className="contact-custom-list">{customContactLinks.map((link, index) => <div className="contact-custom-row" key={index}><label>显示名称<input maxLength={32} placeholder="例如：小红书" value={link.label} onChange={(event) => changeCustomContactLinks((links) => links.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></label><label>HTTPS 链接<input type="url" placeholder="https://" value={link.url} onChange={(event) => changeCustomContactLinks((links) => links.map((item, position) => position === index ? { ...item, url: event.target.value } : item))} /></label><button type="button" aria-label={`删除第 ${index + 1} 个联系方式`} onClick={() => changeCustomContactLinks((links) => links.filter((_, position) => position !== index))}>删除</button></div>)}</div>}
              </section>
              </details>}
              {tab === "music" && <section className="music-settings" aria-labelledby="music-settings-title">
                <div className="music-settings-heading">
                  <div><p>SITE MUSIC PLAYER</p><h2 id="music-settings-title">歌单与播放设置</h2><span>前台右上角会显示上一首、播放/暂停和下一首。</span></div>
                  <div className="music-settings-heading-actions">
                    <label className="music-upload-button">＋ 添加歌曲<input type="file" accept="audio/mpeg,.mp3" onChange={(event) => { void chooseMusicTrack(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                  </div>
                </div>
                <fieldset className="music-autoplay-setting"><legend>进入网站时的播放状态</legend><label><input type="radio" name="music-default-on" checked={settings.music_default_on === "1"} onChange={() => setSettings((current) => ({ ...current, music_default_on: "1" }))} />默认播放</label><label><input type="radio" name="music-default-on" checked={settings.music_default_on !== "1"} onChange={() => setSettings((current) => ({ ...current, music_default_on: "0" }))} />默认暂停</label><small>浏览器可能拦截有声自动播放；如被拦截，访客首次点击页面后会再次尝试。</small></fieldset>
                <label className="music-volume-control"><span>默认音量</span><input type="range" min="0" max="100" step="1" value={normalizeMusicVolume(settings.music_default_volume)} onChange={(event) => setSettings((current) => ({ ...current, music_default_volume: event.target.value }))} /><output>{normalizeMusicVolume(settings.music_default_volume)}%</output><small>默认播放和访客手动播放都会使用这个初始音量。</small></label>
                <div className="music-playlist" aria-label={`当前歌单，共 ${musicPlaylist.length} 首`}>
                  {musicPlaylist.length ? musicPlaylist.map((track, index) => <article className="music-track-editor" key={track.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <label>歌曲名称<input maxLength={80} value={track.name} onChange={(event) => updateMusicTrack(index, { name: event.target.value })} /></label>
                    {/* These files are music-only previews without spoken caption content. */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio src={track.url} controls preload="metadata" />
                    <div className="music-track-actions"><button type="button" disabled={index === 0} onClick={() => moveMusicTrack(index, -1)}>上移</button><button type="button" disabled={index === musicPlaylist.length - 1} onClick={() => moveMusicTrack(index, 1)}>下移</button><label>更换 MP3<input type="file" accept="audio/mpeg,.mp3" onChange={(event) => { void chooseMusicTrack(event.target.files?.[0], index); event.currentTarget.value = ""; }} /></label><button type="button" className="danger" onClick={() => requestDeletion(`移除“${track.name || `歌曲 ${index + 1}`}”？`, "保存全部设置后，这首歌曲将不再出现在前台歌单中。服务器中的原文件不会立即删除。", () => setMusicPlaylist(musicPlaylist.filter((_, trackIndex) => trackIndex !== index)), "确认移除")}>移除</button></div>
                  </article>) : <div className="music-playlist-empty"><strong>还没有歌曲</strong><span>点击“添加歌曲”上传第一首 MP3；未添加歌曲时，前台播放器会显示为不可用。</span></div>}
                </div>
                <p className="music-settings-note">当前 {musicPlaylist.length} / 20 首；单首最大 12MB。歌曲数量由这里的歌单条目自动决定。</p>
              </section>}
              {tab === "images" && <details className="admin-settings-accordion" open><summary>首页背景与栏目图片<span>侧栏头像、色调、首页大图和各栏目取景</span></summary>
              <section className="home-visual-settings" aria-labelledby="home-visual-title">
                <div className="home-visual-heading">
                  <div><p>HOMEPAGE VISUAL SYSTEM</p><h2 id="home-visual-title">首页背景与栏目图片</h2></div>
                  <span>侧栏头像与图片可分别更换；头像按圆形居中显示。</span>
                </div>
                <article className="home-visual-asset is-profile-avatar">
                  <div className="home-visual-preview"><img src={normalizeHomeVisualAsset(settings.home_profile_avatar, "/assets/demo-intro.svg") || "/assets/demo-intro.svg"} alt="侧栏圆形头像预览" /></div>
                  <div><strong>侧栏圆形头像</strong><p>上传后用圆形选框选择人物或画面重点，确认取景后再保存网站设置。</p><div className="home-visual-actions"><label>上传并裁切<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseHomeVisualImage(event.target.files?.[0], "home_profile_avatar"); event.currentTarget.value = ""; }} /></label><button type="button" onClick={() => setSettings((current) => ({ ...current, home_profile_avatar: "" }))}>恢复默认头像</button></div></div>
                </article>
                <fieldset className="home-tone-fieldset">
                  <legend>首页边框主题</legend>
                  <div className="home-tone-grid">
                    {homeBackgroundToneOptions.map((option) => { const active = settings.home_background_tone === option.value && settings.home_background_color?.toLowerCase() === option.background && settings.home_accent_color?.toLowerCase() === option.accent; return <button type="button" key={option.value} className={active ? "active" : ""} aria-pressed={active} style={{ "--tone-bg": option.background, "--tone-accent": option.accent } as CSSProperties} onClick={() => applyHomeBackgroundTone(option.value, option.background, option.accent)}><i aria-hidden="true" /><strong>{option.label}</strong><span>{option.description}</span></button>; })}
                  </div>
                </fieldset>
                <div className="home-color-grid">
                  <label>边框与侧栏基础色<input type="color" value={settings.home_background_color} onChange={(event) => setSettings((current) => ({ ...current, home_background_color: event.target.value }))} /><small>{settings.home_background_color}</small></label>
                  <label>强调光色<input type="color" value={settings.home_accent_color} onChange={(event) => setSettings((current) => ({ ...current, home_accent_color: event.target.value, home_background_tone: "archive" }))} /><small>{settings.home_accent_color}</small></label>
                  <label className="home-opacity-control"><span>色调覆盖透明度</span><input type="range" min="0" max="80" step="1" value={normalizeHomeBackgroundOverlayOpacity(settings.home_background_overlay_opacity)} onChange={(event) => setSettings((current) => ({ ...current, home_background_overlay_opacity: event.target.value }))} /><small>{normalizeHomeBackgroundOverlayOpacity(settings.home_background_overlay_opacity)}% · 0% 保留原图</small></label>
                  <label className="home-opacity-control"><span>背景磨砂程度</span><input type="range" min="0" max="30" step="1" value={normalizeHomeBackgroundBlur(settings.home_background_blur)} onChange={(event) => setSettings((current) => ({ ...current, home_background_blur: event.target.value }))} /><small>{normalizeHomeBackgroundBlur(settings.home_background_blur)}px · 越高背景越柔和</small></label>
                </div>
                <article className="home-visual-asset is-page-background">
                  <div className="home-visual-preview">{normalizeHomeVisualAsset(settings.home_background_url, "/assets/demo-5.svg") ? <img src={normalizeHomeVisualAsset(settings.home_background_url, "/assets/demo-5.svg")} alt="首页背景预览" /> : <span>纯色背景</span>}</div>
                  <div><strong>首页背景图片</strong><p>使用 JPG、PNG 或 WebP。前台固定使用 center / cover；没有单独裁切数据，任何比例都从图片中间取景。</p><div className="home-visual-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseHomeVisualImage(event.target.files?.[0], "home_background_url")} /></label><button type="button" onClick={() => setSettings((current) => ({ ...current, home_background_url: "none" }))}>只用色调</button><button type="button" onClick={() => setSettings((current) => ({ ...current, home_background_url: "" }))}>恢复默认图片</button></div></div>
                </article>
                <article className="home-visual-asset is-page-background">
                  <div className="home-visual-preview">{normalizeHomeVisualAsset(settings.home_hero_image, "/assets/demo-5.svg") ? <img src={normalizeHomeVisualAsset(settings.home_hero_image, "/assets/demo-5.svg")} alt="首页主视觉预览" /> : <span>跟随首篇内容图片</span>}</div>
                  <div><strong>首页主视觉图片</strong><p>单独控制首页最中间的大图。上传后会立即进入 16:9 裁切，不会修改文章图片。</p><div className="home-visual-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseHomeVisualImage(event.target.files?.[0], "home_hero_image")} /></label>{normalizeHomeVisualAsset(settings.home_hero_image, "/assets/demo-5.svg") && <button type="button" onClick={() => setCardCropField("home_hero_image")}>裁切图片</button>}<button type="button" onClick={() => setSettings((current) => ({ ...current, home_hero_image: "none" }))}>跟随首篇</button><button type="button" onClick={() => setSettings((current) => ({ ...current, home_hero_image: "" }))}>恢复默认</button></div><div className="hero-caption-copy-grid"><label>图片右下角小标题<input maxLength={80} value={settings.home_hero_caption_kicker} onChange={(event) => setSettings((current) => ({ ...current, home_hero_caption_kicker: event.target.value.toUpperCase() }))} placeholder="例如 CAMPUS · FRIENDS · SUNSET" /></label><label>图片右下角说明<input maxLength={100} value={settings.home_hero_caption_title} onChange={(event) => setSettings((current) => ({ ...current, home_hero_caption_title: event.target.value }))} placeholder="留空时跟随当前首篇内容标题" /></label></div></div>
                </article>
                <fieldset className="home-tone-fieldset home-card-tone-fieldset">
                  <legend>栏目选框色调与透明度</legend>
                  <div className="home-tone-grid">
                    {homeCardToneOptions.map((option) => <button type="button" key={option.value} className={normalizeHomeCardTone(settings.home_card_tone) === option.value ? "active" : ""} aria-pressed={normalizeHomeCardTone(settings.home_card_tone) === option.value} style={{ "--tone-bg": option.color, "--tone-accent": settings.home_accent_color } as CSSProperties} onClick={() => setSettings((current) => ({ ...current, home_card_tone: option.value, home_card_tone_color: option.color }))}><i aria-hidden="true" /><strong>{option.label}</strong><span>{option.description}</span></button>)}
                  </div>
                  <div className="home-color-grid home-card-tone-controls">
                    <label>选框自定义色<input type="color" value={settings.home_card_tone_color} onChange={(event) => setSettings((current) => ({ ...current, home_card_tone_color: event.target.value }))} /><small>{settings.home_card_tone_color}</small></label>
                    <label className="home-opacity-control"><span>选框与外层玻璃不透明度</span><input type="range" min="0" max="90" step="1" value={normalizeHomeCardOpacity(settings.home_card_surface_opacity, 62)} onChange={(event) => setSettings((current) => ({ ...current, home_card_surface_opacity: event.target.value }))} /><small>{normalizeHomeCardOpacity(settings.home_card_surface_opacity, 62)}% · 越低越能看到网站背景</small></label>
                    <label className="home-opacity-control"><span>图片文字遮罩不透明度</span><input type="range" min="0" max="90" step="1" value={normalizeHomeCardOpacity(settings.home_card_image_overlay_opacity, 42)} onChange={(event) => setSettings((current) => ({ ...current, home_card_image_overlay_opacity: event.target.value }))} /><small>{normalizeHomeCardOpacity(settings.home_card_image_overlay_opacity, 42)}% · 越低图片越清晰</small></label>
                  </div>
                </fieldset>
                <div className="home-card-visual-grid">
                  <fieldset className="home-card-aspect-control"><legend>首页栏目图片建议比例</legend><div className="home-card-aspect-options">{homeCardAspectRatioOptions.map((option) => <label key={option.value}><input type="radio" name="home-card-aspect" checked={normalizeHomeCardAspectRatio(settings.home_card_aspect_ratio) === option.value} onChange={() => setSettings((current) => ({ ...current, home_card_aspect_ratio: option.value }))} />{option.label}</label>)}</div><p>比例是布局目标，不会把原图永久裁成固定尺寸；窗口变化时卡片可以弹性调整。</p></fieldset>
                  {homeVisualCardDefinitions.map((card) => {
                    const preview = normalizeHomeVisualAsset(settings[card.key], card.fallback);
                    const crop = cardCrops[card.key];
                    const focus = crop ? `${crop.left + crop.width / 2}% ${crop.top + crop.height / 2}%` : "center";
                    return <article className="home-visual-asset" key={card.key}><div className="home-visual-preview" style={{ aspectRatio: cardAspectFor(card.key) }}>{preview ? <img src={preview} alt={`${card.label}卡片图片预览`} style={{ objectPosition: focus }} /> : <span>纯玻璃卡片</span>}</div><div><strong>{card.label}</strong><label className="home-card-ratio-select">建议比例<select value={cardAspects[card.key] || normalizeHomeCardAspectRatio(settings.home_card_aspect_ratio)} onChange={(event) => updateCardAspect(card.key, event.target.value as HomeCardAspectRatio)}>{homeCardAspectRatioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p>保留原比例图片；取景区域只作为前台自适应展示的参考。</p><div className="home-visual-actions"><label>上传原比例图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseHomeVisualImage(event.target.files?.[0], card.key)} /></label>{preview && <button type="button" onClick={() => setCardCropField(card.key)}>选择展示区域</button>}{crop && <button type="button" onClick={() => updateCardCrop(card.key)}>重置取景</button>}<button type="button" onClick={() => setSettings((current) => ({ ...current, [card.key]: "none" }))}>不显示图片</button><button type="button" onClick={() => setSettings((current) => ({ ...current, [card.key]: "" }))}>恢复默认</button></div></div></article>;
                  })}
                </div>
              </section>
              </details>}
              {tab === "settings" && <details className="admin-settings-accordion"><summary>首页首屏艺术与动效<span>按钮文字、视觉风格和动效强度</span></summary>
              <section className="hero-style-settings" aria-labelledby="hero-style-title">
                <div className="hero-style-heading">
                  <div><p>HOMEPAGE ART DIRECTION</p><h2 id="hero-style-title">首页首屏艺术与动效</h2></div>
                  <span>照片内容、标题和顺序在对应的故事集、校园碎片或 3D 粒子树栏目编辑。</span>
                </div>
                <div className="hero-button-copy-grid">
                  <label>主按钮文字<input maxLength={32} value={settings.hero_primary_button} onChange={(event) => setSettings((current) => ({ ...current, hero_primary_button: event.target.value }))} /></label>
                  <label>3D 入口文字<input maxLength={32} value={visibleHeroSecondaryButton(settings.hero_secondary_button)} onChange={(event) => setSettings((current) => ({ ...current, hero_secondary_button: event.target.value }))} /></label>
                </div>
                <fieldset className="hero-style-fieldset">
                  <legend>视觉风格</legend>
                  <div className="hero-style-option-grid">
                    {heroArtStyleOptions.map((option) => <button type="button" key={option.value} className={normalizeHeroArtStyle(settings.hero_art_style) === option.value ? `active style-${option.value}` : `style-${option.value}`} aria-pressed={normalizeHeroArtStyle(settings.hero_art_style) === option.value} onClick={() => setSettings((current) => ({ ...current, hero_art_style: option.value }))}><i aria-hidden="true" /><strong>{option.label}</strong><span>{option.description}</span></button>)}
                  </div>
                </fieldset>
                <fieldset className="hero-style-fieldset">
                  <legend>动效强度</legend>
                  <div className="hero-motion-option-grid">
                    {heroMotionLevelOptions.map((option) => <button type="button" key={option.value} className={normalizeHeroMotionLevel(settings.hero_motion_level) === option.value ? "active" : ""} aria-pressed={normalizeHeroMotionLevel(settings.hero_motion_level) === option.value} onClick={() => setSettings((current) => ({ ...current, hero_motion_level: option.value }))}><strong>{option.label}</strong><span>{option.description}</span></button>)}
                  </div>
                </fieldset>
                <label className="hero-caption-toggle"><input type="checkbox" aria-label="显示编辑感标注" checked={settings.hero_show_captions !== "0"} onChange={(event) => setSettings((current) => ({ ...current, hero_show_captions: event.target.checked ? "1" : "0" }))} /><span><strong>显示编辑感标注</strong><small>展示期号、照片标题和精选记忆信息；关闭后保留纯照片拼贴。</small></span></label>
              </section>
              </details>}
              {tab === "about" && <details className="admin-settings-accordion" open><summary>关于我们页面图片<span>独立设置页面主体相框中的图片</span></summary>
                <section className="home-copy-settings about-page-image-settings"><h2>关于我们图片</h2><p>此图片只用于“关于我们”页面主体相框，不影响首页“关于我们”卡片。留空时继续使用当前内容照片。</p>
                  <div className="home-visual-asset"><div className="home-visual-preview">{normalizeHomeVisualAsset(settings.about_page_image) ? <img src={normalizeHomeVisualAsset(settings.about_page_image)} alt="关于我们页面图片预览" /> : <span>使用当前内容照片</span>}</div><div><strong>页面主体图片</strong><div className="home-visual-actions"><label>上传或更换<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseHomeVisualImage(event.target.files?.[0], "about_page_image"); event.currentTarget.value = ""; }} /></label><button type="button" onClick={() => setSettings((current) => ({ ...current, about_page_image: "" }))}>恢复内容照片</button></div></div></div>
                </section>
              </details>}
              {tab !== "images" && tab !== "notes" && tab !== "music" && <details className="admin-settings-accordion" open={tab !== "settings"}><summary>{tab === "settings" ? "首页首屏标题与文案" : `${adminTabTitles[tab]}标题与文案`}<span>编辑该区域的文字与字号</span></summary>
              <section className="home-copy-settings" aria-labelledby="home-copy-title">
                <div className="home-copy-heading">
                  <div><h2 id="home-copy-title">首页标题与文案</h2><p>每个区域单独编辑、启用补充文字或恢复默认。字号和字重只影响对应的大标题。</p></div>
                  <span>{tab === "settings" ? "首屏" : adminTabTitles[tab]}</span>
                </div>
                <div className="home-copy-grid">
                  {homeCopySectionDefinitions.filter((section) => tab === "settings" ? section.id === "hero" : tab === "media" ? section.id === "stories" : tab === "river" ? section.id === "portal" : tab === "campus" ? section.id === "campus" : tab === "timeline" ? section.id === "timeline" : tab === "about" ? section.id === "about" : tab === "messages" ? section.id === "comments" : false).map((section, index) => {
                    const key = (field: Parameters<typeof homeCopyKey>[1]) => homeCopyKey(section.id, field);
                    return (
                      <fieldset className="home-copy-card" key={section.id}>
                        <legend><span>{String(index + 1).padStart(2, "0")}</span>{section.label}</legend>
                        <div className="home-copy-card-head"><small>{section.location}</small><button type="button" onClick={() => resetHomeCopySection(section.id)}>恢复此标题默认</button></div>
                        <label>小英文 / 栏目眉题<input maxLength={80} value={settings[key("kicker")]} onChange={(event) => setSettings((current) => ({ ...current, [key("kicker")]: event.target.value.toUpperCase() }))} /></label>
                        <div className="home-copy-two-fields">
                          <label>大标题<input maxLength={100} value={settings[key("title")]} onChange={(event) => setSettings((current) => ({ ...current, [key("title")]: event.target.value }))} /></label>
                          <label>强调标题<input maxLength={100} value={settings[key("accent")]} onChange={(event) => setSettings((current) => ({ ...current, [key("accent")]: event.target.value }))} /></label>
                        </div>
                        <label>副标题 / 说明<textarea maxLength={500} value={settings[key("subtitle")]} onChange={(event) => setSettings((current) => ({ ...current, [key("subtitle")]: event.target.value }))} /></label>
                        <div className="home-copy-two-fields is-selects">
                          <label>大标题大小<select value={settings[key("title_size")]} onChange={(event) => setSettings((current) => ({ ...current, [key("title_size")]: event.target.value }))}>{homeCopySizeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                          <label>大标题粗细<select value={settings[key("title_weight")]} onChange={(event) => setSettings((current) => ({ ...current, [key("title_weight")]: event.target.value }))}>{homeCopyWeightOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                        </div>
                        <div className="home-copy-extra">
                          <label className="home-copy-extra-toggle"><input type="checkbox" checked={settings[key("extra_enabled")] === "1"} onChange={(event) => setSettings((current) => ({ ...current, [key("extra_enabled")]: event.target.checked ? "1" : "0" }))} /><span>启用一处补充文字</span></label>
                          <label>补充文字<input maxLength={180} disabled={settings[key("extra_enabled")] !== "1"} value={settings[key("extra_text")]} onChange={(event) => setSettings((current) => ({ ...current, [key("extra_text")]: event.target.value }))} placeholder="可选；关闭后前台不会显示" /></label>
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </section>
              </details>}
              {tab === "settings" && <details className="admin-settings-accordion"><summary>前台显示尺寸<span>文字和图片的显示比例</span></summary>
              <section className="display-size-settings" aria-labelledby="display-size-title">
                <div className="display-size-heading">
                  <div><h2 id="display-size-title">前台显示尺寸</h2><p>分别控制网站文字和主要图片、图形的大小。标准档为普通网站默认尺寸，不会改变页面比例判断。</p></div>
                  <button type="button" className="display-size-reset" onClick={() => setDisplayPreset("100")}>恢复标准</button>
                </div>
                <div className="display-size-presets" aria-label="显示尺寸快捷预设">
                  {displaySizePresets.map((preset) => {
                    const active = settings.display_font_scale === preset.value && settings.display_media_scale === preset.value;
                    return <button type="button" key={preset.value} className={active ? "active" : ""} aria-pressed={active} title={preset.description} onClick={() => setDisplayPreset(preset.value)}>{preset.label}</button>;
                  })}
                </div>
                <div className="display-size-fields">
                  <label>文字大小
                    <select value={normalizeDisplayScale(settings.display_font_scale)} onChange={(event) => setSettings({ ...settings, display_font_scale: normalizeDisplayScale(event.target.value) })}>
                      {displaySizePresets.map((preset) => <option value={preset.value} key={preset.value}>{preset.label} · {preset.value}%</option>)}
                    </select>
                    <small>标题、正文、导航和按钮文字</small>
                  </label>
                  <label>图片与图形大小
                    <select value={normalizeDisplayScale(settings.display_media_scale)} onChange={(event) => setSettings({ ...settings, display_media_scale: normalizeDisplayScale(event.target.value) })}>
                      {displaySizePresets.map((preset) => <option value={preset.value} key={preset.value}>{preset.label} · {preset.value}%</option>)}
                    </select>
                    <small>开场 Logo、首页相框和主要图片</small>
                  </label>
                </div>
                <div className="display-size-example" aria-hidden="true">
                  <span style={{ fontSize: `${14 * Number(normalizeDisplayScale(settings.display_font_scale)) / 100}px` }}>显示效果预览</span>
                  <i style={{ width: `${58 * Number(normalizeDisplayScale(settings.display_media_scale)) / 100}px` }} />
                </div>
              </section>
              </details>}
              {tab === "river" && <details className="admin-settings-accordion" open><summary>3D 粒子树场景<span>氛围预设、密度、亮度和图片分布</span></summary>
              <section className="galaxy-settings" aria-labelledby="galaxy-settings-title">
                <div className="galaxy-settings-heading">
                  <div><h2 id="galaxy-settings-title">3D 粒子树场景</h2><p>选择氛围预设，再按设备性能微调密度与亮度。默认值已优先保证进入流畅。</p></div>
                  <button type="button" onClick={() => setGalaxyPreset("snow-orbit")}>恢复默认雪景</button>
                </div>
                <div className="galaxy-preset-grid" aria-label="3D 场景预设">
                  {galaxyScenePresets.map((preset) => <button type="button" key={preset.value} className={settings.galaxy_scene_preset === preset.value ? "active" : ""} aria-pressed={settings.galaxy_scene_preset === preset.value} onClick={() => setGalaxyPreset(preset.value)}><strong>{preset.label}</strong><span>{preset.description}</span></button>)}
                </div>
                <div className="galaxy-range-grid">
                  <label>粒子树密度 <output>{normalizeGalaxyPercent(settings.galaxy_particle_density, defaultGalaxySettings.galaxy_particle_density)}%</output><input type="range" min="0" max="140" step="5" value={normalizeGalaxyPercent(settings.galaxy_particle_density, defaultGalaxySettings.galaxy_particle_density)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_particle_density: normalizeGalaxyPercent(event.target.value, defaultGalaxySettings.galaxy_particle_density) }))} /><small>越高越细密，也会增加显卡负担。</small></label>
                  <label>雪花 / 星点密度 <output>{normalizeGalaxyPercent(settings.galaxy_snow_density, defaultGalaxySettings.galaxy_snow_density)}%</output><input type="range" min="0" max="140" step="5" value={normalizeGalaxyPercent(settings.galaxy_snow_density, defaultGalaxySettings.galaxy_snow_density)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_snow_density: normalizeGalaxyPercent(event.target.value, defaultGalaxySettings.galaxy_snow_density) }))} /><small>宇宙预设中控制星点，雪景中控制雪花。</small></label>
                  <label>粒子亮度 <output>{normalizeGalaxyPercent(settings.galaxy_particle_brightness, defaultGalaxySettings.galaxy_particle_brightness)}%</output><input type="range" min="40" max="140" step="5" value={normalizeGalaxyPercent(settings.galaxy_particle_brightness, defaultGalaxySettings.galaxy_particle_brightness)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_particle_brightness: normalizeGalaxyPercent(event.target.value, defaultGalaxySettings.galaxy_particle_brightness) }))} /><small>只改变发光强度，不增加粒子数量。</small></label>
                  <label>粒子蔓延时间 <output>{normalizeGalaxyNumber(settings.galaxy_growth_duration, defaultGalaxySettings.galaxy_growth_duration, 1.5, 12, 0.25)} 秒</output><input type="range" min="1.5" max="12" step="0.25" value={normalizeGalaxyNumber(settings.galaxy_growth_duration, defaultGalaxySettings.galaxy_growth_duration, 1.5, 12, 0.25)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_growth_duration: normalizeGalaxyNumber(event.target.value, defaultGalaxySettings.galaxy_growth_duration, 1.5, 12, 0.25) }))} /><small>控制树体向上生长和地面从中心向外扩散的总时长。</small></label>
                  <label>记忆图片大小 <output>{normalizeGalaxyNumber(settings.galaxy_photo_scale, defaultGalaxySettings.galaxy_photo_scale, 35, 130, 5)}%</output><input type="range" min="35" max="130" step="5" value={normalizeGalaxyNumber(settings.galaxy_photo_scale, defaultGalaxySettings.galaxy_photo_scale, 35, 130, 5)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_photo_scale: normalizeGalaxyNumber(event.target.value, defaultGalaxySettings.galaxy_photo_scale, 35, 130, 5) }))} /><small>默认缩小到 70%，悬停时只做轻微放大。</small></label>
                  <label>图片分布范围 <output>{normalizeGalaxyNumber(settings.galaxy_photo_spread, defaultGalaxySettings.galaxy_photo_spread, 70, 180, 5)}%</output><input type="range" min="70" max="180" step="5" value={normalizeGalaxyNumber(settings.galaxy_photo_spread, defaultGalaxySettings.galaxy_photo_spread, 70, 180, 5)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_photo_spread: normalizeGalaxyNumber(event.target.value, defaultGalaxySettings.galaxy_photo_spread, 70, 180, 5) }))} /><small>数值越大，图片越靠近山地和树木外围。</small></label>
                  <label className="galaxy-color-control">图片边框颜色 <output>{normalizeGalaxyColor(settings.galaxy_photo_border_color, defaultGalaxySettings.galaxy_photo_border_color)}</output><input type="color" value={normalizeGalaxyColor(settings.galaxy_photo_border_color, defaultGalaxySettings.galaxy_photo_border_color)} onChange={(event) => setSettings((current) => ({ ...current, galaxy_photo_border_color: normalizeGalaxyColor(event.target.value, defaultGalaxySettings.galaxy_photo_border_color) }))} /><small>默认使用适合黑色背景的深石墨色。</small></label>
                </div>
              </section>
              </details>}
              {tab === "timeline" && <details className="admin-settings-accordion" open><summary>青春时间线<span>{timelineItems.length} 个节点，可新增、删除并编辑时间与文字</span></summary>
              <div className="timeline-settings">
                <h2>青春时间线</h2>
                <p>每个节点对应前台曲线上的一个圆点。可新增、删除、调整顺序，再编辑右侧显示的时间、标题和正文。</p>
                {timelineItems.map((item, index) => (
                  <fieldset key={index}>
                    <legend>第 {index + 1} 个节点</legend>
                    <label>时间<input value={item.date} maxLength={20} onChange={(event) => updateTimelineItem(index, "date", event.target.value)} /></label>
                    <label>标题<input value={item.title} maxLength={80} onChange={(event) => updateTimelineItem(index, "title", event.target.value)} /></label>
                    <label className="timeline-body-field">正文<textarea value={item.text} maxLength={500} onChange={(event) => updateTimelineItem(index, "text", event.target.value)} /></label>
                    <div className="timeline-row-actions"><button type="button" disabled={index === 0} onClick={() => moveTimelineItem(index, -1)}>上移</button><button type="button" disabled={index === timelineItems.length - 1} onClick={() => moveTimelineItem(index, 1)}>下移</button><button type="button" disabled={timelineItems.length === 1} onClick={() => requestDeletion(`删除“${item.title || `第 ${index + 1} 段`}”时间线？`, "确认后会从当前网站设置中移除；保存全部设置后将无法恢复。", () => setTimelineItems((items) => items.filter((_, itemIndex) => itemIndex !== index)))}>删除</button></div>
                  </fieldset>
                ))}
                <button className="timeline-add" type="button" disabled={timelineItems.length >= 8} onClick={() => setTimelineItems([...timelineItems, { date: "", title: "新的青春片段", text: "" }])}>＋ 新增节点</button>
              </div>
              </details>}
              {tab === "notes" && <details className="admin-settings-accordion" open><summary>随手记页面介绍<span>编辑栏目标题和介绍，具体记录在下方添加</span></summary><section className="home-copy-settings"><label>页面标题<input maxLength={100} value={settings.notes_title} onChange={(event) => setSettings((current) => ({ ...current, notes_title: event.target.value }))} /></label><label>栏目介绍<textarea maxLength={2000} value={settings.notes_body} onChange={(event) => setSettings((current) => ({ ...current, notes_body: event.target.value }))} /></label></section></details>}
              {tab === "notes" && <NotesManager token={token} />}
            </form>
            {tab === "images" && <aside className="intro-admin-preview home-visual-preview-panel">
              <header><div><strong>实时预览</strong><span>图片与色调修改后立即更新</span></div><div className="intro-preview-actions"><button type="button" onClick={() => setHomePreviewKey((value) => value + 1)}>重播</button><button type="button" onClick={() => setHomePreviewOpen(true)}>放大</button></div></header>
              <HomeVisualPreview key={homePreviewKey} settings={settings} />
            </aside>}
          </div>
        ) : tab === "account" ? (
          <div className="account-management">
            <form className="settings-form account-settings" onSubmit={changePassword}>
              <div className="account-settings-head"><div><p>ADMINISTRATOR ACCOUNT</p><h2>更改管理员密码</h2></div><span>当前账号<br /><strong>{accountEmailMask || maskAccountEmail(username) || "已登录管理员"}</strong></span></div>
              <p className="account-intro">为了保护后台内容，必须先完成人机验证，再通过管理员邮箱收到的 6 位验证码更改密码。</p>
              <div className="recovery-steps"><span className="active">1 人机验证</span><span className={recoveryCodeSent ? "active" : ""}>2 邮箱验证</span><span className={recoveryCodeSent ? "active" : ""}>3 新密码</span></div>
              {!recoveryCodeSent ? <>
                <TurnstileVerification onVerify={setTurnstileToken} resetSignal={turnstileReset} theme={adminTheme} />
                <button type="button" onClick={sendPasswordCode} disabled={codeLoading || !turnstileToken}>{codeLoading ? "正在发送…" : "发送邮箱验证码"}</button>
              </> : <>
                <label>6 位邮箱验证码<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} placeholder="输入邮箱中的验证码" required /></label>
                <label>新管理员密码<input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 12 位" required /></label>
                <p>验证码 10 分钟内有效。密码修改成功后，所有后台会话都会安全退出。</p>
                <div className="account-actions"><button type="submit">验证并更新密码</button><button type="button" className="secondary" onClick={() => { setRecoveryCodeSent(false); setVerificationCode(""); setSecurityMessage(""); setTurnstileReset((value) => value + 1); }}>重新发送验证码</button></div>
              </>}
              {securityMessage && <div className="security-message" role="status">{securityMessage}</div>}
            </form>
            <aside className="account-security-guide" aria-label="密码修改说明">
              <h2>账号安全</h2>
              <p>按顺序完成验证后，即可更新后台管理员密码。</p>
              <ol>
                <li><strong>人机验证</strong><span>确认操作由管理员本人发起。</span></li>
                <li><strong>邮箱验证码</strong><span>向当前管理员邮箱发送 6 位验证码，10 分钟内有效。</span></li>
                <li><strong>设置新密码</strong><span>输入至少 12 位的新密码；更新成功后，已有后台会话将退出。</span></li>
              </ol>
            </aside>
          </div>
        ) : (
          renderDataList()
        )}
          </motion.div>
        </AnimatePresence>
      </section>
      <AnimatePresence initial={false} mode="wait">
      {introCropOpen && (
        <motion.div key="intro-crop" className="intro-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="intro-crop-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-crop-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>BACKGROUND CROP</p><h2 id="intro-crop-title">调整横竖屏画面</h2><span>框内拖动选框，框外拖动照片；整条边可自由调整，四角保持当前比例。到达预览边缘时可继续拖动选择原图其他部分。</span></div><button type="button" onClick={() => setIntroCropOpen(false)} aria-label="关闭裁切窗口">×</button></header>
            <BackgroundCropEditor settings={introSettings} onChange={setIntroSetting} />
            <footer><button type="button" onClick={() => setIntroCropOpen(false)}>完成裁切</button><button type="button" className="secondary" onClick={() => {
              setSettings((current) => ({
                ...current,
                intro_background_desktop_x: "50", intro_background_desktop_y: "50", intro_background_desktop_zoom: "100",
                intro_background_mobile_x: "50", intro_background_mobile_y: "50", intro_background_mobile_zoom: "100",
                intro_background_desktop_crop_left: "", intro_background_desktop_crop_top: "", intro_background_desktop_crop_width: "", intro_background_desktop_crop_height: "", intro_background_desktop_ratio_locked: "1",
                intro_background_mobile_crop_left: "", intro_background_mobile_crop_top: "", intro_background_mobile_crop_width: "", intro_background_mobile_crop_height: "", intro_background_mobile_ratio_locked: "1",
              }));
            }}>恢复建议比例并居中</button></footer>
          </motion.section>
        </motion.div>
      )}
      {introLogoCropOpen && introLogoCropSource && (
        <motion.div key="intro-logo-crop" className="intro-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="intro-logo-crop-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-crop-dialog intro-logo-crop-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>LOGO CROP</p><h2 id="intro-logo-crop-title">裁切网站 Logo</h2><span>圆框内拖动选框，框外拖动图片；圆框保持等比缩放，到达预览边缘时可继续选取。</span></div><button type="button" onClick={() => setIntroLogoCropOpen(false)} aria-label="关闭 Logo 裁切窗口">×</button></header>
            <CircleImageCropEditor
              source={introLogoCropSource}
              label="Logo"
              onCancel={() => setIntroLogoCropOpen(false)}
              onError={setMessage}
              onConfirm={(image) => {
                setIntroSetting("intro_logo", image);
                setIntroLogoCropOpen(false);
                setMessage("Logo 圆形裁切已完成，请点击“保存首页开场”使前台生效");
              }}
            />
          </motion.section>
        </motion.div>
      )}
      {avatarCropSource && (
        <motion.div key="avatar-crop" className="intro-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-crop-dialog intro-logo-crop-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>PROFILE CROP</p><h2 id="avatar-crop-title">选择侧栏头像区域</h2><span>拖动图片让主体进入圆形选框，调整圆框大小或缩放图片；只有确认后才会替换当前预览。</span></div><button type="button" onClick={() => setAvatarCropSource("")} aria-label="关闭头像裁切窗口">×</button></header>
            <CircleImageCropEditor
              source={avatarCropSource}
              label="头像"
              onCancel={() => setAvatarCropSource("")}
              onError={setMessage}
              onConfirm={(image) => {
                setSettings((current) => ({ ...current, home_profile_avatar: image }));
                setAvatarCropSource("");
                setMessage("头像圆形裁切已加入预览，请点击“保存全部设置”使前台生效");
              }}
            />
          </motion.section>
        </motion.div>
      )}
      {cardCropField && (
        <motion.div key="card-crop" className="intro-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="card-crop-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-crop-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>{cardCropField === "home_hero_image" ? "HERO IMAGE CROP" : "CARD COMPOSITION"}</p><h2 id="card-crop-title">调整{cardCropField === "home_hero_image" ? "首页主视觉" : "栏目卡片"}图片</h2><span>{cardCropField === "home_hero_image" ? "拖动图片与白框调整范围；主视觉仍会生成裁切图。" : "拖动图片与白框标记希望优先展示的区域；原图不会被裁掉，前台根据实际卡片尺寸自适应显示。"}</span></div><button type="button" onClick={() => setCardCropField(null)} aria-label="关闭图片裁切窗口">×</button></header>
            {cardCropField === "home_hero_image" ? <CardCropEditor source={normalizeHomeVisualAsset(settings.home_hero_image, "/assets/demo-5.svg")} label="首页主视觉" isHero onCancel={() => setCardCropField(null)} onError={setMessage} onConfirm={(image) => { setSettings((current) => ({ ...current, home_hero_image: image })); setCardCropField(null); setMessage("主视觉裁切已加入预览；保存全部设置后生效"); }} /> : <CardFocusEditor key={`${cardCropField}:${settings[cardCropField]}`} source={normalizeHomeVisualAsset(settings[cardCropField], homeVisualCardDefinitions.find((item) => item.key === cardCropField)?.fallback || "")} label={homeVisualCardDefinitions.find((item) => item.key === cardCropField)?.label || "栏目"} aspect={cardAspectFor(cardCropField as HomeCardImageKey)} savedCrop={cardCrops[cardCropField]} onCancel={() => setCardCropField(null)} onError={setMessage} onConfirm={(crop) => { updateCardCrop(cardCropField as HomeCardImageKey, crop); setCardCropField(null); setMessage("取景参考已加入预览；保存全部设置后生效"); }} />}
          </motion.section>
        </motion.div>
      )}
      {introPreviewOpen && (
        <motion.div key="intro-preview" className="intro-dialog-backdrop is-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="intro-preview-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-preview-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>LIVE PREVIEW</p><h2 id="intro-preview-title">首页开场预览</h2></div><div className="intro-preview-dialog-actions"><button type="button" className={introPreviewViewport === "desktop" ? "active" : ""} onClick={() => setIntroPreviewViewport("desktop")}>电脑横屏</button><button type="button" className={introPreviewViewport === "mobile" ? "active" : ""} onClick={() => setIntroPreviewViewport("mobile")}>手机竖屏</button><button type="button" onClick={() => setIntroPreviewKey((value) => value + 1)}>重新播放</button><button type="button" onClick={() => setIntroPreviewOpen(false)} aria-label="关闭放大预览">×</button></div></header>
            <div className={`intro-preview-dialog-stage is-${introPreviewViewport}`}>
              <LandingIntro key={`${introPreviewKey}-${introPreviewViewport}`} preview previewViewport={introPreviewViewport} settings={introSettings} nodes={introNodes} />
            </div>
          </motion.section>
        </motion.div>
      )}
      {homePreviewOpen && (
        <motion.div key="home-preview" className="intro-dialog-backdrop is-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="home-preview-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>
          <motion.section className="intro-preview-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 0.7, 0.18, 1] }}>
            <header><div><p>LIVE PREVIEW</p><h2 id="home-preview-title">网站页面图片预览</h2></div><div className="intro-preview-dialog-actions"><button type="button" className={homePreviewViewport === "desktop" ? "active" : ""} onClick={() => setHomePreviewViewport("desktop")}>电脑横屏</button><button type="button" className={homePreviewViewport === "mobile" ? "active" : ""} onClick={() => setHomePreviewViewport("mobile")}>手机竖屏</button><button type="button" onClick={() => setHomePreviewKey((value) => value + 1)}>重新播放</button><button type="button" onClick={() => setHomePreviewOpen(false)} aria-label="关闭放大预览">×</button></div></header>
            <div className={`intro-preview-dialog-stage home-visual-preview-stage is-${homePreviewViewport}`}><HomeVisualPreview key={`${homePreviewKey}-${homePreviewViewport}`} viewport={homePreviewViewport} settings={settings} /></div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {mediaCrop && (
        <motion.div key="admin-media-crop" className="intro-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-media-crop-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="intro-crop-dialog media-square-crop-dialog" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            <header><div><p>PHOTO COMPOSITION</p><h2 id="admin-media-crop-title">选择展示区域</h2><span>框内拖动选框，框外拖动照片；拖动边缘或四角时始终保持正方形。碰到预览边缘时，图片会继续平滑移动。</span></div><button type="button" onClick={() => setMediaCrop(null)} aria-label="关闭方形取景">×</button></header>
            <MediaSquareCropEditor key={mediaCrop.source} source={mediaCrop.source} onCancel={() => setMediaCrop(null)} onError={setMessage} onConfirm={(thumbnail) => { if (typeof mediaCrop.target === "object") { if (mediaCrop.replaceOriginal) updateMediaRow(mediaCrop.target.id, "url", mediaCrop.source); updateMediaRow(mediaCrop.target.id, "thumbnail_url", thumbnail); } else { if (mediaCrop.replaceOriginal) setUploadData(mediaCrop.source); setUploadThumbnailData(thumbnail); } setMediaCrop(null); setMessage("方形预览已准备好；保存全部设置后生效，原图会保留用于放大查看"); }} />
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {mediaPreview && (
        <motion.div key="admin-media-preview" className="admin-media-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-media-preview-title" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} onClick={(event) => { if (event.target === event.currentTarget) setMediaPreview(null); }}>
          <div className="admin-media-preview-dialog">
            <header><h2 id="admin-media-preview-title">{mediaPreview.title}</h2><button type="button" autoFocus aria-label="关闭媒体预览" onClick={() => setMediaPreview(null)}>关闭 ×</button></header>
            {mediaPreview.video ? <video key={mediaPreview.url} src={mediaPreview.url} controls playsInline preload="metadata" /> : <img src={mediaPreview.url} alt={mediaPreview.title} />}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {deleteDialog && (
        <motion.div
          key="admin-delete-dialog"
          className="admin-delete-dialog-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="admin-delete-dialog-title"
          aria-describedby="admin-delete-dialog-detail"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.section
            className="admin-delete-dialog"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 0.7, 0.18, 1] }}
          >
            <div className="admin-delete-dialog-icon" aria-hidden="true">!</div>
            <p className="admin-delete-dialog-kicker">危险操作</p>
            <h2 id="admin-delete-dialog-title">{deleteDialog.title}</h2>
            <p id="admin-delete-dialog-detail">{deleteDialog.detail}</p>
            <strong>删除后无法恢复</strong>
            <div className="admin-delete-dialog-actions">
              <button type="button" className="secondary" onClick={() => setDeleteDialog(null)}>取消</button>
              <button type="button" className="danger" onClick={confirmDeletion}>{deleteDialog.confirmLabel}</button>
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {saveDialog && (
        <motion.div
          key="admin-save-dialog"
          className="admin-save-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-save-dialog-title"
          aria-describedby="admin-save-dialog-detail"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.section
            className={`admin-save-dialog is-${saveDialog.phase}`}
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 0.7, 0.18, 1] }}
          >
            <div className="admin-save-dialog-indicator" aria-hidden="true"><i /></div>
            <h2 id="admin-save-dialog-title">{saveDialog.title}</h2>
            <p id="admin-save-dialog-detail">{saveDialog.detail}</p>
            {saveDialog.phase !== "saving" && <button type="button" onClick={() => setSaveDialog(null)}>{saveDialog.phase === "success" ? "知道了" : "返回修改"}</button>}
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
    </main>
  );
}
