"use client";
import { useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import type { Live2DModel, Cubism4InternalModel } from "pixi-live2d-display";
import type { Action, PetCue, PetSettings } from "./settings";
import { RestPoseController } from "./restPose";

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
// Semantic aliases point to existing files; Miku and Hanabi have no independent emotion expressions.
const motionMap = { idle: ["Idle", 0], wave: ["Tap", 0], nod: ["Tap", 1], thinking: ["Idle", 1], sleep: ["Idle", 2] } as const;
const mikuMotionMap = { idle: ["Idle", 0], wave: ["Tap", 0], nod: ["Tap", 1], thinking: ["Idle", 0], sleep: ["Idle", 0] } as const;
const hanabiMotionMap = { idle: ["Idle", 1], wave: ["Tap", 0], nod: ["Tap", 1], thinking: ["Idle", 1], sleep: ["Idle", 1] } as const;
const motionMaps: Record<string, Record<Action, readonly [string, number]>> = { miku: mikuMotionMap, hanabi: hanabiMotionMap };
const expressionMap = { happy: "f04", normal: "f00", shy: "f06", thinking: "f03", surprised: "f05", sad: "f07" } as const;
const MODEL_URLS: Record<string, string> = {
  miku: "/assets/desktop-pet/miku/miku.model3.json",
  hanabi: "/assets/desktop-pet/haru/model3.json",
};
// Every character must be able to fall back to this one, so the pet never disappears.
const DEFAULT_MODEL_URL = "/assets/desktop-pet/haru/model3.json";
function modelUrlFor(character: string, customUrl: string) {
  return character === "custom" ? customUrl : MODEL_URLS[character] || DEFAULT_MODEL_URL;
}

export default function Live2DRenderer({ settings, cue, paused, onHit, onStatus }: { settings: PetSettings; cue: PetCue | null; paused: boolean; onHit: (areas: string[]) => void; onStatus?: (status: "loading" | "ready" | "error") => void }) {
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
        await loadCore();
        const [PIXI, { Live2DModel, config, MotionPreloadStrategy }] = await Promise.all([import("pixi.js"), import("pixi-live2d-display/cubism4")]);
        if (cancelled || !canvas.current) return;
        config.logLevel = 0;
        const application = new PIXI.Application({ view: canvas.current, width: 320, height: 420, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 1.5), autoDensity: true });
        ownedApp = application; app.current = application;
        application.ticker.maxFPS = 30;
        const source = modelUrlFor(settings.character, settings.modelUrl);
        const options = { autoInteract: false, autoUpdate: false, motionPreload: MotionPreloadStrategy.IDLE } as const;
        let character: Live2DModel;
        try {
          character = await Live2DModel.from(source, options);
        } catch (error) {
          // Requirement: a broken character model must never take the whole pet down.
          if (source === DEFAULT_MODEL_URL) throw error;
          character = await Live2DModel.from(DEFAULT_MODEL_URL, options);
        }
        // A cancelled load may share cached textures with its replacement.
        if (cancelled) { character.destroy({ children: true }); return; }
        ownedModel = character; model.current = character;
        // The library otherwise restarts Idle as soon as any motion finishes.
        // Let the parent schedule short motions with an actual pause between them.
        character.internalModel.motionManager.groups.idle = "__disabled";
        character.internalModel.motionManager.stopAllMotions();
        const internal = character.internalModel as Cubism4InternalModel;
        const resting = new RestPoseController(internal.coreModel);
        restPose.current = resting;
        resting.settle(performance.now());
        const maintainRest = () => resting.update(performance.now(), latest.current.settings.character === "hanabi" && latest.current.settings.idleEnabled, latest.current.settings.character === "hanabi");
        internal.on("afterMotionUpdate", maintainRest);
        detachRest = () => internal.off("afterMotionUpdate", maintainRest);
        if (settings.character === "miku") {
          // This official model retains Cubism 2-style parameter IDs in its moc3.
          // The Cubism 4 renderer otherwise writes to nonexistent ParamAngleX IDs.
          internal.idParamAngleX = "PARAM_ANGLE_X";
          internal.idParamAngleY = "PARAM_ANGLE_Y";
          internal.idParamAngleZ = "PARAM_ANGLE_Z";
          internal.idParamEyeBallX = "PARAM_EYE_BALL_X";
          internal.idParamEyeBallY = "PARAM_EYE_BALL_Y";
          internal.idParamBodyAngleX = "PARAM_BODY_ANGLE_X";
        }
        character.anchor.set(.5, 1);
        application.stage.addChild(character);
        const originalHeight = character.height;
        character.on("hit", (areas: string[]) => latest.current.onHit(areas));
        let lastScale = 0;
        application.ticker.add(() => {
          const { settings: s, paused: p } = latest.current;
          if (p || document.hidden) return;
          if (lastScale !== s.scale) {
            lastScale = s.scale;
            character.scale.set((s.character === "miku" ? Math.min(390 / originalHeight, 300 / character.internalModel.width) : 390 / originalHeight) * s.scale);
            character.position.set(160, 420);
          }
          character.update(application.ticker.elapsedMS);
        });
        setStatus("ready");
      } catch { if (!cancelled) setStatus("error"); }
    };
    const timer = window.setTimeout(() => { setStatus("loading"); void load(); }, 400);
    return () => {
      clearTimeout(timer);
      if (motionEndTimer.current !== null) window.clearTimeout(motionEndTimer.current);
      motionEndTimer.current = null;
      lastMotion.current = "";
      detachRest();
      restPose.current = null;
      cancelled = true;
      model.current = null; app.current = null;
      if (ownedModel) ownedApp?.stage.removeChild(ownedModel);
      ownedModel?.destroy({ children: true, texture: true, baseTexture: true });
      ownedApp?.destroy(false, { children: true });
    };
  }, [attempt, settings.character, settings.modelUrl]);
  useEffect(() => {
    const visibility = () => { if (paused || document.hidden) app.current?.stop(); else app.current?.start(); };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const follow = (event: MouseEvent) => {
      const m = model.current, bounds = canvas.current?.getBoundingClientRect();
      if (!m || !bounds || paused || !settings.mouseFollow) return;
      const x = (event.clientX - bounds.left) / bounds.width * 320;
      const y = (event.clientY - bounds.top) / bounds.height * 420;
      m.focus(160 + (x - 160) * settings.followStrength, 210 + (y - 210) * settings.followStrength);
    };
    window.addEventListener("mousemove", follow, { passive: true });
    if (!settings.mouseFollow) model.current?.focus(160, 210);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("mousemove", follow); };
  }, [paused, settings.mouseFollow, settings.followStrength, status]);
  useEffect(() => {
    if (!cue || !model.current || paused) return;
    const character = model.current;
    const manager = character.internalModel.motionManager;
    const definitions = manager.definitions;
    if (settings.character === "hanabi" && cue.action === "idle" && !cue.randomMotion) {
      restPose.current?.varyFace(performance.now());
      return;
    }
    let [group, index]: [string, number] = [...(motionMaps[settings.character] || motionMap)[cue.action]];
    if (cue.randomMotion) {
      const available = Object.entries(definitions).flatMap(([name, motions]) =>
        (motions || []).map((_, motionIndex) => ({ name, motionIndex }))
      );
      const activeChoices = available.filter(({ name, motionIndex }) => settings.character !== "hanabi"
        ? settings.idleEnabled || !/^idle$/i.test(name)
        : (/^idle$/i.test(name) && motionIndex === 1) || (/^tap$/i.test(name) && motionIndex < 2));
      const choices = activeChoices.length ? activeChoices : available;
      const fresh = choices.filter(({ name, motionIndex }) => `${name}:${motionIndex}` !== lastMotion.current);
      const chosen = (fresh.length ? fresh : choices)[Math.floor(Math.random() * (fresh.length || choices.length))];
      if (!chosen) return;
      group = chosen.name;
      index = chosen.motionIndex;
    } else if (settings.character === "custom") {
      const groups = Object.keys(definitions).filter(name => definitions[name]?.length);
      group = (cue.action === "wave" || cue.action === "nod" ? groups.find(name => /tap|touch/i.test(name)) : undefined)
        || groups.find(name => /^idle$/i.test(name)) || groups[0];
      index = 0;
    } else if ((cue.action === "wave" || cue.action === "nod") && (definitions[group]?.length || 0) > 1) {
      // Different real model clips make repeated greetings less mechanical.
      const choices = definitions[group]!.map((_, motionIndex) => motionIndex).filter(motionIndex =>
        (settings.character !== "hanabi" || motionIndex < 2) && `${group}:${motionIndex}` !== lastMotion.current);
      index = choices[Math.floor(Math.random() * choices.length)] ?? index;
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
    if (settings.character === "haru" || settings.character === "haru-soft") void character.expression(expressionMap[cue.emotion]).catch(() => undefined);
    else {
      const expressions = manager.expressionManager?.definitions || [];
      const index = expressions.findIndex((definition: { Name?: string }) => definition.Name?.toLowerCase() === cue.emotion);
      if (index >= 0) void character.expression(index).catch(() => undefined);
      else manager.expressionManager?.resetExpression();
    }
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
  return <div className={`pet-renderer is-${settings.character}`}>
    {/* A destroyed WebGL context can never be reused, so every load attempt gets a brand-new canvas. */}
    <canvas key={`${settings.character}|${settings.modelUrl}|${attempt}`} ref={canvas} aria-label="Live2D 桌宠角色" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (settings.clickEnabled) model.current?.tap((event.clientX - bounds.left) / bounds.width * 320, (event.clientY - bounds.top) / bounds.height * 420);
    }} />
    {status === "loading" && <span className="pet-load-status">角色正在到来…</span>}
    {status === "error" && <button type="button" className="pet-load-status" onClick={() => { setStatus("loading"); setAttempt(v => v + 1); }}>角色加载失败，点击重试</button>}
  </div>;
}
