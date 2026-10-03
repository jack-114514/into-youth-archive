"use client";
import type { MolingDrag } from "./moling-drag";
import { useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import type { Live2DModel, Cubism4InternalModel } from "pixi-live2d-display";
import type { PetCue, PetSettings } from "./settings";
import { petFrameRate } from "./settings";
import { RestPoseController } from "./restPose";
import { petRenderResolution } from "./renderBudget";
import { pointerFocus } from "./follow";

let corePromise: Promise<void> | undefined;
function loadCore() {
  return corePromise ||= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/desktop-pet/live2dcubismcore.min.js";
    script.onload = () => resolve();
    script.onerror = () => { corePromise = undefined; script.remove(); reject(new Error("core unavailable")); };
    document.head.appendChild(script);
  });
}
export default function Live2DRenderer({ settings, cue, paused, showLoading = false, onHit, onStatus }: { settings: PetSettings; cue: PetCue | null; paused: boolean; showLoading?: boolean; dragReaction?:{current:MolingDrag}; departing?:boolean; onHit: (areas: string[]) => void; onStatus?: (status: "loading" | "ready" | "error") => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const model = useRef<Live2DModel | null>(null);
  const app = useRef<Application | null>(null);
  const motionEndTimer = useRef<number | null>(null);
  const lastMotion = useRef("");
  const restPose = useRef<RestPoseController | null>(null);
  const latest = useRef({ settings, paused, onHit });
  useEffect(() => { latest.current = { settings, paused, onHit }; }, [settings, paused, onHit]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const statusListener = useRef(onStatus);
  useEffect(() => { statusListener.current = onStatus; }, [onStatus]);
  useEffect(() => { statusListener.current?.(status); }, [status]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let ownedApp: Application | null = null;
    let ownedModel: Live2DModel | null = null;
    let detachRest = () => {};
    const load = async () => {
      try {
        const [PIXI] = await Promise.all([import("pixi.js"), loadCore()]);
        const { Live2DModel, config, MotionPreloadStrategy } = await import("pixi-live2d-display/cubism4");
        if (cancelled || !canvas.current) return;
        config.logLevel = 0;
        const options = { autoInteract: false, autoUpdate: false, motionPreload: MotionPreloadStrategy.NONE } as const;
        const character = await Live2DModel.from(settings.modelUrl, options);
        // A cancelled load may share cached textures with its replacement.
        if (cancelled) { character.destroy({ children: true }); return; }
        ownedModel = character; model.current = character;
        await new Promise<void>(resolve => {
          if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 1000 });
          else window.setTimeout(resolve, 0);
        });
        if (cancelled || !canvas.current) return;
        // Download/decode the model before allocating WebGL. No empty canvas
        // renders while assets arrive; the first scene stays interactive.
        const application = new PIXI.Application({ view: canvas.current, width: 320, height: 420, backgroundAlpha: 0, antialias: true, resolution: petRenderResolution(latest.current.settings.size, devicePixelRatio), autoDensity: true, autoStart: false });
        ownedApp = application; app.current = application;
        // Pixi otherwise raises the 5 FPS choice to its default 10 FPS floor.
        application.ticker.minFPS = 0;
        application.ticker.maxFPS = petFrameRate(latest.current.settings.maxFPS);
        // The library otherwise restarts Idle as soon as any motion finishes.
        // Let the parent schedule short motions with an actual pause between them.
        character.internalModel.motionManager.groups.idle = "__disabled";
        character.internalModel.motionManager.stopAllMotions();
        const internal = character.internalModel as Cubism4InternalModel;
        const resting = new RestPoseController(internal.coreModel);
        restPose.current = resting;
        resting.settle(performance.now());
        const maintainRest = () => resting.update(performance.now(), false, false);
        internal.on("afterMotionUpdate", maintainRest);
        detachRest = () => internal.off("afterMotionUpdate", maintainRest);
        character.anchor.set(.5, 1);
        const originalHeight = character.height;
        const initialScale = latest.current.settings.scale;
        character.scale.set(Math.min(390 / originalHeight, 300 / character.internalModel.width) * initialScale);
        character.position.set(160, 420);
        // Upload one atlas per frame before rendering the character, so the first
        // visible frame doesn't synchronously upload every texture at once.
        for (const texture of character.textures) {
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          if (cancelled) return;
          (application.renderer as InstanceType<typeof PIXI.Renderer>).texture.bind(texture.baseTexture);
        }
        application.stage.addChild(character);
        character.on("hit", (areas: string[]) => latest.current.onHit(areas));
        let lastScale = initialScale;
        application.ticker.add(() => {
          const { settings: s, paused: p } = latest.current;
          if (p || document.hidden) return;
          if (lastScale !== s.scale) {
            lastScale = s.scale;
            character.scale.set(Math.min(390 / originalHeight, 300 / character.internalModel.width) * s.scale);
            character.position.set(160, 420);
          }
          character.update(application.ticker.elapsedMS);
        });
        // A zero delta skips Cubism's first model/physics update in _render().
        // Warm the real update while still invisible, before reporting ready.
        character.update(1000 / 30);
        application.render();
        if (!latest.current.paused && !document.hidden) application.start();
        setStatus("ready");
      } catch { if (!cancelled) setStatus("error"); }
    };
    const frame = window.requestAnimationFrame(() => { setStatus("loading"); void load(); });
    return () => {
      window.cancelAnimationFrame(frame);
      if (motionEndTimer.current !== null) window.clearTimeout(motionEndTimer.current);
      motionEndTimer.current = null;
      lastMotion.current = "";
      detachRest();
      restPose.current = null;
      cancelled = true;
      model.current = null; app.current = null;
      if (ownedModel) ownedApp?.stage.removeChild(ownedModel);
      // Textures are shared by Pixi's cache (including the admin preview).
      ownedModel?.destroy({ children: true });
      ownedApp?.destroy(false, { children: true });
    };
  }, [attempt, settings.character, settings.modelUrl]);
  useEffect(() => {
    if (app.current) app.current.ticker.maxFPS = petFrameRate(settings.maxFPS);
  }, [settings.maxFPS, status]);
  useEffect(() => {
    const renderer = app.current?.renderer;
    if (!renderer || status !== "ready") return;
    const resize = () => {
      const resolution = petRenderResolution(settings.size, devicePixelRatio);
      if (renderer.resolution !== resolution) {
        renderer.resolution = resolution;
        renderer.resize(320, 420);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [settings.size, status]);
  useEffect(() => {
    if (status !== "error" || showLoading) return;
    // Silent initial failures retry in the background, with bounded frequency.
    const timer = window.setTimeout(() => { setStatus("loading"); setAttempt(value => value + 1); }, Math.min(5000 * 2 ** Math.min(attempt, 4), 60000));
    return () => window.clearTimeout(timer);
  }, [status, showLoading, attempt]);
  useEffect(() => {
    const visibility = () => { if (paused || document.hidden || status !== "ready") app.current?.stop(); else app.current?.start(); };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    let followFrame = 0;
    let pointer = { x: 0, y: 0 };
    const follow = (event: MouseEvent) => {
      if (paused || !settings.mouseFollow || !model.current) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (followFrame) return;
      followFrame = window.requestAnimationFrame(() => {
        followFrame = 0;
        const m = model.current, bounds = canvas.current?.getBoundingClientRect();
        if (!m || !bounds?.width || !bounds.height) return;
        const focus = pointerFocus(pointer.x, pointer.y, bounds, { width: innerWidth, height: innerHeight }, settings.followStrength);
        m.internalModel.focusController.focus(focus.x, focus.y);
      });
    };
    window.addEventListener("mousemove", follow, { passive: true });
    if (!settings.mouseFollow || settings.followStrength === 0) model.current?.internalModel.focusController.focus(0, 0);
    return () => { window.cancelAnimationFrame(followFrame); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("mousemove", follow); };
  }, [paused, settings.mouseFollow, settings.followStrength, status]);
  useEffect(() => {
    if (!cue || !model.current || paused) return;
    const character = model.current;
    const manager = character.internalModel.motionManager;
    const definitions = manager.definitions;
    const groups = Object.keys(definitions).filter(name => definitions[name]?.length);
    let group = (cue.action === "wave" || cue.action === "nod" ? groups.find(name => /tap|touch/i.test(name)) : undefined)
      || groups.find(name => /^idle$/i.test(name)) || groups[0];
    let index = 0;
    if (cue.randomMotion) {
      const available = Object.entries(definitions).flatMap(([name, motions]) =>
        (motions || []).map((_, motionIndex) => ({ name, motionIndex })));
      const choices = available.filter(({name}) => settings.idleEnabled || !/^idle$/i.test(name));
      const fresh = choices.filter(({name,motionIndex}) => `${name}:${motionIndex}` !== lastMotion.current);
      const pool = fresh.length ? fresh : choices;
      const chosen = pool[Math.floor(Math.random()*pool.length)];
      if (!chosen) return;
      group = chosen.name; index = chosen.motionIndex;
    }
    if (motionEndTimer.current !== null) window.clearTimeout(motionEndTimer.current);
    motionEndTimer.current = null;
    let cancelled = false;
    if (definitions[group]?.length) {
      index = Math.min(index, definitions[group]!.length - 1);
      lastMotion.current = `${group}:${index}`;
      restPose.current?.interrupt();
      void character.motion(group, index, 3).then(started => {
        if (cancelled) return;
        if (!started) { restPose.current?.settle(performance.now()); return; }
        const cycle = manager.motionGroups[group]?.[index]?.getLoopDuration() || 3;
        // Finish one complete loop, then ease every pose parameter back to its model default.
        motionEndTimer.current = window.setTimeout(() => {
          if (model.current === character) {
            manager.stopAllMotions();
            restPose.current?.settle(performance.now());
          }
          motionEndTimer.current = null;
        }, Math.max(1200, Math.min(cycle * 1000, 8000)));
      }).catch(() => undefined);
    }
    const expressions = manager.expressionManager?.definitions || [];
    const expression = expressions.findIndex((definition: { Name?: string }) => definition.Name?.toLowerCase() === cue.emotion);
    if (expression >= 0) void character.expression(expression).catch(() => undefined);
    else manager.expressionManager?.resetExpression();
    return () => {
      cancelled = true;
      if (motionEndTimer.current !== null) window.clearTimeout(motionEndTimer.current);
      motionEndTimer.current = null;
      if (model.current === character) {
        manager.stopAllMotions();
        restPose.current?.settle(performance.now());
      }
    };
  }, [cue, paused, status, settings.character, settings.idleEnabled]);
  return <div className={`pet-renderer is-${settings.character}`} data-status={status}>
    {/* A destroyed WebGL context can never be reused, so every load attempt gets a brand-new canvas. */}
    <canvas key={`${settings.character}|${settings.modelUrl}|${attempt}`} ref={canvas} aria-label="Live2D 桌宠角色" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (settings.clickEnabled) model.current?.tap((event.clientX - bounds.left) / bounds.width * 320, (event.clientY - bounds.top) / bounds.height * 420);
    }} />
    {showLoading && status === "loading" && <span className="pet-load-status" role="status">角色正在到来…</span>}
    {showLoading && status === "error" && <button type="button" className="pet-load-status" onClick={() => { setStatus("loading"); setAttempt(v => v + 1); }}>角色加载失败，点击重试</button>}
  </div>;
}
