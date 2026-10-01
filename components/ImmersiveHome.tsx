"use client";

import { FormEvent, Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnchorHTMLAttributes, CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, BookOpen, Box, Check, ChevronDown, Clock3, Image as ImageIcon, Info, ListMusic, Menu as MenuIcon, MessageSquareText, Music2, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, UserRound, Volume2, X } from "lucide-react";
import LandingIntro, { defaultHomepageIntroNodes, defaultHomepageIntroSettings, HomepageIntroNode } from "./LandingIntro";
import { createDisplaySizingStyle, defaultDisplaySettings } from "./displaySizing";
import { defaultGalaxySettings, GalaxySettings, normalizeGalaxySettings } from "./galaxySettings";
import { defaultHomepageCopySettings, getHomeCopy } from "./homeCopy";
import { defaultHomeVisualSettings, homeCardToneOptions, homeVisualCssUrl, homeVisualOverlay, normalizeHomeBackgroundBlur, normalizeHomeBackgroundOverlayOpacity, normalizeHomeBackgroundTone, normalizeHomeCardOpacity, normalizeHomeCardTone, normalizeHomeVisualAsset, normalizeHomeVisualColor, normalizeHomeCardCrops, normalizeHomeCardAspects, normalizeHomeCardOrder, normalizeHomeCardVisibility, homeCardAspectRatioNumber, type HomeCardCrop, type HomeCardImageKey } from "./homeVisuals";
import { visibleCustomContactLinks } from "./contactLinks";
import { isDesktopGalaxyClient } from "./desktopGalaxyTextures";
import { defaultHeroPresentationSettings, normalizeHeroArtStyle, normalizeHeroMotionLevel, visibleHeroSecondaryButton } from "./heroPresentation";
import { defaultMusicSettings, normalizeMusicPlaylist, normalizeMusicVolume } from "./musicSettings";
import { createMusicPlayback } from "./musicPlayback";
import MediaLightbox from "./MediaLightbox";
import TimelineJourney from "./TimelineJourney";

const loadMemoryGalaxy = () => import("./MemoryGalaxy");
const MemoryGalaxy = lazy(loadMemoryGalaxy);
const loadVisitorLogin = () => import("./OpenSourceVisitorLogin");
const OpenSourceVisitorLogin = lazy(loadVisitorLogin);
const DesktopPet = lazy(() => import("./desktop-pet/DesktopPet"));

type EntryPhase = "booting" | "intro-playing" | "intro-exiting" | "welcome" | "site";
type MusicPlaybackMode = "sequential" | "shuffle" | "repeat-one";
export type ArchiveRoute = "/" | "/stories" | "/memory" | "/timeline" | "/campus" | "/notes" | "/about" | "/messages";

const archiveRoutes: ArchiveRoute[] = ["/", "/stories", "/memory", "/timeline", "/campus", "/notes", "/about", "/messages"];
const archiveNavigation: Array<{ path: Exclude<ArchiveRoute, "/">; label: string }> = [
  { path: "/stories", label: "故事集" },
  { path: "/memory", label: "3D 粒子树" },
  { path: "/timeline", label: "时间线" },
  { path: "/campus", label: "校园碎片" },
  { path: "/notes", label: "随手记" },
  { path: "/about", label: "关于我们" },
  { path: "/messages", label: "留言操场" },
];

export function normalizeArchiveRoute(pathname: string): ArchiveRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return archiveRoutes.includes(normalized as ArchiveRoute) ? normalized as ArchiveRoute : "/";
}

type ArchiveHomeLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { children: ReactNode };
function ArchiveHomeLink({ children, ...props }: ArchiveHomeLinkProps) {
  // The VPS build uses a lightweight Vite shell rather than Next's router.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a href="/" {...props}>{children}</a>;
}

type Visitor = { name: string; avatar: string };
type Memory = { id?: number; url: string; thumbnail_url?: string; video_url?: string; title: string; meta: string; body?: string; taken_at?: string; sort_order?: number; show_on_home?: number; show_in_3d?: number; show_in_stories?: number };
type TimelineItem = { date: string; title: string; text: string };
type SiteStats = { page_views: number; media_count: number; online: boolean; updated_at?: string };
type HeroParallaxState = {
  element: HTMLDivElement | null;
  frame: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  strength: number;
};
type CommentItem = {
  id: number;
  parent_id?: number | null;
  nickname: string;
  avatar: string;
  text: string;
  image?: string | null;
  likes: number;
  created_at: string;
  reply_to?: string | null;
  liked?: boolean;
};

const defaultTimelineItems: TimelineItem[] = [
  { date: "2023.09", title: "第一次走进这里", text: "风很轻，书包很重，未来还是一张没有写字的纸。" },
  { date: "2024.03", title: "春天在操场集合", text: "我们用一整个下午，把笑声留在跑道边。" },
  { date: "2025.06", title: "教室最后一排", text: "黑板上的倒计时越来越小，想说的话却越来越多。" },
  { date: "NOW", title: "故事仍在继续", text: "今天也值得记录。等未来回头看，它一定很亮。" },
];

function parseTimelineItems(value: unknown): TimelineItem[] {
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!Array.isArray(parsed)) return defaultTimelineItems;
    const items = parsed.slice(0, 8).map((item) => ({
      date: String(item?.date || ""),
      title: String(item?.title || ""),
      text: String(item?.text || ""),
    })).filter((item) => item.date || item.title || item.text);
    return items.length ? items : defaultTimelineItems;
  } catch {
    return defaultTimelineItems;
  }
}

const defaultMemories: Memory[] = [
  { url: "/assets/demo-1.svg", title: "风从教学楼穿过", meta: "初夏 · 放学后" },
  { url: "/assets/demo-2.svg", title: "一起笑得很大声", meta: "社团日 · 操场边" },
  { url: "/assets/demo-3.svg", title: "熟悉的那条路", meta: "九月 · 新学期" },
  { url: "/assets/demo-4.svg", title: "课桌上的光", meta: "午后 · 自习课" },
  { url: "/assets/demo-5.svg", title: "落日在黑板停留", meta: "傍晚 · 最后一节课" },
];

const fallbackComments: CommentItem[] = [
  { id: 1, nickname: "一颗汽水糖", avatar: "🌤️", text: "看到这些照片，突然想起放学铃响以后，大家一起冲出教室的样子。", likes: 24, created_at: "2026-09-12T00:00:00.000Z" },
  { id: 2, nickname: "晚风同学", avatar: "🌿", text: "这个网站好像一封慢慢打开的信。期待看到更多校园故事！", likes: 16, created_at: "2026-09-12T00:00:00.000Z", reply_to: "一颗汽水糖" },
];

function fileToData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleDateString("zh-CN");
}

function memoryMeta(memory: Memory) {
  if (!memory.taken_at) return memory.meta;
  const date = new Date(memory.taken_at);
  if (Number.isNaN(date.getTime())) return memory.meta;
  const taken = date.toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return memory.meta ? `${taken} · ${memory.meta}` : taken;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(url) || url.startsWith("data:video/");
}

function selectThreeDimensionalMemories(items: Memory[]) {
  return items.filter((memory) => Number(memory.show_in_3d ?? 1) === 1);
}

function MemoryVisual({ memory, alt, full = false }: { memory: Memory; alt: string; full?: boolean }) {
  return isVideoUrl(memory.url)
    ? <video src={memory.url} aria-label={alt} muted loop autoPlay playsInline preload="none" />
    : <img src={full ? memory.url : memory.thumbnail_url || memory.url} alt={alt} loading="lazy" decoding="async" />;
}

function BentoArtwork({ src, crop }: { src: string; crop?: HomeCardCrop }) {
  if (!src) return null;
  const focus = crop ? `${crop.left + crop.width / 2}% ${crop.top + crop.height / 2}%` : "center";
  return <><img className="ix-bento-artwork" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{ objectPosition: focus }} /><span className="ix-bento-shade" aria-hidden="true" /></>;
}

function normalizeContactLink(value: unknown, fallback = "") {
  const normalized = String(value || "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(normalized) ? normalized : fallback;
}

function normalizeContactEmail(value: unknown) {
  const normalized = String(value || "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized) ? normalized : "";
}

function ParticleField({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    let lastPaint = 0;
    const dots = Array.from({ length: 40 }, (_, index) => ({ x: (index * 83) % 1200, y: (index * 139) % 800, r: 1 + index % 3, speed: .1 + (index % 5) * .025 }));
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.7);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - lastPaint < 34) return;
      lastPaint = now;
      context.clearRect(0, 0, width, height);
      dots.forEach((dot, index) => {
        dot.y -= dot.speed;
        if (dot.y < -10) dot.y = height + 10;
        const x = dot.x % Math.max(width, 1);
        context.fillStyle = index % 4 === 0 ? "rgba(255,169,91,.4)" : "rgba(165,225,255,.36)";
        context.beginPath(); context.arc(x, dot.y, dot.r * 1.8, 0, Math.PI * 2); context.fill();
      });
    };
    resize(); frame = requestAnimationFrame(draw); window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [active]);
  return <canvas ref={canvasRef} className="ix-particle-field" aria-hidden="true" />;
}

