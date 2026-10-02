"use client";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent } from "react";
import { actions, chooseLine, emotions, type PetCue, type PetSettings, type VisitorIdentity } from "./settings";
import { chatContext, replyStep, type ChatMessage } from "./chat";
import { nearestPetDock, type PetDock } from "./positioning";
import { MolingDrag } from "./moling-drag";
import "./pet.css";
const Live2DRenderer = lazy(() => import("./Live2DRenderer"));
const MolingRenderer = lazy(() => import("./MolingRenderer"));
type Message = ChatMessage;

export function PetCharacter({ settings, identity, page, active = true, preview = false, previewCue, initialRestUntil = 0 }: { settings: PetSettings; identity: VisitorIdentity; page: string; active?: boolean; preview?: boolean; previewCue?: PetCue | null; initialRestUntil?: number }) {
  const [cue, setCue] = useState<PetCue | null>(null);
  const [bubble, setBubble] = useState("");
  const [proactive, setProactive] = useState(true);
  const [chat, setChat] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [departing,setDeparting]=useState(false);
  const departingRef=useRef(false),departureTimer=useRef<number|null>(null);
  const [manualWake, setManualWake] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restUntil, setRestUntil] = useState(initialRestUntil);
  const [restSeconds, setRestSeconds] = useState(0);
  const submitting = useRef(false);
  useEffect(() => { setRestUntil(value => Math.max(value, initialRestUntil)); }, [initialRestUntil]);
  useEffect(() => {
    const tick = () => setRestSeconds(Math.max(0, Math.ceil((restUntil - Date.now()) / 1000)));
    tick();
    if (restUntil <= Date.now()) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [restUntil]);
  const [reveal, setReveal] = useState<{ index: number; count: number } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [petReady, setPetReady] = useState(false);
  const petReadyRef = useRef(false);
  const rendererReady = useRef(false);
  const greeted = useRef(false);
  
  const clickTimer = useRef<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dock, setDock] = useState<PetDock>({ side: "right", offset: 160 });
  const [waking, setWaking] = useState(false);
  const wakeFrames = useRef<number[]>([]);
  const dragReaction = useRef(new MolingDrag());
  const suppressDragClick = useRef(false);
  const drag = useRef<{ pointerId:number; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const anchor = useRef({ x: 0, y: 0 });
  const lastActivity = useRef(Date.now());
  const lastHover = useRef(0);
  const lastClickMotion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const paused = hidden || !active;
  const Renderer = settings.character === "moling" ? MolingRenderer : Live2DRenderer;
  const speak = useCallback((category: string, action: PetCue["action"] = "wave", emotion: PetCue["emotion"] = "happy", automatic = false) => {
    // The character must be on screen before any bubble is allowed to appear.
    if (!petReadyRef.current) return;
    setBubble(chooseLine(settings, category, identity, page));
    setProactive(automatic);
    setCue({ emotion, action, id: Date.now() });
  }, [settings, identity, page]);
  useEffect(() => {
    const cancel = () => { dragReaction.current.end(); drag.current = null; };
    const visibility = () => { if(document.hidden) cancel(); };
    window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",visibility);
    return () => { window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",visibility); };
  }, []);
  const current = useRef({ settings, speak });
  useEffect(() => { current.current = { settings, speak }; }, [settings, speak]);
  useEffect(() => { petReadyRef.current = petReady; }, [petReady]);
  // Resting must also drop the pending bubble text, otherwise waking replays a stale line before the model is back.
  useEffect(() => {
    petReadyRef.current = rendererReady.current && !paused;
    setPetReady(petReadyRef.current);
    if (paused) { if(departureTimer.current)window.clearTimeout(departureTimer.current);if(departingRef.current)setHidden(true);departingRef.current=false;setDeparting(false);dragReaction.current.end(); drag.current = null; setBubble(""); setCue(null); }
  }, [paused]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!petReady || greeted.current) return;
      greeted.current = true;
      if (current.current.settings.welcomeEnabled) current.current.speak(identity.visitorMode === "named" ? "named" : "guest", "wave", "happy", true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [identity.visitorMode, identity.visitorName, petReady]); // Reuse existing visitor identity; no second name form.
  useEffect(() => {
    if (!previewCue) return;
    setCue(previewCue);
    if (previewCue.text) { setBubble(previewCue.text); setProactive(true); }
  }, [previewCue]);
  useEffect(() => {
    if (!bubble) return;
    const timer = window.setTimeout(() => setBubble(""), settings.bubbleDuration * 1000);
    return () => window.clearTimeout(timer);
  }, [bubble, settings.bubbleDuration]);
  useEffect(() => {
    const activity = () => { lastActivity.current = Date.now(); };
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    let timer: number;
    const tick = () => {
      if (document.hidden || paused || chat || drag.current) return;
      const settings = current.current.settings;
      const resting = Date.now() - lastActivity.current > 120000;
      if (settings.randomAction && !resting) {
        setCue({ action: "idle", emotion: "normal", id: Date.now(), randomMotion: true });
      }
      if (settings.randomMove && !resting && settings.character !== "moling") {
        const step = settings.moveSpeed * settings.randomInterval;
        setOffset(current => {
          const rect = host.current?.getBoundingClientRect();
          if (!rect) return current;
          const bounds = preview ? host.current?.parentElement?.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
          if (!bounds) return current;
          return { x: Math.max(current.x + bounds.left + 8 - rect.left, Math.min(current.x + bounds.right - 8 - rect.right, anchor.current.x + Math.max(-settings.moveRange, Math.min(settings.moveRange, current.x - anchor.current.x + (Math.random() - .5) * Math.min(step, settings.moveRange))))), y: Math.max(current.y + bounds.top + 150 - rect.top, Math.min(current.y + bounds.bottom - 8 - rect.bottom, anchor.current.y + Math.max(-settings.moveRange, Math.min(settings.moveRange, current.y - anchor.current.y + (Math.random() - .5) * Math.min(step, settings.moveRange))))) };
        });
      }
    };
    const schedule = () => {
      const interval = current.current.settings.randomInterval * 1000;
      timer = window.setTimeout(() => { tick(); schedule(); }, interval * (.75 + Math.random() * .5));
    };
    schedule();
    return () => { clearTimeout(timer); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [settings.randomInterval, paused, chat, preview]);
  useEffect(() => {
    if (!settings.autoBubbleEnabled || !settings.bubbleEnabled || paused || chat) return;
    const timer = window.setInterval(() => {
      if (document.hidden || !petReady || drag.current || host.current?.matches(":hover, :focus-within")) return;
      const s = current.current.settings;
      const hour = new Date().getHours();
      const timeCategory = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      const category = Date.now() - lastActivity.current > 120000 && s.lines.linger?.length ? "linger"
        : Math.random() < .35 && s.lines[timeCategory]?.length ? timeCategory
        : s.lines.auto?.length ? "auto" : "idle";
      current.current.speak(category, "idle", "normal", true);
    }, settings.autoBubbleInterval * 1000);
    return () => clearInterval(timer);
  }, [settings.autoBubbleInterval, settings.autoBubbleEnabled, settings.bubbleEnabled, paused, chat, petReady]);
  // Typewriter: reveal the reply character by character, pausing longer on punctuation.
  useEffect(() => {
    if (!reveal) return;
    const target = messages[reveal.index];
    if (!target) { setReveal(null); return; }
    if (reveal.count >= target.content.length) { setReveal(null); return; }
    const ch = target.content[reveal.count];
    const step = replyStep(target.content.length);
    const delay = step > 1 ? 30 : /[。！？!?…]/.test(ch) ? 250 : /[，、；：,;:]/.test(ch) ? 110 : 30 + Math.random() * 16;
    const timer = window.setTimeout(() => setReveal(current => current && current.index === reveal.index ? { index: current.index, count: Math.min(target.content.length, current.count + step) } : current), delay);
    return () => window.clearTimeout(timer);
  }, [reveal, messages]);
  useEffect(() => { const el = historyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, reveal, busy, error, chat]);
  useEffect(() => () => { controller.current?.abort(); if(departureTimer.current)window.clearTimeout(departureTimer.current); if (clickTimer.current) window.clearTimeout(clickTimer.current); wakeFrames.current.forEach(window.cancelAnimationFrame); }, []);
  useEffect(() => { setMessages([]); setChat(false); setReveal(null); controller.current?.abort(); }, [identity.visitorMode, identity.visitorName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || submitting.current || preview || !settings.aiEnabled || restUntil > Date.now()) return;
    submitting.current = true;
    const history: Message[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(history); setInput(""); setBusy(true); setError("");
    setCue({ emotion: "thinking", action: "thinking", id: Date.now() });
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 65000);
    try {
      const response = await fetch("/api/pet/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, messages: chatContext(history) }), signal: abort.signal });
      const data = await response.json();
      if (data.code === "pet_rest" && response.status === 429) {
        const seconds = Math.max(1, Math.min(300, Number(data.retryAfter) || 300));
        setRestUntil(Date.now() + seconds * 1000); setRestSeconds(seconds);
        setMessages([...history, { role: "assistant", content: data.text || "我有点累了，需要休息一会儿。请5分钟后再来找我吧。" }]);
        setReveal(null); setBubble(data.text || "我有点累了，需要休息一会儿。"); setProactive(true);
        setCue({ emotion: "thinking", action: "sleep", id: Date.now() });
        return;
      }
      if (!response.ok) throw Error(data.error || "助手暂时无法回复");
      if (typeof data.text !== "string" || !data.text.trim()) throw Error("助手暂时没有有效回复，请稍后再试");
      if (abort.signal.aborted) return;
      setMessages([...history, { role: "assistant", content: data.text }]);
      setReveal({ index: history.length, count: 1 });
      setBubble(data.text);
      setProactive(true);
      setCue({ emotion: emotions.includes(data.emotion) ? data.emotion : "normal", action: actions.includes(data.action) ? data.action : "idle", id: Date.now() });
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "连接失败"); else setError("对话已取消或超时，请重试"); setCue({ emotion: abort.signal.aborted ? "normal" : "surprised", action: "idle", id: Date.now() }); }
    finally { clearTimeout(timer); submitting.current = false; setBusy(false); }
  };
  // Single click toggles the chat; a double click rests the pet, so the first click waits 230ms.
  const singleClick = () => {
    if(suppressDragClick.current){suppressDragClick.current=false;return;}
    if (departingRef.current || drag.current?.moved) return;
    if (clickTimer.current) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (departingRef.current || drag.current?.moved) return;
      if (!chat && Date.now() - lastClickMotion.current > 350) setCue({ emotion: "happy", action: "wave", id: Date.now() });
      setChat(!chat);
    }, 230);
  };
  const finishRest = () => {
    departingRef.current=false;setDeparting(false);departureTimer.current=null;
    if (!preview && host.current) setDock(nearestPetDock(host.current.getBoundingClientRect(), innerWidth, innerHeight));
    wakeFrames.current.forEach(window.cancelAnimationFrame);
    wakeFrames.current = [];
    setWaking(false);
    setChat(false);
    setHidden(true);
    setManualWake(false);
    controller.current?.abort();
  };
  const restPet = () => {
    if(departingRef.current)return;
    if(settings.character !== "moling" || paused){finishRest();return;}
    departingRef.current=true;setDeparting(true);
    if(clickTimer.current){window.clearTimeout(clickTimer.current);clickTimer.current=null;}
    dragReaction.current.end();drag.current=null;setChat(false);setBubble("");controller.current?.abort();
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    departureTimer.current=window.setTimeout(finishRest,reduced?400:1300);
  };
  const wakePet = () => {
    if(departureTimer.current)window.clearTimeout(departureTimer.current);departureTimer.current=null;departingRef.current=false;setDeparting(false);
    setManualWake(!rendererReady.current);
    setWaking(true);
    setHidden(false);
    wakeFrames.current.forEach(window.cancelAnimationFrame);
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => setWaking(false));
      wakeFrames.current = [second];
    });
    wakeFrames.current = [first];
  };
  const restToggle = () => {
    if (departingRef.current || drag.current?.moved) return;
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    
    restPet();
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (departingRef.current || !settings.draggable || event.button !== 0 || !petReady) return;
    suppressDragClick.current=false;
    drag.current = { pointerId:event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false };
    if (settings.character === "moling" && event.pointerType === "mouse") dragReaction.current.begin(event.pointerId,event.clientX,event.clientY,performance.now());
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId || !host.current) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (Math.hypot(dx, dy) < 5 && !d.moved) return;
    d.moved = true;
    suppressDragClick.current=true;
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    dragReaction.current.move(event.pointerId,event.clientX,event.clientY,performance.now());
    const rect = host.current.getBoundingClientRect();
    const bounds = preview ? host.current.parentElement?.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    if (!bounds) return;
    setOffset(current => {
      const next = { x: Math.max(current.x + bounds.left + 8 - rect.left, Math.min(current.x + bounds.right - 8 - rect.right, d.ox + dx)), y: Math.max(current.y + bounds.top + 150 - rect.top, Math.min(current.y + bounds.bottom - 8 - rect.bottom, d.oy + dy)) };
      anchor.current = next;
      return next;
    });
  };
  const endDrag = (event:PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    dragReaction.current.end();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const finished = drag.current;
    window.setTimeout(() => { if(drag.current === finished) drag.current = null; },0);
  };
  const petSide = settings.position === "left" ? "left" : "right";
  const style = hidden && !preview ? { "--pet-height": `${settings.size}px`, opacity: 1, zIndex: settings.zIndex,
    left: dock.side === "left" ? 0 : dock.side === "top" || dock.side === "bottom" ? `${dock.offset}px` : "auto",
    right: dock.side === "right" ? 0 : "auto",
    top: dock.side === "top" ? 0 : dock.side === "left" || dock.side === "right" ? `${dock.offset}px` : "auto",
    bottom: dock.side === "bottom" ? 0 : "auto",
    transform: dock.side === "left" || dock.side === "right" ? "translateY(-50%)" : "translateX(-50%)",
    transitionDuration: "0s" } as CSSProperties
    : { "--pet-height": `${settings.size}px`, opacity: settings.opacity, zIndex: settings.zIndex,
      [petSide]: `${Math.min(settings.right, Math.max(0, (typeof window === "undefined" ? 1440 : innerWidth) - settings.size - 24))}px`, bottom: `${Math.min(settings.bottom, Math.max(0, (typeof window === "undefined" ? 900 : innerHeight) - settings.size - 160))}px`,
      transform: `translate(${offset.x}px, ${offset.y}px)`, transitionDuration: waking ? "0s" : settings.character === "moling" ? "0s" : !settings.randomMove ? "0s" : `${Math.max(1, settings.moveRange / settings.moveSpeed)}s`, transitionTimingFunction: settings.character === "moling" ? "linear" : undefined } as CSSProperties;
  return <div ref={host} className={`desktop-pet${preview ? " is-preview" : ""}${hidden ? " is-hidden" : ""}${active ? "" : " is-suspended"}${departing?" is-departing":""}`} data-drawer-side={hidden && !preview ? dock.side : undefined} style={style} aria-hidden={!active || undefined} inert={!active}>
    {hidden ? <button className="pet-restore" type="button" onClick={wakePet} title={`唤醒 ${settings.name}`} aria-label={`唤醒 ${settings.name}`}><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>唤醒</span></button> : <>
      {settings.bubbleEnabled && (!chat || !proactive) && <div className={`pet-bubble${bubble ? " is-visible" : ""}${proactive ? " is-proactive" : " is-interaction"}`} role="status" aria-hidden={!bubble}>{bubble}</div>}
      <section className={`pet-chat${chat ? " is-open" : ""}`} aria-label={`${settings.name} 对话`} aria-hidden={!chat}>
        <header><strong>{settings.character === "moling" && <span className="moling-avatar moling-avatar-v2" aria-hidden="true"><svg viewBox="0 0 30 30"><path d="M 11 19 Q 13 16.5 15 19 M 19 19 Q 21 16.5 23 19" fill="none" stroke="#c1f8d9" strokeWidth="1" strokeLinecap="round" /></svg></span>}{settings.name}</strong><div className="pet-chat-actions"><button type="button" className="pet-chat-icon" aria-label="让她休息" title="让她休息" tabIndex={chat ? 0 : -1} onClick={restPet}><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></button><a className="pet-chat-icon" aria-label="角色版权与许可" title="角色版权与许可" tabIndex={chat ? 0 : -1} href="/assets/desktop-pet/NOTICE.txt" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.8" r="1.1" fill="currentColor" /></svg></a><button type="button" className="pet-chat-icon is-close" aria-label="关闭聊天" tabIndex={chat ? 0 : -1} onClick={() => setChat(false)}>×</button></div></header>
        <div className="pet-chat-history" ref={historyRef} aria-live="polite">{!messages.length && <p className="is-opening">{chooseLine(settings, "opening", identity, page)}</p>}{messages.map((m, i) => { const typing = reveal?.index === i; const shown = typing ? m.content.slice(0, reveal.count) : m.content; if (!shown) return null; return <p className={`is-${m.role}${typing ? " is-typing" : ""}`} key={i}><span aria-hidden={typing || undefined}>{shown}</span>{typing && <span className="pet-sr">{m.content}</span>}</p>; })}{busy && <p className="is-pending">正在想一想…</p>}{restSeconds > 0 && <p className="is-resting" role="status">休息中，{Math.floor(restSeconds / 60)}分{restSeconds % 60}秒后可以继续聊天。</p>}{error && <p role="alert" className="is-error">{error}</p>}</div>
        <form onSubmit={submit}><label className="pet-sr" htmlFor={preview ? "pet-preview-input" : "pet-chat-input"}>输入对话</label><input id={preview ? "pet-preview-input" : "pet-chat-input"} value={input} onChange={e => setInput(e.target.value)} maxLength={2000} tabIndex={chat ? undefined : -1} placeholder={restSeconds > 0 ? "我有点累了，需要休息一会儿" : preview ? "预览不调用 AI" : settings.aiEnabled ? "想说些什么？" : "站长尚未开启 AI 对话"} disabled={preview || !settings.aiEnabled || busy || restSeconds > 0} /><button type="submit" tabIndex={chat ? undefined : -1} disabled={busy || preview || !settings.aiEnabled || restSeconds > 0 || !input.trim()}>发送</button></form>
      </section>
      </>}
      <div className={`pet-body${petReady ? "" : " is-loading"}`} hidden={paused} inert={departing} aria-hidden={!petReady && !manualWake || undefined} role="button" tabIndex={petReady ? 0 : -1} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setChat(true); setCue({ emotion: "happy", action: "wave", id: Date.now() }); } }} aria-label={`桌宠 ${settings.name}，单击开始对话，双击让她休息`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onMouseEnter={() => { if (!departingRef.current && !drag.current?.moved && settings.hoverEnabled && Date.now() - lastHover.current > 8000) { lastHover.current = Date.now(); speak("hover", settings.character === "moling" ? "idle" : "wave", settings.character === "moling" ? "curious" : "happy"); } }} onClickCapture={event => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }} onClick={singleClick} onDoubleClick={restToggle}>
        <Suspense fallback={null}><Renderer key={settings.character} settings={settings} cue={cue} paused={paused} dragReaction={dragReaction} departing={departing} showLoading={manualWake} onStatus={status => { rendererReady.current = status === "ready"; setPetReady(rendererReady.current && !paused); if (rendererReady.current) setManualWake(false); }} onHit={areas => { if (settings.clickEnabled && !drag.current?.moved) { lastClickMotion.current = Date.now(); speak(areas.includes("Head") ? "head" : areas.includes("Body") ? "body" : "click", areas.includes("Head") ? "wave" : "nod", "shy"); } }} /></Suspense>
      </div>
  </div>;
}

export default function DesktopPet({ visitor, page, active }: { visitor: { name: string } | null; page: string; active: boolean }) {
  const [settings, setSettings] = useState<PetSettings | null>(null);
  const [restUntil, setRestUntil] = useState(0);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const change = () => setDesktop(media.matches);
    change(); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const abort = new AbortController();
    const load = () => { void fetch("/api/pet/config", { signal: abort.signal, cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(data => { setSettings(data.settings); setRestUntil(data.chatRestSeconds > 0 ? Date.now() + data.chatRestSeconds * 1000 : 0); }).catch(() => undefined); };
    load();
    const refresh = setInterval(load, 60000);
    return () => { clearInterval(refresh); abort.abort(); };
  }, [desktop]);
  if (!desktop || !settings?.enabled) return null;
  return <PetCharacter active={active} initialRestUntil={restUntil} settings={settings} identity={{ visitorMode: visitor?.name ? "named" : "guest", visitorName: visitor?.name || "" }} page={page} />;
}
