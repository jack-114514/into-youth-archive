"use client";

import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const loadMemoryGalaxy = () => import("./MemoryGalaxy");
const MemoryGalaxy = lazy(loadMemoryGalaxy);
const OpenSourceVisitorLogin = lazy(() => import("./OpenSourceVisitorLogin"));

type Visitor = { name: string; avatar: string };
type Memory = { id?: number; url: string; video_url?: string; title: string; meta: string; body?: string; taken_at?: string; sort_order?: number; show_on_home?: number; show_in_3d?: number };
type TimelineItem = { date: string; title: string; text: string };
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
  { url: "/assets/demo-memory.svg", title: "示例青春片段", meta: "请在后台替换" },
];

const fallbackComments: CommentItem[] = [
  { id: 1, nickname: "一颗汽水糖", avatar: "🌤️", text: "看到这些照片，突然想起放学铃响以后，大家一起冲出教室的样子。", likes: 24, created_at: new Date().toISOString() },
  { id: 2, nickname: "晚风同学", avatar: "🌿", text: "这个网站好像一封慢慢打开的信。期待看到更多校园故事！", likes: 16, created_at: new Date().toISOString(), reply_to: "一颗汽水糖" },
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

function MemoryVisual({ memory, alt }: { memory: Memory; alt: string }) {
  return isVideoUrl(memory.url)
    ? <video src={memory.url} aria-label={alt} muted loop autoPlay playsInline preload="metadata" />
    : <img src={memory.url} alt={alt} />;
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const dots = Array.from({ length: 58 }, (_, index) => ({ x: (index * 83) % 1200, y: (index * 139) % 800, r: 1 + index % 3, speed: .09 + (index % 5) * .025 }));
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.7);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      dots.forEach((dot, index) => {
        dot.y -= dot.speed;
        if (dot.y < -10) dot.y = height + 10;
        const x = dot.x % Math.max(width, 1);
        const glow = context.createRadialGradient(x, dot.y, 0, x, dot.y, dot.r * 5);
        glow.addColorStop(0, index % 4 === 0 ? "rgba(255,169,91,.72)" : "rgba(165,225,255,.65)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = glow;
        context.beginPath(); context.arc(x, dot.y, dot.r * 5, 0, Math.PI * 2); context.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    resize(); draw(); window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="ix-particle-field" aria-hidden="true" />;
}

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
            {orbitMemories.map((memory, index) => <button key={`${memory.url}-${index}`} className="ix-orbit-memory" style={{ "--photo-angle": `${index * (360 / Math.max(orbitMemories.length, 1))}deg`, "--photo-y": `${-100 + (index % 3) * 112}px`, "--photo-y-mobile": `${-68 + (index % 3) * 76}px`, "--photo-delay": `${-index * .4}s` } as CSSProperties} onClick={() => motionRef.current.moved < 8 && setActive(memory)}><img src={memory.url} alt={memory.title} /><span>{String(index + 1).padStart(2, "0")}</span><strong>{memory.title}</strong></button>)}
          </div>
        </div>
      </div>
      <div className="ix-river-title"><span>THE LIGHT REMEMBERS</span><strong>会发光的青春</strong><small>每一张照片，都在记忆树旁慢慢旋转</small></div>
      {active && <div className="ix-memory-detail"><button onClick={() => setActive(null)}>×</button><img src={active.url} alt={active.title} /><div><span>{memoryMeta(active)}</span><h2>{active.title}</h2><p>这一段故事的正文，可以稍后在管理后台里慢慢补上。</p></div></div>}
    </div>
  );
}

function MemoryRiver({ memories, onClose, origin }: { memories: Memory[]; onClose: () => void; origin: { x: number; y: number } }) {
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
  return <>{phase !== "expanding" && <Suspense fallback={null}><MemoryGalaxy memories={memories} onClose={onClose} revealStarted={revealStarted} onSceneReady={() => setSceneReady(true)} /></Suspense>}{phase !== "done" && <div className={`ix-galaxy-entry is-${phase}`} style={entryStyle}><div className="ix-galaxy-entry-copy"><span>MEMORY ARCHIVE / AWAKENING</span><strong>我们把散落的光，重新连成一棵树</strong><small>请稍候，记忆正在苏醒</small></div></div>}</>;
}

export default function ImmersiveHome() {
  const [intro, setIntro] = useState(true);
  const [introLoading, setIntroLoading] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [gate, setGate] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [memories, setMemories] = useState(defaultMemories);
  const [comments, setComments] = useState(fallbackComments);
  const [serverOnline, setServerOnline] = useState(false);
  const [settings, setSettings] = useState({ site_title: "INTO / 青春纪事", hero_title: "把青春留在风经过的地方", profile_text: "一个正在校园里认真生活的普通人。喜欢傍晚六点的风、窗边的位置，还有把一闪而过的瞬间变成很久很久的记忆。", timeline_items: JSON.stringify(defaultTimelineItems) });
  const [riverOpen, setRiverOpen] = useState(false);
  const [riverOrigin, setRiverOrigin] = useState({ x: 0, y: 0 });
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<{ context: AudioContext; gain: GainNode; oscillators: OscillatorNode[] } | null>(null);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState("");
  const [reply, setReply] = useState<CommentItem | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submission, setSubmission] = useState({ title: "", body: "", image: "" });
  const [showAllStories, setShowAllStories] = useState(false);

  const openMemoryRiver = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const star = event.currentTarget.querySelector("span");
    const rect = (star || event.currentTarget).getBoundingClientRect();
    setRiverOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    void loadMemoryGalaxy();
    setRiverOpen(true);
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

  const displayMemories = useMemo(() => memories.length ? memories : defaultMemories, [memories]);
  const homepageMemories = useMemo(() => displayMemories.filter((memory) => Number(memory.show_on_home ?? 1) === 1), [displayMemories]);
  const threeDimensionalMemories = useMemo(() => displayMemories.filter((memory) => Number(memory.show_in_3d ?? 1) === 1), [displayMemories]);
  const heroMemories = homepageMemories.length ? homepageMemories : defaultMemories.slice(0, 1);
  const visibleStories = homepageMemories.slice(0, showAllStories ? homepageMemories.length : 4);
  const timelineItems = useMemo(() => parseTimelineItems(settings.timeline_items), [settings.timeline_items]);

  useEffect(() => {
    const preloadTimer = window.setTimeout(() => { void loadMemoryGalaxy(); }, 900);
    return () => window.clearTimeout(preloadTimer);
  }, []);

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
    Promise.all([request("/api/content"), request("/api/comments")]).then(([content, commentData]) => {
      setServerOnline(true);
      if (content.settings) setSettings((current) => ({ ...current, ...content.settings }));
      if (content.media?.length) setMemories(content.media);
      setComments(commentData.comments || []);
    }).catch(() => setServerOnline(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!introLoading) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 900 : 3100;
    const startedAt = performance.now();
    let frame = 0;
    let finishTimer = 0;
    const update = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 2.25);
      setIntroProgress(Math.min(100, Math.round(eased * 100)));
      if (elapsed < 1) {
        frame = requestAnimationFrame(update);
        return;
      }
      setIntroLeaving(true);
      finishTimer = window.setTimeout(() => {
        setIntro(false);
        setGate(true);
        setIntroLoading(false);
        setIntroLeaving(false);
      }, reducedMotion ? 220 : 760);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(finishTimer);
    };
  }, [introLoading, visitor]);

  const beginIntroJourney = () => {
    if (introLoading) return;
    setIntroProgress(0);
    setIntroLoading(true);
  };

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
      setGate(false); setToast(`欢迎你，${identity.name}`);
    } catch { setToast("头像上传失败，请换一张试试"); }
  };

  const browse = () => { setVisitor(null); setGate(false); setToast("已进入仅浏览模式"); };

  const toggleSound = () => {
    if (soundOn && audioRef.current) {
      audioRef.current.gain.gain.setTargetAtTime(0, audioRef.current.context.currentTime, .4);
      setTimeout(() => { audioRef.current?.oscillators.forEach((node) => node.stop()); audioRef.current?.context.close(); audioRef.current = null; }, 900);
      setSoundOn(false); return;
    }
    const context = new AudioContext();
    const gain = context.createGain(); gain.gain.value = .018; gain.connect(context.destination);
    const frequencies = [174, 261.63, 392];
    const oscillators = frequencies.map((frequency, index) => { const node = context.createOscillator(); node.type = index === 0 ? "sine" : "triangle"; node.frequency.value = frequency; const sub = context.createGain(); sub.gain.value = index === 0 ? .7 : .18; node.connect(sub); sub.connect(gain); node.start(); return node; });
    audioRef.current = { context, gain, oscillators }; setSoundOn(true);
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
      if (serverOnline) await request("/api/submissions", { method: "POST", body: JSON.stringify({ nickname: visitor?.name || "匿名访客", title: submission.title, body: submission.body, image }) });
      setSubmission({ title: "", body: "", image: "" }); setSubmissionOpen(false); setToast("故事已经送到站长的投稿信箱");
    } catch (error) { setToast(error instanceof Error ? error.message : "投稿失败"); }
  };

  return (
    <main className="ix-site">
      <ParticleField />
      <div className="ix-noise" aria-hidden="true" />
      <header className="ix-header">
        <a href="#home" className="ix-brand"><span>IN</span><strong>{settings.site_title}</strong></a>
        <nav className={menu ? "open" : ""}><a href="#stories">校园片段</a><a href="#timeline">青春时间线</a><a href="#about">关于我</a><a href="#comments">留言操场</a></nav>
        <div className="ix-header-actions"><button onClick={toggleSound} aria-label="开关环境音乐">{soundOn ? "♫" : "♩"}</button><button className="ix-identity" onClick={() => setGate(true)}>{visitor ? <><span>{visitor.avatar.startsWith("/") ? <img src={visitor.avatar} alt="头像" /> : visitor.avatar}</span>{visitor.name}</> : "游客证"}</button><button className="ix-menu" onClick={() => setMenu(!menu)}>✦</button></div>
      </header>

      <section className="ix-hero" id="home">
        <div className="ix-hero-copy"><p className="ix-kicker"><span /> INTO THE DAYS WE SHINE</p><h1>{settings.hero_title.split("风经过")[0]}<em>风经过{settings.hero_title.split("风经过")[1] || "的地方"}</em></h1><p>这里收藏校园里的日常、朋友、黄昏与心事。<br />愿每一次打开，都像重新走进那年夏天。</p><div className="ix-hero-buttons"><a href="#stories">开始翻阅 <span>↘</span></a><button onClick={openMemoryRiver}>进入 3D 记忆河 <span>✦</span></button></div><div className="ix-counter"><div><strong>27</strong><span>青春片段</span></div><div><strong>{comments.length + 1204}</strong><span>次温柔路过</span></div><div><strong>NOW</strong><span>故事仍在继续</span></div></div></div>
        <div className="ix-campus-orbit"><div className="ix-orbit-ring ring-a" /><div className="ix-orbit-ring ring-b" /><div className="ix-orbit-core"><MemoryVisual memory={heroMemories[0]} alt="校园青春照片" /><span>SUMMER<br />MEMORY</span></div>{heroMemories.slice(1, 4).map((memory, index) => <div className={`ix-orbit-photo orbit-${index + 1}`} key={memory.url}><MemoryVisual memory={memory} alt={memory.title} /></div>)}<div className="ix-orbit-note">请把今天<br /><em>也记下来</em></div></div>
        <a className="ix-scroll" href="#stories">SCROLL <i /></a>
      </section>

      <section className="ix-stories" id="stories"><div className="ix-section-head"><div><span className="ix-number">01</span><p className="ix-kicker"><span /> MEMORY ARCHIVE</p></div><h2>记忆有自己的<br /><em>显影方式</em></h2><p>没有宏大的故事，只有被认真收藏的普通日子。每一张照片，都是时间偷偷留下的证词。</p></div><div className="ix-story-grid">{visibleStories.map((memory, index) => <article key={`${memory.url}-${index}`} className={`ix-story-card tone-${index % 4 + 1}`}><div><MemoryVisual memory={memory} alt={memory.title} /><span>{String(index + 1).padStart(2, "0")}</span></div><footer><section><h3>{memory.title}</h3><p>{memoryMeta(memory)}</p></section><button onClick={openMemoryRiver}>↗</button></footer></article>)}</div>{homepageMemories.length > 4 && <button className="ix-story-more" type="button" onClick={() => setShowAllStories((current) => !current)}>{showAllStories ? "收起部分内容" : `展开更多 · ${homepageMemories.length - 4}`}</button>}</section>

      <section className="ix-portal" onPointerMove={movePortalSpotlight} onPointerLeave={(event) => { event.currentTarget.style.setProperty("--spot-x", "50%"); event.currentTarget.style.setProperty("--spot-y", "52%"); event.currentTarget.style.setProperty("--terrain-rx", "0deg"); event.currentTarget.style.setProperty("--terrain-ry", "0deg"); }}><div className="ix-portal-terrain" aria-hidden="true" /><div className="ix-portal-reveal" aria-hidden="true" /><div className="ix-portal-glow" /><p className="ix-kicker"><span /> IMMERSIVE ARCHIVE</p><h2>照片不会停在相框里，<br /><em>它们会沿着时间继续发光。</em></h2><p>移动鼠标探索另一层光景，再走进原创的 3D 青春时间河。</p><button onClick={openMemoryRiver}>进入记忆河 <span>↗</span></button><div className="ix-portal-track"><i /><i /><i /><i /><i /></div></section>

      <section className="ix-timeline" id="timeline"><div className="ix-section-head compact"><div><span className="ix-number">02</span><p className="ix-kicker"><span /> MOMENTS</p></div><h2>一些不舍得<br /><em>忘记的片段</em></h2></div><div className="ix-time-list">{timelineItems.map((item, index) => <article key={`${item.date}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><time>{item.date}</time><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>

      <section className="ix-about" id="about"><div className="ix-about-image"><MemoryVisual memory={displayMemories[4] || defaultMemories[4]} alt="校园里的青春片段" /><span>KEEP<br />YOUNG ✦</span></div><div><p className="ix-kicker"><span /> ABOUT THE AUTHOR</p><h2>你好，<br />我是这个故事的<br /><em>记录者。</em></h2><p>{settings.profile_text}</p><div className="ix-tags"><span>摄影</span><span>校园日常</span><span>音乐</span><span>胡思乱想</span></div><button onClick={() => setSubmissionOpen(true)}>和我交换一个故事 <span>→</span></button></div></section>

      <section className="ix-comments" id="comments"><div className="ix-comment-head"><div><p className="ix-kicker"><span /> LEAVE A TRACE</p><h2>来过的话，<br /><em>留下一点声音吧</em></h2></div><p>陌生人的一句话，也可能成为某一天的好心情。<br />这里没有标准答案，真诚就好。</p></div><form className="ix-composer" onSubmit={submitComment}><div className="ix-avatar">{visitor?.avatar.startsWith("/") ? <img src={visitor.avatar} alt="头像" /> : visitor?.avatar || "○"}</div><div>{reply && <p className="ix-replying">正在回复 @{reply.nickname} <button type="button" onClick={() => setReply(null)}>×</button></p>}<textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} onFocus={() => !visitor && setGate(true)} placeholder={visitor ? "写下此刻想说的话……" : "领取游客证后，可以在这里留言……"} maxLength={500} />{commentImage && <img className="ix-upload-preview" src={commentImage} alt="待上传图片" />}<footer><label>▧ 添加图片<input type="file" accept="image/*" onChange={async (event) => event.target.files?.[0] && setCommentImage(await fileToData(event.target.files[0]))} /></label><span>{commentText.length}/500</span><button type="submit">发送留言 ↗</button></footer></div></form><div className="ix-comment-list">{comments.map((comment) => <article key={comment.id}><div className="ix-avatar">{comment.avatar.startsWith("/") ? <img src={comment.avatar} alt="游客头像" /> : comment.avatar}</div><div><header><strong>{comment.nickname}</strong><time>{formatTime(comment.created_at)}</time></header>{comment.reply_to && <small>回复 @{comment.reply_to}</small>}<p>{comment.text}</p>{comment.image && <img className="ix-comment-image" src={comment.image} alt="留言附图" />}<footer><button className={comment.liked ? "liked" : ""} onClick={() => like(comment)}>♡ {comment.likes}</button><button onClick={() => visitor ? setReply(comment) : setGate(true)}>回复</button></footer></div></article>)}</div></section>

      <footer className="ix-footer"><strong>INTO <em>/</em> 青春纪事</strong><p>愿我们永远有记录生活的热情，<br />也永远有重新出发的勇气。</p><div><span>© 2026 INTO VA LABS</span><a href="#home">回到顶部 ↑</a><a href="/admin">管理入口</a></div></footer>

      {!identityLoaded && <div className="ix-identity-boot" aria-hidden="true" />}
      {identityLoaded && intro && (
        <div className={`ix-intro${introLoading ? " is-loading" : ""}${introLeaving ? " is-leaving" : ""}`}>
          <img src="/assets/demo-memory.svg" alt="示例青春片段" />
          <div className="ix-intro-shade" />
          <div className="ix-intro-copy">
            <p>CHAPTER 00 / BEFORE WE BEGIN</p>
            <h1>欢迎来到<br /><em>我的青春现场</em></h1>
            <span>有些日子已经走远，但风还记得。</span>
            {introLoading && (
              <div className="ix-intro-captions" aria-live="polite">
                <span key={introProgress < 34 ? "one" : introProgress < 70 ? "two" : "three"}>
                  {introProgress < 34 ? "正在收集散落在风里的片段" : introProgress < 70 ? "正在把名字写进这段青春" : "下一页，等你来留下新的故事"}
                </span>
              </div>
            )}
            <button className={introLoading ? "is-loading" : ""} onClick={beginIntroJourney} disabled={introLoading} aria-label={introLoading ? `正在加载 ${introProgress}%` : "走进这段青春"}>
              {introLoading && <span className="ix-intro-progress-fill" style={{ width: `${introProgress}%` }} />}
              <b>{introLoading ? "正在打开青春档案" : "走进这段青春"}</b>
              {!introLoading && <i>↗</i>}
            </button>
            {introLoading && <div className="ix-intro-percent"><strong>{String(introProgress).padStart(2, "0")}</strong><span>%</span></div>}
          </div>
          <div className="ix-intro-year">2023 — NOW</div>
          <div className="ix-intro-transition" aria-hidden="true" />
        </div>
      )}

      {gate && <Suspense fallback={<div className="ix-identity-boot" aria-hidden="true" />}><OpenSourceVisitorLogin initialData={visitor} onLoginSuccess={enter} onBrowse={browse} /></Suspense>}

      {submissionOpen && <div className="ix-modal"><form className="ix-submission" onSubmit={sendSubmission}><button type="button" className="ix-close" onClick={() => setSubmissionOpen(false)}>×</button><p className="ix-kicker"><span /> STORY DROP</p><h2>把你的故事，<br /><em>也放进时间里</em></h2><input required placeholder="故事标题" value={submission.title} onChange={(event) => setSubmission({ ...submission, title: event.target.value })} /><textarea required placeholder="写下你想分享的校园片段……" value={submission.body} onChange={(event) => setSubmission({ ...submission, body: event.target.value })} /><label className="ix-drop">＋ 添加一张故事照片<input type="file" accept="image/*" onChange={async (event) => event.target.files?.[0] && setSubmission({ ...submission, image: await fileToData(event.target.files[0]) })} /></label><button type="submit">投递到站长信箱 <span>↗</span></button></form></div>}
      {riverOpen && <MemoryRiver memories={threeDimensionalMemories} origin={riverOrigin} onClose={() => setRiverOpen(false)} />}
      {toast && <div className="ix-toast">✦ {toast}</div>}
    </main>
  );
}