// Kept as a low-capability fallback for emergency rollback testing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyMemoryRiver({ memories, onClose }: { memories: Memory[]; onClose: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef({ yaw: 0, pitch: -8, auto: 0, dragging: false, x: 0, y: 0, moved: 0 });
  const [active, setActive] = useState<Memory | null>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const animate = () => {
      const motion = motionRef.current;
      if (!motion.dragging && !reducedMotion) motion.auto = (motion.auto + .018) % 360;
      scene.style.transform = `rotateX(${motion.pitch}deg) rotateY(${motion.yaw + motion.auto}deg)`;
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, []);

  const beginRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    Object.assign(motionRef.current, { dragging: true, x: event.clientX, y: event.clientY, moved: 0 });
  };
  const rotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    const motion = motionRef.current;
    if (!motion.dragging) return;
    const dx = event.clientX - motion.x;
    const dy = event.clientY - motion.y;
    motion.yaw += dx * .24;
    motion.pitch = Math.max(-24, Math.min(18, motion.pitch - dy * .16));
    motion.moved += Math.abs(dx) + Math.abs(dy);
    motion.x = event.clientX;
    motion.y = event.clientY;
  };
  const endRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    motionRef.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const orbitMemories = memories.slice(0, 8);
  return (
    <div className="ix-river" role="dialog" aria-modal="true" aria-label="可旋转的 3D 青春记忆树">
      <div className="ix-river-aurora" aria-hidden="true" />
      <div className="ix-river-top"><button onClick={onClose}>← 返回现实</button><div><span>MEMORY TREE</span><strong>青春记忆树</strong></div><span className="ix-live"><i /> 正在生长</span></div>
      <p className="ix-river-hint">按住并拖动旋转 · 悬停照片查看 · 点击拾起记忆</p>
      <div className="ix-tree-viewport" onPointerDown={beginRotate} onPointerMove={rotate} onPointerUp={endRotate} onPointerCancel={endRotate}>
        <div className="ix-tree-scene" ref={sceneRef}>
          <div className="ix-tree-stars" aria-hidden="true">
            {Array.from({ length: 52 }, (_, index) => <i key={index} style={{ "--star-x": `${(index * 47) % 96}%`, "--star-y": `${8 + (index * 73) % 82}%`, "--star-z": `${-240 + (index * 89) % 480}px`, "--star-delay": `${-(index % 13) * .31}s`, "--star-size": `${2 + index % 4}px` } as CSSProperties} />)}
          </div>
          <div className="ix-soil-orbit" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="ix-memory-tree" aria-hidden="true">
            <div className="ix-tree-glow" />
            <div className="ix-tree-trunk" />
            <div className="ix-tree-branches">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--branch-angle": `${-68 + index * 10.5}deg`, "--branch-y": `${40 + (index % 7) * 23}px`, "--branch-length": `${82 + (index % 5) * 18}px` } as CSSProperties} />)}</div>
            <div className="ix-tree-crown">{Array.from({ length: 26 }, (_, index) => <i key={index} style={{ "--leaf-angle": `${index * 137.5}deg`, "--leaf-radius": `${38 + (index % 6) * 18}px`, "--leaf-y": `${-10 - (index % 8) * 22}px`, "--leaf-size": `${28 + index % 5 * 8}px`, "--leaf-delay": `${-(index % 9) * .27}s` } as CSSProperties} />)}</div>
          </div>
          <div className="ix-orbit-memories">
            {orbitMemories.map((memory, index) => <button key={`${memory.url}-${index}`} className="ix-orbit-memory" style={{ "--photo-angle": `${index * (360 / Math.max(orbitMemories.length, 1))}deg`, "--photo-y": `${-100 + (index % 3) * 112}px`, "--photo-y-mobile": `${-68 + (index % 3) * 76}px`, "--photo-delay": `${-index * .4}s` } as CSSProperties} onClick={() => motionRef.current.moved < 8 && setActive(memory)}><img src={memory.thumbnail_url || memory.url} alt={memory.title} /><span>{String(index + 1).padStart(2, "0")}</span><strong>{memory.title}</strong></button>)}
          </div>
        </div>
      </div>
      <div className="ix-river-title"><span>THE LIGHT REMEMBERS</span><strong>会发光的青春</strong><small>每一张照片，都在记忆树旁慢慢旋转</small></div>
      {active && <div className="ix-memory-detail"><button onClick={() => setActive(null)}>×</button><img src={active.url} alt={active.title} /><div><span>{memoryMeta(active)}</span><h2>{active.title}</h2><p>这一段故事的正文，可以稍后在管理后台里慢慢补上。</p></div></div>}
    </div>
  );
}

function MemoryRiver({ memories, onClose, origin, galaxySettings }: { memories: Memory[]; onClose: () => void; origin: { x: number; y: number }; galaxySettings: GalaxySettings }) {
  const [phase, setPhase] = useState<"expanding" | "loading" | "leaving" | "blackout" | "done">("expanding");
  const [sceneReady, setSceneReady] = useState(false);
  const [revealStarted, setRevealStarted] = useState(false);
  const startedAt = useRef(Date.now());
  useEffect(() => {
    const loadingTimer = window.setTimeout(() => setPhase("loading"), 820);
    return () => window.clearTimeout(loadingTimer);
  }, []);
  useEffect(() => {
    if (!sceneReady) return;
    const remaining = Math.max(0, 2600 - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => {
      setPhase((current) => current === "loading" ? "leaving" : current);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);
  useEffect(() => {
    if (sceneReady) return;
    const fallback = window.setTimeout(() => {
      setPhase((current) => current === "expanding" || current === "loading" ? "leaving" : current);
    }, 6000);
    return () => window.clearTimeout(fallback);
  }, [sceneReady]);
  useEffect(() => {
    if (phase !== "leaving") return;
    const blackoutTimer = window.setTimeout(() => setPhase("blackout"), 800);
    return () => window.clearTimeout(blackoutTimer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "blackout") return;
    const revealTimer = window.setTimeout(() => {
      setRevealStarted(true);
      setPhase("done");
    }, 480);
    return () => window.clearTimeout(revealTimer);
  }, [phase]);
  const entryStyle = { "--entry-x": `${origin.x}px`, "--entry-y": `${origin.y}px` } as CSSProperties;
  return <>{phase !== "expanding" && <Suspense fallback={null}><MemoryGalaxy memories={memories} onClose={onClose} revealStarted={revealStarted} onSceneReady={() => setSceneReady(true)} settings={galaxySettings} /></Suspense>}{phase !== "done" && <div className={`ix-galaxy-entry is-${phase}`} style={entryStyle}><div className="ix-galaxy-entry-copy"><span>MEMORY ARCHIVE / AWAKENING</span><strong>我们把散落的光，重新连成一棵树</strong><small>请稍候，记忆正在苏醒</small></div></div>}</>;
}

export default function ImmersiveHome({ initialRoute }: { initialRoute?: ArchiveRoute }) {
  const reduceMotion = useReducedMotion();
  const [currentRoute, setCurrentRoute] = useState<ArchiveRoute>(() => initialRoute ?? (typeof window !== "undefined" ? normalizeArchiveRoute(window.location.pathname) : "/"));
  const [entryPhase, setEntryPhase] = useState<EntryPhase>("booting");
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [gate, setGate] = useState(false);
  const [visitorLoginSession, setVisitorLoginSession] = useState(0);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [memories, setMemories] = useState(defaultMemories);
  const [comments, setComments] = useState(fallbackComments);
  const [serverOnline, setServerOnline] = useState(false);
  const [stats, setStats] = useState<SiteStats>({ page_views: 0, media_count: 0, online: false });
  const [settings, setSettings] = useState({ site_title: "我的记忆档案", footer_title: "我的记忆档案", footer_subtitle: "", hero_title: "把青春留在风经过的地方", profile_text: "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。", github_url: "", contact_email: "", contact_douyin_url: "", contact_custom_links: "[]", notes_title: "随手记", notes_body: "这里会慢慢收集校园里真实发生的片段。", timeline_items: JSON.stringify(defaultTimelineItems), ...defaultDisplaySettings, ...defaultGalaxySettings, ...defaultHomepageIntroSettings, ...defaultHomepageCopySettings, ...defaultHeroPresentationSettings, ...defaultHomeVisualSettings, ...defaultMusicSettings });
  const [introNodes, setIntroNodes] = useState<HomepageIntroNode[]>(defaultHomepageIntroNodes);
  const [riverOpen, setRiverOpen] = useState(initialRoute === "/memory");
  const [riverOrigin, setRiverOrigin] = useState({ x: 0, y: 0 });
  const [soundOn, setSoundOn] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [musicListOpen, setMusicListOpen] = useState(false);
  const [musicPlaybackMode, setMusicPlaybackMode] = useState<MusicPlaybackMode>("sequential");
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicPlaybackRef = useRef<ReturnType<typeof createMusicPlayback> | null>(null);
  const musicPlayerRef = useRef<HTMLDivElement>(null);
  const continueMusicRef = useRef(false);
  const musicAutoplayAttemptedRef = useRef(false);
  const musicAutoplayPendingRef = useRef(false);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState("");
  const [reply, setReply] = useState<CommentItem | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [submission, setSubmission] = useState({ email: "", title: "", body: "", image: "" });
  const [showAllStories, setShowAllStories] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Memory | null>(null);
  const [expandedStory, setExpandedStory] = useState<Memory | null>(null);
  const viewRecordedRef = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const heroParallaxRef = useRef<HeroParallaxState>({ element: null, frame: 0, currentX: 0, currentY: 0, targetX: 0, targetY: 0, strength: 1 });

  useEffect(() => {
    if (!contactOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContactOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [contactOpen]);

  useEffect(() => {
    if (!selectedStory) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedStory(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedStory]);

  const navigateArchive = useCallback((route: ArchiveRoute, replace = false) => {
    if (typeof window !== "undefined") {
      const method = replace ? "replaceState" : "pushState";
      if (window.location.pathname !== route) window.history[method]({}, "", route);
    }
    setCurrentRoute(route);
    setMenu(false);
  }, []);

  const followArchiveLink = useCallback((route: ArchiveRoute) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateArchive(route);
  }, [navigateArchive]);

  const openMemoryRiver = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedWithPointer = event.detail > 0;
    setRiverOrigin({
      x: clickedWithPointer ? event.clientX : rect.left + rect.width / 2,
      y: clickedWithPointer ? event.clientY : rect.top + rect.height / 2,
    });
    void loadMemoryGalaxy().then((module) => module.preloadGalaxyTextures(threeDimensionalMemories, "accelerated"));
    navigateArchive("/memory");
    setRiverOpen(true);
  };

  const closeMemoryRiver = () => {
    setRiverOpen(false);
    if (currentRoute === "/memory") navigateArchive("/");
  };

  const movePortalSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--terrain-ry", `${x * 5}deg`);
    event.currentTarget.style.setProperty("--terrain-rx", `${y * -2.5}deg`);
  };

  const moveCardSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const glass = event.currentTarget.querySelectorAll<HTMLElement>(":scope > div > p, :scope > div > span:last-child");
    const distanceToGlass = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.right);
      const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.bottom);
      return dx * dx + dy * dy;
    };
    if (glass.length === 2) event.currentTarget.dataset.activeGlass = distanceToGlass(glass[0]) <= distanceToGlass(glass[1]) ? "top" : "bottom";
    event.currentTarget.classList.add("is-pointer-active");
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  };

  const settleCardSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
    delete event.currentTarget.dataset.activeGlass;
    event.currentTarget.classList.remove("is-pointer-active");
    event.currentTarget.style.setProperty("--spot-x", "50%");
    event.currentTarget.style.setProperty("--spot-y", "50%");
  };

  const displayMemories = useMemo(() => memories.length ? memories : defaultMemories, [memories]);
  const homepageMemories = useMemo(() => displayMemories.filter((memory) => Number(memory.show_on_home ?? 1) === 1), [displayMemories]);
  const storyMemories = useMemo(() => displayMemories.filter((memory) => Number(memory.show_in_stories ?? 1) === 1), [displayMemories]);
  const threeDimensionalMemories = useMemo(() => selectThreeDimensionalMemories(displayMemories), [displayMemories]);
  const heroMemories = homepageMemories.length ? homepageMemories : defaultMemories.slice(0, 1);
  const visibleStories = storyMemories.slice(0, showAllStories ? storyMemories.length : 4);
  const timelineItems = useMemo(() => parseTimelineItems(settings.timeline_items), [settings.timeline_items]);
  const displaySizingStyle = useMemo(
    () => createDisplaySizingStyle(settings.display_font_scale, settings.display_media_scale),
    [settings.display_font_scale, settings.display_media_scale],
  );
  const homeBackgroundTone = normalizeHomeBackgroundTone(settings.home_background_tone);
  const homeBackgroundColor = normalizeHomeVisualColor(settings.home_background_color, defaultHomeVisualSettings.home_background_color);
  const homeAccentColor = normalizeHomeVisualColor(settings.home_accent_color, defaultHomeVisualSettings.home_accent_color);
  const homeBackgroundOverlayOpacity = normalizeHomeBackgroundOverlayOpacity(settings.home_background_overlay_opacity);
  const homeBackgroundBlur = normalizeHomeBackgroundBlur(settings.home_background_blur);
  const homeBackgroundImage = normalizeHomeVisualAsset(settings.home_background_url, "/assets/demo-5.svg");
  const homeHeroImage = normalizeHomeVisualAsset(settings.home_hero_image);
  const homeCardTone = normalizeHomeCardTone(settings.home_card_tone);
  const homeCardToneFallback = homeCardToneOptions.find((option) => option.value === homeCardTone)?.color || defaultHomeVisualSettings.home_card_tone_color;
  const homeCardToneColor = normalizeHomeVisualColor(settings.home_card_tone_color, homeCardToneFallback);
  const homeCardSurfaceOpacity = normalizeHomeCardOpacity(settings.home_card_surface_opacity, 62);
  const homeCardImageOverlayOpacity = normalizeHomeCardOpacity(settings.home_card_image_overlay_opacity, 42);
  const contactEmail = normalizeContactEmail(settings.contact_email);
  const contactEmailHref = contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent("我的记忆档案联系")}` : "";
  const customContactLinks = visibleCustomContactLinks(settings.contact_custom_links);
  const siteStyle = {
    ...displaySizingStyle,
    "--home-bg-base": homeBackgroundColor,
    "--home-bg-overlay": homeVisualOverlay(homeBackgroundColor, homeBackgroundOverlayOpacity / 100),
    "--home-bg-overlay-opacity": homeBackgroundOverlayOpacity / 100,
    "--home-bg-blur": `${homeBackgroundBlur}px`,
    "--home-bg-image": homeVisualCssUrl(homeBackgroundImage),
    "--home-accent": homeAccentColor,
    "--lime": homeAccentColor,
    "--home-card-panel": homeVisualOverlay(homeCardToneColor, homeCardSurfaceOpacity / 180),
    "--home-card-surface": homeVisualOverlay(homeCardToneColor, homeCardSurfaceOpacity / 100),
    "--home-card-shade-strong": homeVisualOverlay(homeCardToneColor, homeCardImageOverlayOpacity / 100),
    "--home-card-shade-mid": homeVisualOverlay(homeCardToneColor, homeCardImageOverlayOpacity / 230),
    "--home-card-shade-soft": homeVisualOverlay(homeCardToneColor, homeCardImageOverlayOpacity / 520),
  } as CSSProperties;
  const bentoImages = {
    story: normalizeHomeVisualAsset(settings.home_card_story_image),
    memory: normalizeHomeVisualAsset(settings.home_card_memory_image, "/assets/demo-1.svg"),
    timeline: normalizeHomeVisualAsset(settings.home_card_timeline_image),
    campus: normalizeHomeVisualAsset(settings.home_card_campus_image),
    notes: normalizeHomeVisualAsset(settings.home_card_notes_image),
    about: normalizeHomeVisualAsset(settings.home_card_about_image),
    messages: normalizeHomeVisualAsset(settings.home_card_messages_image),
  };
  const bentoCrops = normalizeHomeCardCrops(settings.home_card_crops);
  const visibleHomeCards = normalizeHomeCardVisibility(settings.home_card_visibility);
  const orderedHomeCardKeys = normalizeHomeCardOrder(settings.home_card_order);
  const visibleHomeCardCount = Object.values(visibleHomeCards).filter(Boolean).length;
  const bentoAspects = normalizeHomeCardAspects(settings.home_card_aspects);
  const bentoAspect = homeCardAspectRatioNumber(settings.home_card_aspect_ratio);
  const heroCopy = getHomeCopy(settings, "hero");
  const storiesCopy = getHomeCopy(settings, "stories");
  const portalCopy = getHomeCopy(settings, "portal");
  const campusCopy = getHomeCopy(settings, "campus");
  const timelineCopy = getHomeCopy(settings, "timeline");
  const aboutCopy = getHomeCopy(settings, "about");
  const commentsCopy = getHomeCopy(settings, "comments");
  const galaxySettings = normalizeGalaxySettings(settings);
  const heroArtStyle = normalizeHeroArtStyle(settings.hero_art_style);
  const heroMotionLevel = normalizeHeroMotionLevel(settings.hero_motion_level);
  const showHeroCaptions = settings.hero_show_captions !== "0";
  const musicTracks = useMemo(() => normalizeMusicPlaylist(settings.music_playlist), [settings.music_playlist]);
  const musicVolume = normalizeMusicVolume(settings.music_default_volume);
  const safeTrackIndex = musicTracks.length ? currentTrackIndex % musicTracks.length : 0;
  const currentTrack = musicTracks[safeTrackIndex];
  const currentTrackUrl = currentTrack?.url;

  const getMusicPlayback = useCallback(() => {
    if (!audioRef.current) return null;
    if (!musicPlaybackRef.current) musicPlaybackRef.current = createMusicPlayback(audioRef.current, setSoundOn);
    return musicPlaybackRef.current;
  }, []);

  useEffect(() => () => { musicPlaybackRef.current?.reset(); }, []);

  useEffect(() => {
    getMusicPlayback()?.setVolume(musicVolume / 100);
  }, [getMusicPlayback, musicVolume]);

  useEffect(() => {
    const savedMode = localStorage.getItem("into-music-playback-mode");
    if (savedMode !== "shuffle" && savedMode !== "repeat-one" && savedMode !== "sequential") return;
    const frame = window.requestAnimationFrame(() => setMusicPlaybackMode(savedMode));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!musicListOpen) return;
    const closeMusicList = (event: PointerEvent) => {
      if (!musicPlayerRef.current?.contains(event.target as Node)) setMusicListOpen(false);
    };
    const closeMusicListOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMusicListOpen(false);
    };
    document.addEventListener("pointerdown", closeMusicList);
    document.addEventListener("keydown", closeMusicListOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMusicList);
      document.removeEventListener("keydown", closeMusicListOnEscape);
    };
  }, [musicListOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const playback = getMusicPlayback();
    playback?.reset();
    audio.load();
    if (continueMusicRef.current && currentTrackUrl) {
      continueMusicRef.current = false;
      void playback?.play().catch(() => setSoundOn(false));
    }
  }, [currentTrackUrl, getMusicPlayback]);

  useEffect(() => {
    if (entryPhase !== "site" || settings.music_default_on !== "1" || !currentTrackUrl || musicAutoplayAttemptedRef.current) return;
    const playback = getMusicPlayback();
    if (!playback) return;
    musicAutoplayAttemptedRef.current = true;
    void playback.play().catch(() => {
      musicAutoplayPendingRef.current = true;
      setSoundOn(false);
    });
  }, [entryPhase, settings.music_default_on, currentTrackUrl, getMusicPlayback]);

  useEffect(() => {
    if (settings.music_default_on !== "1" || !currentTrackUrl) return;
    const retryAutoplay = (event: PointerEvent) => {
      if (!musicAutoplayPendingRef.current || musicPlayerRef.current?.contains(event.target as Node)) return;
      const playback = getMusicPlayback();
      if (!playback) return;
      musicAutoplayPendingRef.current = false;
      void playback.play().catch(() => {
        musicAutoplayPendingRef.current = true;
        setSoundOn(false);
      });
    };
    document.addEventListener("pointerdown", retryAutoplay);
    return () => document.removeEventListener("pointerdown", retryAutoplay);
  }, [settings.music_default_on, currentTrackUrl, getMusicPlayback]);

  const paintHeroCollage = (state: HeroParallaxState) => {
    if (!state.element) return;
    const { element, currentX: x, currentY: y, strength } = state;
    element.style.setProperty("--hero-core-x", `${x * 2.2 * strength}px`);
    element.style.setProperty("--hero-core-y", `${y * 1.6 * strength}px`);
    [1, 2, 3].forEach((layer) => {
      element.style.setProperty(`--hero-photo-${layer}-x`, `${x * (3 + layer * 2) * strength}px`);
      element.style.setProperty(`--hero-photo-${layer}-y`, `${y * (2 + layer * 1.5) * strength}px`);
    });
  };

  const animateHeroCollage = () => {
    const state = heroParallaxRef.current;
    const easing = state.targetX === 0 && state.targetY === 0 ? .075 : .14;
    state.currentX += (state.targetX - state.currentX) * easing;
    state.currentY += (state.targetY - state.currentY) * easing;
    paintHeroCollage(state);
    if (Math.abs(state.targetX - state.currentX) < .002 && Math.abs(state.targetY - state.currentY) < .002) {
      state.currentX = state.targetX;
      state.currentY = state.targetY;
      paintHeroCollage(state);
      state.frame = 0;
      return;
    }
    state.frame = window.requestAnimationFrame(animateHeroCollage);
  };

  const requestHeroCollageFrame = () => {
    const state = heroParallaxRef.current;
    if (!state.frame) state.frame = window.requestAnimationFrame(animateHeroCollage);
  };

  const moveHeroCollage = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduceMotion || heroMotionLevel === "quiet" || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const state = heroParallaxRef.current;
    state.element = event.currentTarget;
    state.targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
    state.targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
    state.strength = heroMotionLevel === "vivid" ? 1 : .62;
    requestHeroCollageFrame();
  };

  const settleHeroCollage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = heroParallaxRef.current;
    state.element = event.currentTarget;
    state.targetX = 0;
    state.targetY = 0;
    requestHeroCollageFrame();
  };

  useEffect(() => () => {
    if (heroParallaxRef.current.frame) window.cancelAnimationFrame(heroParallaxRef.current.frame);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const route = normalizeArchiveRoute(window.location.pathname);
      setCurrentRoute(route);
      setRiverOpen(route === "/memory");
      setMenu(false);
    };
    window.addEventListener("popstate", handlePopState);
    handlePopState();
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (entryPhase === "site") return;
    void loadVisitorLogin();
  }, [entryPhase]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("into-visitor");
      if (saved) {
        const identity = JSON.parse(saved) as Partial<Visitor>;
        if (typeof identity.name === "string" && identity.name.trim() && typeof identity.avatar === "string" && identity.avatar) {
          const restored = { name: identity.name.trim().slice(0, 18), avatar: identity.avatar };
          setVisitor(restored);
          setGate(false);
        } else {
          localStorage.removeItem("into-visitor");
        }
      }
    } catch {
      localStorage.removeItem("into-visitor");
    } finally {
      setIdentityLoaded(true);
    }
    if (!viewRecordedRef.current) {
      viewRecordedRef.current = true;
      request("/api/stats/view", { method: "POST", body: "{}" })
        .then((data) => setStats((current) => ({ ...current, page_views: Number(data.page_views || 0), online: true })))
        .catch(() => undefined);
    }
    // Start downloading the 3D scene code immediately. As soon as content arrives,
    // its image textures enter the low-concurrency decode queue while the visitor is
    // still viewing the opening/home page, instead of waiting for an idle callback.
    const galaxyModulePromise = loadMemoryGalaxy();
    void request("/api/content").then((content) => {
      setServerOnline(true);
      if (content.settings) setSettings((current) => ({ ...current, ...content.settings }));
      if (Array.isArray(content.intro_nodes)) setIntroNodes(content.intro_nodes);
      const loadedMemories: Memory[] = content.media?.length ? content.media : defaultMemories;
      if (content.media?.length) setMemories(content.media);
      void galaxyModulePromise.then((module) => module.preloadGalaxyTextures(selectThreeDimensionalMemories(loadedMemories), "background"));
    }).catch(() => {
      setServerOnline(false);
      setStats((current) => ({ ...current, online: false }));
      void galaxyModulePromise.then((module) => module.preloadGalaxyTextures(selectThreeDimensionalMemories(defaultMemories), "background"));
    }).finally(() => setContentLoaded(true));

    void request("/api/comments")
      .then((commentData) => setComments(commentData.comments || []))
      .catch(() => undefined);
    void request("/api/stats")
      .then((statData) => setStats((current) => ({ ...current, ...statData, page_views: Math.max(current.page_views, Number(statData.page_views || 0)), online: true })))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!identityLoaded || !contentLoaded || entryPhase !== "booting") return;
    const phaseFrame = window.requestAnimationFrame(() => {
      if (settings.intro_enabled === "0") {
        setGate(!visitor);
        setEntryPhase(visitor ? "site" : "welcome");
        return;
      }
      setEntryPhase("intro-playing");
    });
    return () => window.cancelAnimationFrame(phaseFrame);
  }, [contentLoaded, entryPhase, identityLoaded, settings.intro_enabled, visitor]);

  const prepareWelcome = useCallback(() => {
    setGate(!visitor);
    setEntryPhase("intro-exiting");
  }, [visitor]);

  const completeIntro = useCallback(() => setEntryPhase(visitor ? "site" : "welcome"), [visitor]);

  const upload = async (data: string) => {
    if (!data.startsWith("data:")) return data;
    if (!serverOnline) return data;
    const result = await request("/api/upload", { method: "POST", body: JSON.stringify({ data }) });
    return result.url as string;
  };

  const enter = async (candidate: Visitor) => {
    if (!candidate.name.trim()) return setToast("先写下一个属于你的名字吧");
    try {
      const savedAvatar = await upload(candidate.avatar);
      const identity = { name: candidate.name.trim().slice(0, 18), avatar: savedAvatar };
      setVisitor(identity); localStorage.setItem("into-visitor", JSON.stringify(identity));
      setGate(false); setEntryPhase("site"); setToast(`欢迎你，${identity.name}`);
    } catch { setToast("头像上传失败，请换一张试试"); }
  };

  const browse = () => { setVisitor(null); setGate(false); setEntryPhase("site"); setToast("已进入仅浏览模式"); };

  const closeVisitorLogin = () => { setGate(false); setEntryPhase("site"); };

  const openContact = () => { setMenu(false); setContactOpen(true); };

  const openVisitorLogin = useCallback(() => {
    setMenu(false);
    setVisitorLoginSession((current) => current + 1);
    setGate(true);
    void loadVisitorLogin();
  }, []);

  const logoutVisitor = () => {
    localStorage.removeItem("into-visitor");
    setVisitor(null);
    setGate(true);
    setToast("已退出当前访客身份，可以重新登录或仅浏览");
  };

  const toggleSound = async () => {
    musicAutoplayPendingRef.current = false;
    const playback = getMusicPlayback();
    if (!playback || !currentTrack) {
      setToast("管理员暂未添加背景音乐");
      return;
    }
    if (playback.wantsPlayback) {
      playback.pause();
      return;
    }
    try {
      await playback.play();
    } catch {
      setSoundOn(false);
      setToast("浏览器未能播放这首音乐，请稍后重试");
    }
  };

  const moveTrack = (direction: -1 | 1) => {
    if (!musicTracks.length) return;
    continueMusicRef.current = soundOn;
    setCurrentTrackIndex((current) => {
      const safeCurrent = current % musicTracks.length;
      if (musicPlaybackMode !== "shuffle" || direction === -1 || musicTracks.length < 2) return (safeCurrent + direction + musicTracks.length) % musicTracks.length;
      const candidates = musicTracks.map((_, index) => index).filter((index) => index !== safeCurrent);
      return candidates[Math.floor(Math.random() * candidates.length)];
    });
  };

  const playTrack = async (index: number) => {
    if (!musicTracks[index]) return;
    musicAutoplayPendingRef.current = false;
    setMusicListOpen(false);
    if (index !== safeTrackIndex) {
      continueMusicRef.current = true;
      setCurrentTrackIndex(index);
      return;
    }
    const playback = getMusicPlayback();
    if (!playback) return;
    try {
      await playback.play(true);
    } catch {
      setSoundOn(false);
      setToast("浏览器未能播放这首音乐，请稍后重试");
    }
  };

  const selectMusicPlaybackMode = (mode: MusicPlaybackMode) => {
    setMusicPlaybackMode(mode);
    localStorage.setItem("into-music-playback-mode", mode);
  };

  const handleTrackEnded = () => {
    const audio = audioRef.current;
    if ((musicPlaybackMode === "repeat-one" || musicTracks.length === 1) && audio) {
      void getMusicPlayback()?.play(true).catch(() => setSoundOn(false));
      return;
    }
    continueMusicRef.current = true;
    moveTrack(1);
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!visitor) { setGate(true); return setToast("领取游客证后才能留言"); }
    if (!commentText.trim()) return;
    try {
      const image = commentImage ? await upload(commentImage) : "";
      if (serverOnline) {
        await request("/api/comments", { method: "POST", body: JSON.stringify({ nickname: visitor.name, avatar: visitor.avatar, text: commentText, image, parent_id: reply?.id || null }) });
        const fresh = await request("/api/comments"); setComments(fresh.comments || []);
      } else {
        setComments((items) => [{ id: Date.now(), nickname: visitor.name, avatar: visitor.avatar, text: commentText, image, likes: 0, created_at: new Date().toISOString(), reply_to: reply?.nickname }, ...items]);
      }
      setCommentText(""); setCommentImage(""); setReply(null); setToast("你的声音已经留在这里了");
    } catch (error) { setToast(error instanceof Error ? error.message : "留言发送失败"); }
  };

  const like = async (comment: CommentItem) => {
    if (comment.liked) return;
    setComments((items) => items.map((item) => item.id === comment.id ? { ...item, liked: true, likes: item.likes + 1 } : item));
    if (serverOnline) request(`/api/comments/${comment.id}/like`, { method: "POST", body: "{}" }).catch(() => undefined);
  };

  const sendSubmission = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const image = submission.image ? await upload(submission.image) : "";
      if (serverOnline) await request("/api/submissions", { method: "POST", body: JSON.stringify({ nickname: visitor?.name || "匿名访客", email: submission.email, title: submission.title, body: submission.body, image }) });
      setSubmission({ email: "", title: "", body: "", image: "" }); setSubmissionOpen(false); setToast("故事已经送到站长的投稿信箱");
    } catch (error) { setToast(error instanceof Error ? error.message : "投稿失败"); }
  };

  const homeCardElements: Record<HomeCardImageKey, ReactNode> = {
    home_card_story_image: <motion.a className="ix-bento-card is-story" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_story_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/stories" onClick={followArchiveLink("/stories")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.story} crop={bentoCrops.home_card_story_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><BookOpen size={18} /> 青春故事集</span></p><h2>平凡的日子<br />闪着光</h2><span><span className="ix-bento-contrast-ink">{storyMemories.length} 篇故事 · 进入故事集 <ArrowRight size={17} /></span></span></div></motion.a>,
    home_card_memory_image: <motion.a className="ix-bento-card is-river" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_memory_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/memory" onClick={openMemoryRiver} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.memory} crop={bentoCrops.home_card_memory_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><Box size={18} /> 3D 粒子树</span></p><h2>让散落的光<br />重新流动</h2><span><span className="ix-bento-contrast-ink">进入 3D 粒子树 <ArrowRight size={17} /></span></span></div></motion.a>,
    home_card_timeline_image: <motion.a className="ix-bento-card is-timeline" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_timeline_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/timeline" onClick={followArchiveLink("/timeline")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.timeline} crop={bentoCrops.home_card_timeline_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><Clock3 size={18} /> 时间线</span></p><h3>按时间，重走我们的青春轨迹。</h3><span><span className="ix-bento-contrast-ink">2023 — 2026 <ArrowRight size={16} /></span></span></div></motion.a>,
    home_card_campus_image: <motion.a className="ix-bento-card is-fragments" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_campus_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/campus" onClick={followArchiveLink("/campus")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.campus} crop={bentoCrops.home_card_campus_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><ImageIcon size={18} /> 校园碎片</span></p><h3>那些被定格的瞬间，拼成独一无二的我们。</h3><span><span className="ix-bento-contrast-ink">查看校园片段 <ArrowRight size={16} /></span></span></div></motion.a>,
    home_card_notes_image: <motion.a className="ix-bento-card is-notes" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_notes_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/notes" onClick={followArchiveLink("/notes")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.notes} crop={bentoCrops.home_card_notes_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><MessageSquareText size={18} /> 随手记</span></p><h3>一些正在发生的心事，一些想对未来说的话。</h3><span><span className="ix-bento-contrast-ink">查看随手记录 <ArrowRight size={16} /></span></span></div></motion.a>,
    home_card_about_image: <motion.a className="ix-bento-card is-about" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_about_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/about" onClick={followArchiveLink("/about")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.about} crop={bentoCrops.home_card_about_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><Info size={18} /> 关于我们</span></p><h2>记录校园日常，<br />收藏每一次心动。</h2><span><span className="ix-bento-contrast-ink">了解 我的记忆档案 <ArrowRight size={17} /></span></span></div></motion.a>,
    home_card_messages_image: <motion.a className="ix-bento-card is-messages" style={{ "--home-card-aspect": homeCardAspectRatioNumber(bentoAspects.home_card_messages_image || settings.home_card_aspect_ratio) } as CSSProperties} href="/messages" onClick={followArchiveLink("/messages")} onPointerMove={moveCardSpotlight} onPointerLeave={settleCardSpotlight} onPointerCancel={settleCardSpotlight}><BentoArtwork src={bentoImages.messages} crop={bentoCrops.home_card_messages_image} /><span className="ix-bento-spotlight" aria-hidden="true" /><div><p><span className="ix-bento-contrast-ink"><MessageSquareText size={18} /> 留言操场</span></p><h3>把此刻的声音，留给未来某一天。</h3><span><span className="ix-bento-contrast-ink">进入留言操场 <ArrowRight size={16} /></span></span></div></motion.a>,
  };

  return (
    <main className={`ix-site is-home-tone-${homeBackgroundTone}${entryPhase !== "site" ? " is-entry-blocking" : ""}`} style={siteStyle}>
      <div className="ix-site-content" aria-hidden={entryPhase !== "site"}>
      <ParticleField active={entryPhase === "site" && !(riverOpen && isDesktopGalaxyClient())} />
      <div className="ix-noise" aria-hidden="true" />
      <div className="ix-archive-shell">
      <aside className="ix-archive-profile" aria-label="固定青春档案卡">
        <div className="ix-profile-portrait"><img src={normalizeHomeVisualAsset(settings.home_profile_avatar, "/assets/demo-intro.svg") || "/assets/demo-intro.svg"} alt="MEMORY 青春档案头像" decoding="async" /></div>
        <p className="ix-profile-hand">那些年，<br />风也记得我们。</p>
        <button type="button" className="ix-profile-visitor" onClick={openVisitorLogin} aria-haspopup="dialog">
          <span>{visitor?.avatar?.startsWith("/") ? <img src={visitor.avatar} alt="访客头像" /> : visitor?.avatar || <UserRound size={20} strokeWidth={1.8} />}</span>
          <span><strong>{visitor ? `欢迎回来，${visitor.name}` : "欢迎来到，MEMORY"}</strong><small>{visitor ? "访客身份已同步" : "可领取一张专属游客证"}</small></span>
        </button>
        <div className="ix-profile-title"><span>MY MEMORY ARCHIVE</span><strong>{settings.site_title || "我的记忆档案"}</strong></div>
        <p className="ix-profile-copy">记录平凡的日子，<br />也收藏闪光的青春。</p>
        <div className="ix-profile-edition"><span>VOL. 01</span><i /><span>2026.09.12</span></div>
        <div className="ix-profile-stats" aria-live="polite">
          <div><strong>{stats.online ? stats.media_count : displayMemories.length}</strong><span>已收录内容</span></div>
          <div><strong>{stats.page_views.toLocaleString("zh-CN")}</strong><span>真实访问次数</span></div>
          <div><strong className={stats.online ? "is-online" : "is-offline"}>{stats.online ? "在线" : "离线"}</strong><span>服务器状态</span></div>
        </div>
        <motion.button type="button" className="ix-profile-enter" onClick={openContact}>联系 <ArrowRight size={18} /></motion.button>
        <div className="ix-profile-tags" aria-label="档案标签"><span>校园</span><span>朋友</span><span>黄昏</span><span>心事</span></div>
        <p className="ix-profile-foot">A LIVING ARCHIVE OF OUR YOUTH</p>
      </aside>

      <div className="ix-archive-content">
      <header className="ix-header">
        <div className="ix-header-leading">
          {currentRoute === "/" ? <ArchiveHomeLink className="ix-brand" onClick={followArchiveLink("/")}><span>MA</span><strong>{settings.site_title}</strong></ArchiveHomeLink>
            : <ArchiveHomeLink className="ix-header-home" onClick={followArchiveLink("/")} aria-label="返回首页"><ArrowRight size={15} aria-hidden="true" /><span>返回首页</span></ArchiveHomeLink>}
        </div>
        <nav className={menu ? "open" : ""}>{archiveNavigation.map((item) => item.path === "/memory" ? <a key={item.path} href={item.path} className={currentRoute === item.path ? "is-active" : ""} onClick={openMemoryRiver}>{item.label}</a> : <a key={item.path} href={item.path} className={currentRoute === item.path ? "is-active" : ""} onClick={followArchiveLink(item.path)}>{item.label}</a>)}{!visitor && <button type="button" className="ix-mobile-login" onClick={openVisitorLogin}>访客登录</button>}</nav>
        <div className="ix-header-actions">
          <div ref={musicPlayerRef} className={`ix-music-player${soundOn ? " is-playing" : ""}${currentTrack ? "" : " is-empty"}${musicListOpen ? " is-open" : ""}`} aria-label="网站音乐播放器">
            {/* Background music has no spoken caption content. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} src={currentTrackUrl} preload="metadata" onEnded={handleTrackEnded} />
            <button type="button" className="ix-music-copy" onClick={() => setMusicListOpen((open) => !open)} aria-expanded={musicListOpen} aria-controls="ix-music-list" aria-label={musicListOpen ? "收起音乐列表" : "展开音乐列表"}><Music2 size={13} aria-hidden="true" /><span title={currentTrack?.name || "暂无歌曲"}>{currentTrack?.name || "暂无歌曲"}</span><small>{musicTracks.length ? `${safeTrackIndex + 1}/${musicTracks.length}` : "0/0"}</small><ChevronDown className="ix-music-chevron" size={12} aria-hidden="true" /></button>
            <div className="ix-music-controls"><button type="button" onClick={() => moveTrack(-1)} disabled={!currentTrack} aria-label="播放上一首"><SkipBack size={14} /></button><button type="button" className="ix-music-toggle" onClick={() => void toggleSound()} disabled={!currentTrack} aria-label={soundOn ? "暂停音乐" : "播放音乐"}>{soundOn ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button type="button" onClick={() => moveTrack(1)} disabled={!currentTrack} aria-label="播放下一首"><SkipForward size={14} /></button><Volume2 className="ix-music-volume" size={13} aria-label={`默认音量 ${musicVolume}%`} /></div>
            <AnimatePresence>
              {musicListOpen && <motion.div id="ix-music-list" className="ix-music-list" role="dialog" aria-label="音乐列表" initial={{ opacity: 0, y: -7, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: .98 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
                <div className="ix-music-list-head"><div><ListMusic size={15} /><strong>音乐列表</strong><span>{musicTracks.length} 首</span></div><button type="button" onClick={() => setMusicListOpen(false)} aria-label="关闭音乐列表"><X size={14} /></button></div>
                <div className="ix-music-modes" aria-label="播放方式">
                  <button type="button" className={musicPlaybackMode === "sequential" ? "is-active" : ""} onClick={() => selectMusicPlaybackMode("sequential")} aria-pressed={musicPlaybackMode === "sequential"}><ListMusic size={13} />顺序</button>
                  <button type="button" className={musicPlaybackMode === "shuffle" ? "is-active" : ""} onClick={() => selectMusicPlaybackMode("shuffle")} aria-pressed={musicPlaybackMode === "shuffle"}><Shuffle size={13} />随机</button>
                  <button type="button" className={musicPlaybackMode === "repeat-one" ? "is-active" : ""} onClick={() => selectMusicPlaybackMode("repeat-one")} aria-pressed={musicPlaybackMode === "repeat-one"}><Repeat1 size={13} />单曲循环</button>
                </div>
                <div className="ix-music-tracks">
                  {musicTracks.length ? musicTracks.map((track, index) => <button type="button" key={track.id} className={index === safeTrackIndex ? "is-current" : ""} onClick={() => void playTrack(index)} aria-label={`播放 ${track.name}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{track.name}</strong>{index === safeTrackIndex && soundOn ? <span className="ix-music-bars" aria-label="正在播放"><i /><i /><i /></span> : index === safeTrackIndex ? <Check size={13} aria-label="当前歌曲" /> : <Play size={12} aria-hidden="true" />}</button>) : <p className="ix-music-list-empty">管理员暂未添加音乐</p>}
                </div>
              </motion.div>}
            </AnimatePresence>
          </div>
          <button type="button" className={`ix-identity${visitor ? "" : " is-guest"}`} onClick={openVisitorLogin} aria-label={visitor ? `打开 ${visitor.name} 的身份选择` : "打开游客身份选择"} aria-haspopup="dialog">{visitor ? <><span>{visitor.avatar.startsWith("/") ? <img src={visitor.avatar} alt="头像" /> : visitor.avatar}</span>{visitor.name}</> : <><UserRound size={16} /> 游客证</>}</button>
          <button type="button" className="ix-menu" onClick={() => setMenu(!menu)} aria-label={menu ? "关闭导航菜单" : "打开导航菜单"}>{menu ? <X size={18} /> : <MenuIcon size={18} />}</button>
        </div>
      </header>

      <div className={`ix-scroll-pane is-route-${currentRoute.slice(1) || "home"}`} ref={contentScrollRef}>

      <AnimatePresence initial={false} mode="wait" onExitComplete={() => contentScrollRef.current?.scrollTo({ top: 0, behavior: "auto" })}>
      <motion.div
        key={currentRoute}
        className={`ix-route-stage${currentRoute === "/" ? " is-home" : " is-secondary"}`}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: .992, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -7, scale: .996, filter: "blur(7px)", transition: { duration: .18, ease: [.4, 0, 1, 1] } }}
        transition={{ duration: reduceMotion ? 0 : .38, ease: [.16, 1, .3, 1] }}
      >
      {currentRoute === "/" && <>
      <section className={`ix-hero is-art-${heroArtStyle} is-motion-${heroMotionLevel}${entryPhase === "site" ? " is-active" : ""}`} id="home">
        <div className="ix-hero-media" onPointerMove={moveHeroCollage} onPointerLeave={settleHeroCollage}>
          {homeHeroImage ? <img src={homeHeroImage} alt="校园青春主视觉" decoding="async" /> : <MemoryVisual memory={heroMemories[0]} alt="校园青春主视觉" />}
          <div className="ix-hero-shade" aria-hidden="true" />
          {showHeroCaptions && <div className="ix-hero-caption-panel"><span>{settings.home_hero_caption_kicker || "CAMPUS · FRIENDS · SUNSET"}</span><strong>{settings.home_hero_caption_title || heroMemories[0].title}</strong></div>}
        </div>
        <div className="ix-hero-copy">
          <p className="ix-kicker"><span /> {heroCopy.kicker}</p>
          <h1 className="ix-copy-title" data-copy-size={heroCopy.titleSize} data-copy-weight={heroCopy.titleWeight}>{heroCopy.title}<em>{heroCopy.accent}</em></h1>
          {heroCopy.subtitle && <p className="ix-copy-subtitle">{heroCopy.subtitle}</p>}
          {heroCopy.extraEnabled && heroCopy.extraText && <p className="ix-copy-extra">{heroCopy.extraText}</p>}
          {showHeroCaptions && <div className="ix-hero-edition" aria-hidden="true"><span>VOL. 01 / 2026</span><i /><span>A LIVING ARCHIVE</span></div>}
          <div className="ix-hero-buttons"><motion.a href="/stories" onClick={followArchiveLink("/stories")}>{settings.hero_primary_button || "开始翻阅"} <ArrowDownRight size={19} /></motion.a><motion.button onClick={openMemoryRiver}>{visibleHeroSecondaryButton(settings.hero_secondary_button)} <Box size={18} /></motion.button></div>
        </div>
      </section>

      <section className="ix-bento-overview" aria-label="青春档案栏目入口" data-card-count={visibleHomeCardCount} style={{ "--home-card-aspect": bentoAspect } as CSSProperties}>
        {orderedHomeCardKeys.map((key) => visibleHomeCards[key] ? <Fragment key={key}>{homeCardElements[key]}</Fragment> : null)}
      </section>
      <footer className="ix-footer ix-home-footer"><strong>{settings.footer_title?.trim() === "我的记忆档案" || !settings.footer_title?.trim() ? <>MEMORY <em>/</em> 记忆档案</> : settings.footer_title}</strong>{settings.footer_subtitle?.trim() && <p className="ix-footer-subtitle">{settings.footer_subtitle.trim()}</p>}<div><a className="ix-admin-link" href="/admin">管理入口</a><span>© 2026 YOUR MEMORY ARCHIVE</span></div></footer>
      </>}

      {currentRoute !== "/" && <>
      <div className="ix-route-toolbar"><span>{currentRoute === "/stories" ? "STORIES / 青春故事集" : currentRoute === "/memory" ? "MEMORY / 3D 粒子树" : currentRoute === "/timeline" ? "TIMELINE / 青春时间线" : currentRoute === "/campus" ? "CAMPUS / 校园碎片" : currentRoute === "/notes" ? "NOTES / 随手记" : currentRoute === "/about" ? "ABOUT / 关于我们" : "MESSAGES / 留言操场"}</span></div>
      {currentRoute === "/campus" && <section className="ix-campus-page"><div className="ix-section-head compact"><div><span className="ix-number">03</span><p className="ix-kicker"><span /> {campusCopy.kicker}</p></div><div><h2 className="ix-copy-title" data-copy-size={campusCopy.titleSize} data-copy-weight={campusCopy.titleWeight}>{campusCopy.title}<br /><em>{campusCopy.accent}</em></h2>{campusCopy.subtitle && <p className="ix-copy-subtitle">{campusCopy.subtitle}</p>}{campusCopy.extraEnabled && campusCopy.extraText && <p className="ix-copy-extra">{campusCopy.extraText}</p>}</div></div><div className="ix-campus-grid">{homepageMemories.map((memory, index) => <figure key={`${memory.url}-${index}`}><MemoryVisual memory={memory} alt={memory.title} /><figcaption><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{memory.title}</strong><small>{memoryMeta(memory)}</small></div></figcaption></figure>)}</div></section>}
      {currentRoute === "/notes" && <section className="ix-notes-page"><div className="ix-route-empty"><MessageSquareText size={30} /><span>PERSONAL NOTES</span><h1>{settings.notes_title || "随手记"}</h1><p>{settings.notes_body || "这里会慢慢收集校园里真实发生的片段。"}</p><a href="/messages" onClick={followArchiveLink("/messages")}>去留言操场 <ArrowRight size={17} /></a></div></section>}
      </>}

      {currentRoute !== "/" && <>
      <section className="ix-stories" id="stories"><div className="ix-section-head"><div><span className="ix-number">01</span><p className="ix-kicker"><span /> {storiesCopy.kicker}</p></div><h2 className="ix-copy-title" data-copy-size={storiesCopy.titleSize} data-copy-weight={storiesCopy.titleWeight}>{storiesCopy.title}<br /><em>{storiesCopy.accent}</em></h2><div className="ix-copy-description">{storiesCopy.subtitle && <p className="ix-copy-subtitle">{storiesCopy.subtitle}</p>}{storiesCopy.extraEnabled && storiesCopy.extraText && <p className="ix-copy-extra">{storiesCopy.extraText}</p>}</div></div><div className="ix-story-grid">{visibleStories.map((memory, index) => <article key={`${memory.url}-${index}`} className={`ix-story-card tone-${index % 4 + 1}`}><div><button type="button" className="ix-story-image-open" aria-label={`放大图片：${memory.title}`} onClick={() => setExpandedStory(memory)}><MemoryVisual memory={memory} alt={memory.title} /></button><span>{String(index + 1).padStart(2, "0")}</span></div><footer><section><h3>{memory.title}</h3><p>{memoryMeta(memory)}</p></section><button type="button" aria-label={`阅读故事：${memory.title}`} onClick={() => setSelectedStory(memory)}><span className="micro-arrow">↗</span></button></footer></article>)}</div>{storyMemories.length === 0 && <p className="ix-story-empty">故事正在整理中，稍后再来看看。</p>}{storyMemories.length > 4 && <button className="ix-story-more" type="button" onClick={() => setShowAllStories((current) => !current)}>{showAllStories ? "收起部分内容" : `展开更多 · ${storyMemories.length - 4}`}</button>}</section>

      <section className="ix-portal" onPointerMove={movePortalSpotlight} onPointerLeave={(event) => { event.currentTarget.style.setProperty("--spot-x", "50%"); event.currentTarget.style.setProperty("--spot-y", "52%"); event.currentTarget.style.setProperty("--terrain-rx", "0deg"); event.currentTarget.style.setProperty("--terrain-ry", "0deg"); }}><div className="ix-portal-terrain" aria-hidden="true" /><div className="ix-portal-reveal" aria-hidden="true" /><div className="ix-portal-glow" /><p className="ix-kicker"><span /> {portalCopy.kicker}</p><h2 className="ix-copy-title" data-copy-size={portalCopy.titleSize} data-copy-weight={portalCopy.titleWeight}>{portalCopy.title}<br /><em>{portalCopy.accent}</em></h2>{portalCopy.subtitle && <p className="ix-copy-subtitle">{portalCopy.subtitle}</p>}{portalCopy.extraEnabled && portalCopy.extraText && <p className="ix-copy-extra">{portalCopy.extraText}</p>}<button onClick={openMemoryRiver}>进入粒子树 <span className="micro-arrow">↗</span></button><div className="ix-portal-track"><i /><i /><i /><i /><i /></div></section>
      <section className="ix-timeline" id="timeline"><div className="ix-section-head compact"><div><span className="ix-number">02</span><p className="ix-kicker"><span /> {timelineCopy.kicker}</p></div><div><h2 className="ix-copy-title" data-copy-size={timelineCopy.titleSize} data-copy-weight={timelineCopy.titleWeight}>{timelineCopy.title}<br /><em>{timelineCopy.accent}</em></h2>{timelineCopy.subtitle && <p className="ix-copy-subtitle">{timelineCopy.subtitle}</p>}{timelineCopy.extraEnabled && timelineCopy.extraText && <p className="ix-copy-extra">{timelineCopy.extraText}</p>}</div></div><TimelineJourney items={timelineItems} active={currentRoute === "/timeline"} /></section>

      <section className="ix-about" id="about"><div className="ix-about-image">{normalizeHomeVisualAsset(settings.about_page_image) ? <img src={normalizeHomeVisualAsset(settings.about_page_image)} alt="关于我们的校园图片" decoding="async" /> : <MemoryVisual memory={displayMemories[4] || defaultMemories[4]} alt="校园里的青春片段" />}<span>KEEP<br />YOUNG ✦</span></div><div><p className="ix-kicker"><span /> {aboutCopy.kicker}</p><h2 className="ix-copy-title" data-copy-size={aboutCopy.titleSize} data-copy-weight={aboutCopy.titleWeight}>{aboutCopy.title}<br /><em>{aboutCopy.accent}</em></h2>{aboutCopy.subtitle && <p className="ix-copy-subtitle">{aboutCopy.subtitle}</p>}{aboutCopy.extraEnabled && aboutCopy.extraText && <p className="ix-copy-extra">{aboutCopy.extraText}</p>}<div className="ix-tags"><span>摄影</span><span>校园日常</span><span>音乐</span><span>胡思乱想</span></div><div className="ix-about-actions"><button onClick={() => setSubmissionOpen(true)}>和我交换一个故事 <span className="micro-arrow">→</span></button><div className="ix-about-bubbles" aria-label="开源与联系">{normalizeContactLink(settings.github_url) && <a href={normalizeContactLink(settings.github_url)} target="_blank" rel="noreferrer"><small>OPEN SOURCE</small>GitHub 开源代码 <span className="micro-arrow">↗</span></a>}{contactEmailHref && <a href={contactEmailHref}><small>CONTACT</small>邮箱联系 <span className="micro-arrow">↗</span></a>}{normalizeContactLink(settings.contact_douyin_url) && <a href={normalizeContactLink(settings.contact_douyin_url)} target="_blank" rel="noreferrer"><small>SOCIAL</small>抖音主页 <span className="micro-arrow">↗</span></a>}{customContactLinks.map(({ label, url }, index) => <a key={`${label}-${index}`} href={url} target="_blank" rel="noopener noreferrer"><small>LINK</small>{label} <span className="micro-arrow">↗</span></a>)}</div></div></div></section>

      <section className="ix-comments" id="comments"><div className="ix-comment-head"><div><p className="ix-kicker"><span /> {commentsCopy.kicker}</p><h2 className="ix-copy-title" data-copy-size={commentsCopy.titleSize} data-copy-weight={commentsCopy.titleWeight}>{commentsCopy.title}<br /><em>{commentsCopy.accent}</em></h2>{commentsCopy.extraEnabled && commentsCopy.extraText && <p className="ix-copy-extra">{commentsCopy.extraText}</p>}</div>{commentsCopy.subtitle && <p className="ix-copy-subtitle">{commentsCopy.subtitle}</p>}</div><form className="ix-composer" onSubmit={submitComment}><div className="ix-avatar">{visitor?.avatar.startsWith("/") ? <img src={visitor.avatar} alt="头像" /> : visitor?.avatar || "○"}</div><div>{reply && <p className="ix-replying">正在回复 @{reply.nickname} <button type="button" onClick={() => setReply(null)}>×</button></p>}<textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} onFocus={() => !visitor && setGate(true)} placeholder={visitor ? "写下此刻想说的话……" : "领取游客证后，可以在这里留言……"} maxLength={500} />{commentImage && <img className="ix-upload-preview" src={commentImage} alt="待上传图片" />}<footer><label>▧ 添加图片<input type="file" accept="image/*" onChange={async (event) => event.target.files?.[0] && setCommentImage(await fileToData(event.target.files[0]))} /></label><span>{commentText.length}/500</span><button type="submit">发送留言 <span className="micro-arrow">↗</span></button></footer></div></form><div className="ix-comment-list">{comments.map((comment) => <article key={comment.id}><div className="ix-avatar">{comment.avatar.startsWith("/") ? <img src={comment.avatar} alt="游客头像" /> : comment.avatar}</div><div><header><strong>{comment.nickname}</strong><time>{formatTime(comment.created_at)}</time></header>{comment.reply_to && <small>回复 @{comment.reply_to}</small>}<p>{comment.text}</p>{comment.image && <img className="ix-comment-image" src={comment.image} alt="留言附图" />}<footer><button className={comment.liked ? "liked" : ""} onClick={() => like(comment)}>♡ {comment.likes}</button><button onClick={() => visitor ? setReply(comment) : setGate(true)}>回复</button></footer></div></article>)}</div></section>

      <footer className="ix-footer"><strong>{settings.footer_title?.trim() === "我的记忆档案" || !settings.footer_title?.trim() ? <>MEMORY <em>/</em> 记忆档案</> : settings.footer_title}</strong><p>{settings.footer_subtitle?.trim() || <>愿我们永远有记录生活的热情，<br />也永远有重新出发的勇气。</>}</p><div><a className="ix-admin-link" href="/admin">管理入口</a><span>© 2026 YOUR MEMORY ARCHIVE</span></div></footer>
      </>}
      </motion.div>
      </AnimatePresence>
      </div>
      </div>
      </div>
      </div>

      {entryPhase === "booting" && <div className="ix-identity-boot" aria-hidden="true" />}
      {(entryPhase === "intro-playing" || entryPhase === "intro-exiting") && <LandingIntro settings={settings} nodes={introNodes} onExitStart={prepareWelcome} onComplete={completeIntro} />}

      {gate && <div className={`ix-welcome-layer${entryPhase !== "site" ? " is-entry-layer" : ""}`}><Suspense fallback={<div className="ix-identity-boot" aria-hidden="true" />}><OpenSourceVisitorLogin key={visitorLoginSession} initialData={visitor} onLoginSuccess={enter} onBrowse={browse} onClose={closeVisitorLogin} onLogout={logoutVisitor} /></Suspense></div>}

      {expandedStory && <MediaLightbox src={expandedStory.url} title={expandedStory.title} meta={memoryMeta(expandedStory)} video={isVideoUrl(expandedStory.url)} onClose={() => setExpandedStory(null)} />}
      <AnimatePresence initial={false}>
      {selectedStory && <motion.div className="ix-modal ix-story-modal" onClick={() => setSelectedStory(null)} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.article className="ix-story-detail" role="dialog" aria-modal="true" aria-labelledby="story-detail-title" onClick={(event) => event.stopPropagation()} initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .99 }}><button type="button" className="ix-story-detail-close" onClick={() => setSelectedStory(null)} aria-label="关闭故事">×</button><div className="ix-story-detail-image"><button type="button" className="ix-story-detail-expand" onClick={() => setExpandedStory(selectedStory)} aria-label={`放大图片：${selectedStory.title}`}>{!isVideoUrl(selectedStory.url) && <img className="ix-story-detail-backdrop" src={selectedStory.url} alt="" aria-hidden="true" />}<MemoryVisual memory={selectedStory} alt={selectedStory.title} full /></button></div><div className="ix-story-detail-copy"><span>记忆 / 故事合集</span><h2 id="story-detail-title">{selectedStory.title}</h2><small>{memoryMeta(selectedStory)}</small><p>{selectedStory.body || "这段记忆还没有写下正文，但照片已经替我们保存了当时的光。"}</p></div></motion.article></motion.div>}
      {contactOpen && <motion.div className="ix-modal ix-contact-modal" onClick={() => setContactOpen(false)} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .24 }}><motion.section className="ix-contact-panel" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={(event) => event.stopPropagation()} initial={reduceMotion ? false : { opacity: 0, y: 16, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .99 }} transition={{ duration: reduceMotion ? 0 : .3, ease: [.22, .7, .18, 1] }}><button type="button" className="ix-close" onClick={() => setContactOpen(false)} aria-label="关闭联系方式">×</button><p className="ix-kicker"><span /> CONTACT / MEMORY</p><h2 id="contact-title">和我们保持联系</h2><p>欢迎通过下面的方式，继续了解 我的记忆档案。</p><div className="ix-contact-links">{contactEmailHref && <a href={contactEmailHref}><small>EMAIL</small><strong>{contactEmail}</strong><span className="micro-arrow">↗</span></a>}{normalizeContactLink(settings.github_url) && <a href={normalizeContactLink(settings.github_url)} target="_blank" rel="noreferrer"><small>GITHUB</small><strong>开源代码仓库</strong><span className="micro-arrow">↗</span></a>}{normalizeContactLink(settings.contact_douyin_url) && <a href={normalizeContactLink(settings.contact_douyin_url)} target="_blank" rel="noreferrer"><small>抖音</small><strong>抖音主页</strong><span className="micro-arrow">↗</span></a>}{customContactLinks.map(({ label, url }, index) => <a key={`${label}-${index}`} href={url} target="_blank" rel="noopener noreferrer"><small>LINK</small><strong>{label}</strong><span className="micro-arrow">↗</span></a>)}{!contactEmailHref && !normalizeContactLink(settings.github_url) && !normalizeContactLink(settings.contact_douyin_url) && customContactLinks.length === 0 && <p className="ix-contact-empty">站长暂未公开联系方式。</p>}</div></motion.section></motion.div>}
      {submissionOpen && <motion.div className="ix-modal" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28 }}><motion.form className="ix-submission" onSubmit={sendSubmission} initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.99 }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.22, 0.7, 0.18, 1] }}><button type="button" className="ix-close" onClick={() => setSubmissionOpen(false)}>×</button><p className="ix-kicker"><span /> STORY DROP</p><h2>把你的故事，<br /><em>也放进时间里</em></h2><input required placeholder="故事标题" value={submission.title} onChange={(event) => setSubmission({ ...submission, title: event.target.value })} /><input type="email" placeholder="你的联系邮箱（选填）" value={submission.email} onChange={(event) => setSubmission({ ...submission, email: event.target.value })} autoComplete="email" /><textarea required placeholder="写下你想分享的校园片段……" value={submission.body} onChange={(event) => setSubmission({ ...submission, body: event.target.value })} /><label className="ix-drop">＋ 添加一张故事照片<input type="file" accept="image/*" onChange={async (event) => event.target.files?.[0] && setSubmission({ ...submission, image: await fileToData(event.target.files[0]) })} /></label>{contactEmailHref && <a className="ix-contact-email" href={contactEmailHref}>也可以直接发送邮件到 {contactEmail} <span className="micro-arrow">↗</span></a>}<button type="submit">投递到站长信箱 <span className="micro-arrow">↗</span></button></motion.form></motion.div>}
      </AnimatePresence>
      {riverOpen && <MemoryRiver memories={threeDimensionalMemories} origin={riverOrigin} galaxySettings={galaxySettings} onClose={closeMemoryRiver} />}
      {entryPhase === "site" && !gate && !contactOpen && !submissionOpen && !selectedStory && !expandedStory && <Suspense fallback={null}><DesktopPet visitor={visitor} page={currentRoute === "/" ? "首页" : archiveNavigation.find(item => item.path === currentRoute)?.label || "记忆档案"} active={!riverOpen} /></Suspense>}
      <AnimatePresence initial={false}>{toast && <motion.div className="ix-toast" initial={reduceMotion ? false : { opacity: 0, y: 12, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 8, x: "-50%" }} transition={{ duration: reduceMotion ? 0 : 0.24 }}>✦ {toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
