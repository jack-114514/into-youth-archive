"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useCursor } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import type { GalaxyScenePreset, GalaxySettings } from "./galaxySettings";
import { createDesktopTextureQueue, fitGalaxyTexture, isDesktopGalaxyClient } from "./desktopGalaxyTextures";
import { ambientSpherePoint, wrapFallingSphereY } from "./ambientSphere";
import { galaxyMediaLayout } from "./galaxyMediaLayout";
import { galaxyDetailImageAspect, prepareGalaxyDetailImage } from "./galaxyDetailImages";

export type GalaxyMemory = { id?: number; url: string; thumbnail_url?: string; video_url?: string; title: string; meta: string; body?: string; taken_at?: string; sort_order?: number; show_on_home?: number; show_in_3d?: number };

type Quality = "mobile" | "desktop";
type PhotoOrigin = { x: number; y: number };
type StagedPhoto = {
  key: string;
  memory: GalaxyMemory;
  position: [number, number, number];
  floatPhase: number;
  revealAt: number;
};

const settingFactor = (value: string, fallback = 100) => {
  const parsed = Number(value);
  return Math.max(0, Math.min(1.4, (Number.isFinite(parsed) ? parsed : fallback) / 100));
};

const settingNumber = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
};

function isVideoUrl(url: string) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(url) || url.startsWith("data:video/");
}

const PHOTO_SURFACE_ASPECT = 1;
const VIDEO_SURFACE_ASPECT = 2.72 / 3.15;

function shuffleMemories(memories: GalaxyMemory[]) {
  const shuffled = [...memories];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

// The low-discrepancy spherical layout is adapted from Bob Zhang's MIT-licensed
// personal-homepage memory archive. It avoids visible clusters while retaining
// a fresh random rotation and small per-entry variation on every scene visit.
function createDistributedPhotoPosition(slot: number, total: number, angleOffset: number, spread: number): [number, number, number] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const progress = (slot + 0.5) / Math.max(1, total);
  const vertical = 0.92 - progress * 1.84;
  const latitudeRadius = Math.sqrt(Math.max(0, 1 - vertical * vertical));
  const angle = angleOffset + slot * goldenAngle + (Math.random() - 0.5) * 0.16;
  const radius = (17.5 + Math.random() * 5.5 + latitudeRadius * 2.8) * spread;
  return [
    Math.cos(angle) * radius,
    1.7 + vertical * 9.2 + (Math.random() - 0.5) * 1.1,
    Math.sin(angle) * radius,
  ];
}

function createPhotoPlan(memories: GalaxyMemory[], spread: number, revealAt: number): StagedPhoto[] {
  const queue = shuffleMemories(memories);
  const angleOffset = Math.random() * Math.PI * 2;
  return queue.map((memory, slot) => ({
    key: `${memory.id ?? memory.url}-${slot}`,
    memory,
    position: createDistributedPhotoPosition(slot, queue.length, angleOffset, spread),
    floatPhase: Math.random() * Math.PI * 2,
    revealAt,
  }));
}

type GalaxyPreloadMode = "background" | "accelerated";
const desktopTextures = createDesktopTextureQueue<THREE.Texture>((url, signal) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const cleanup = () => {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    signal.removeEventListener("abort", abort);
  };
  const abort = () => { cleanup(); reject(new DOMException("Texture load cancelled", "AbortError")); };
  image.onerror = () => { cleanup(); reject(new Error("Unable to load 3D photo")); };
  image.onload = async () => {
    try {
      await image.decode();
      if (signal.aborted) return;
      const size = fitGalaxyTexture(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to prepare 3D photo");
      context.drawImage(image, 0, 0, size.width, size.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      applyCenteredCover(texture, size.width, size.height);
      resolve({ texture, bytes: size.width * size.height * 4 });
    } catch (error) {
      reject(error);
    } finally {
      cleanup();
    }
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  else image.src = url;
}), (texture) => {
  texture.dispose();
  const canvas = texture.image as HTMLCanvasElement;
  canvas.width = 0;
  canvas.height = 0;
});

function DesktopTextureUploads() {
  const { gl } = useThree();
  useFrame(() => desktopTextures.uploadNext(gl, (texture) => gl.initTexture(texture)));
  useEffect(() => () => desktopTextures.pause(), []);
  return null;
}

const galaxyTextureQueue: string[] = [];
const galaxyTextureRequested = new Set<string>();
const galaxyTextureCache = new Map<string, THREE.Texture>();
const galaxyTextureFailures = new Map<string, number>();
const galaxyTextureListeners = new Set<(url: string, texture: THREE.Texture) => void>();
let galaxyTextureTimer: ReturnType<typeof setTimeout> | null = null;
let galaxyPreloadMode: GalaxyPreloadMode = "background";
let galaxyTextureActiveLoads = 0;

function loadQueuedGalaxyTexture(url: string) {
  galaxyTextureActiveLoads += 1;
  new THREE.TextureLoader().load(url, (texture) => {
    const image = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
    texture.colorSpace = THREE.SRGBColorSpace;
    applyCenteredCover(texture, image?.naturalWidth || image?.width || 0, image?.naturalHeight || image?.height || 0);
    galaxyTextureCache.set(url, texture);
    galaxyTextureListeners.forEach((listener) => listener(url, texture));
    galaxyTextureActiveLoads -= 1;
    scheduleGalaxyTextureDrain(galaxyPreloadMode === "accelerated" ? 20 : 260);
  }, undefined, () => {
    galaxyTextureActiveLoads -= 1;
    const failures = (galaxyTextureFailures.get(url) || 0) + 1;
    galaxyTextureFailures.set(url, failures);
    if (failures < 2) galaxyTextureQueue.push(url);
    scheduleGalaxyTextureDrain(galaxyPreloadMode === "accelerated" ? 60 : 420);
  });
}

function drainGalaxyTextureQueue() {
  galaxyTextureTimer = null;
  const concurrency = galaxyPreloadMode === "accelerated" ? 3 : 1;
  while (galaxyTextureActiveLoads < concurrency) {
    const url = galaxyTextureQueue.shift();
    if (!url) break;
    loadQueuedGalaxyTexture(url);
  }
}

function scheduleGalaxyTextureDrain(delay: number) {
  if (galaxyTextureTimer || galaxyTextureQueue.length === 0) return;
  galaxyTextureTimer = setTimeout(drainGalaxyTextureQueue, delay);
}

export function preloadGalaxyTextures(memories: GalaxyMemory[], mode: GalaxyPreloadMode = "background") {
  if (isDesktopGalaxyClient()) {
    desktopTextures.preload(memories.filter((memory) => !isVideoUrl(memory.url)).map((memory) => memory.thumbnail_url || memory.url));
    return;
  }
  memories.forEach((memory) => {
    const imageUrl = memory.thumbnail_url || memory.url;
    if (isVideoUrl(memory.url) || galaxyTextureRequested.has(imageUrl)) return;
    galaxyTextureRequested.add(imageUrl);
    galaxyTextureQueue.push(imageUrl);
  });
  if (mode === "accelerated") galaxyPreloadMode = "accelerated";
  if (galaxyTextureTimer && mode === "accelerated") {
    clearTimeout(galaxyTextureTimer);
    galaxyTextureTimer = null;
  }
  if (!galaxyTextureTimer && galaxyTextureQueue.length > 0) drainGalaxyTextureQueue();
}

function useGalaxyTexture(url: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(() => isDesktopGalaxyClient() ? null : galaxyTextureCache.get(url) || null);
  useEffect(() => {
    if (isDesktopGalaxyClient()) return desktopTextures.subscribe(url, setTexture);
    const cached = galaxyTextureCache.get(url);
    if (cached) {
      setTexture(cached);
      return;
    }
    const listener = (loadedUrl: string, loadedTexture: THREE.Texture) => {
      if (loadedUrl === url) setTexture(loadedTexture);
    };
    galaxyTextureListeners.add(listener);
    preloadGalaxyTextures([{ url, title: "", meta: "" }], "accelerated");
    return () => { galaxyTextureListeners.delete(listener); };
  }, [url]);
  return texture;
}

function applyCenteredCover(texture: THREE.Texture, width: number, height: number, surfaceAspect = PHOTO_SURFACE_ASPECT) {
  if (!width || !height) return;
  const mediaAspect = width / height;
  texture.matrixAutoUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  if (mediaAspect > surfaceAspect) {
    const visibleWidth = surfaceAspect / mediaAspect;
    texture.repeat.x = visibleWidth;
    texture.offset.x = (1 - visibleWidth) / 2;
  } else {
    const visibleHeight = mediaAspect / surfaceAspect;
    texture.repeat.y = visibleHeight;
    texture.offset.y = (1 - visibleHeight) / 2;
  }
  texture.needsUpdate = true;
}

function ImageMediaSurface({ url, materialRef, onReady }: { url: string; materialRef: RefObject<THREE.MeshBasicMaterial | null>; onReady: () => void }) {
  const texture = useGalaxyTexture(url);
  useEffect(() => {
    if (texture) onReady();
  }, [onReady, texture]);
  return <mesh position={[0, 0, 0]}><planeGeometry args={[3.15, 3.15]} /><meshBasicMaterial ref={materialRef} map={texture} color={texture ? "#ffffff" : "#111719"} transparent opacity={0} toneMapped={false} /></mesh>;
}

function VideoMediaSurface({ url, playing, materialRef, onReady }: { url: string; playing: boolean; materialRef: RefObject<THREE.MeshBasicMaterial | null>; onReady: () => void }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const playingRef = useRef(playing);
  const media = useMemo(() => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { video, texture };
  }, [url]);
  useEffect(() => {
    playingRef.current = playing;
    if (playing && !failed) {
      media.video.preload = "auto";
      if (media.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) media.video.load();
      void media.video.play().catch(() => undefined);
    }
    else if (!playing) media.video.pause();
  }, [failed, media, playing, ready]);
  useEffect(() => {
    const video = media.video;
    const markReady = () => {
      media.texture.needsUpdate = true;
      setReady(true);
      onReady();
    };
    const seekFirstFrame = () => {
      applyCenteredCover(media.texture, video.videoWidth, video.videoHeight, VIDEO_SURFACE_ASPECT);
      if (playingRef.current) {
        video.preload = "auto";
        void video.play().catch(() => undefined);
      }
    };
    const fail = () => { setFailed(true); setReady(false); };
    video.addEventListener("loadedmetadata", seekFirstFrame);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("seeked", markReady);
    video.addEventListener("error", fail);
    video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekFirstFrame();
    return () => {
      video.removeEventListener("loadedmetadata", seekFirstFrame);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("seeked", markReady);
      video.removeEventListener("error", fail);
    };
  }, [media, onReady]);
  useEffect(() => () => {
      media.video.pause();
      media.video.removeAttribute("src");
      media.video.load();
      media.texture.dispose();
  }, [media]);
  return <mesh position={[0, 0.22, 0]}><planeGeometry args={[2.72, 3.15]} /><meshBasicMaterial ref={materialRef} map={ready && !failed ? media.texture : null} color={ready && !failed ? "#ffffff" : "#101719"} transparent opacity={0} toneMapped={false} /></mesh>;
}

function makeSnowflakeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.translate(48, 48);
  context.strokeStyle = "white";
  context.lineWidth = 3.5;
  context.lineCap = "round";
  context.shadowColor = "white";
  context.shadowBlur = 12;
  for (let arm = 0; arm < 6; arm += 1) {
    context.save();
    context.rotate((arm * Math.PI) / 3);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -34);
    context.moveTo(0, -18);
    context.lineTo(-8, -25);
    context.moveTo(0, -18);
    context.lineTo(8, -25);
    context.moveTo(0, -28);
    context.lineTo(-6, -33);
    context.moveTo(0, -28);
    context.lineTo(6, -33);
    context.stroke();
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function SnowField({ quality, reveal, density, brightness, preset }: { quality: Quality; reveal: boolean; density: number; brightness: number; preset: GalaxyScenePreset }) {
  const ref = useRef<THREE.Points>(null);
  const revealTime = useRef(0);
  const count = Math.round((quality === "mobile" ? 1500 : 2600) * density);
  const texture = useMemo(makeSnowflakeTexture, []);
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const [x, y, z] = ambientSpherePoint(index, count, 0.17);
      values[index * 3] = x;
      values[index * 3 + 1] = y;
      values[index * 3 + 2] = z;
    }
    return values;
  }, [count]);

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((state, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    if (preset === "snowfall") {
      const attribute = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const values = attribute.array as Float32Array;
      for (let index = 0; index < count; index += 1) {
        values[index * 3 + 1] = wrapFallingSphereY(values[index * 3], values[index * 3 + 1], values[index * 3 + 2], delta * (0.48 + (index % 7) * 0.035));
      }
      attribute.needsUpdate = true;
      ref.current.rotation.y += delta * 0.004;
    } else {
      ref.current.rotation.y += delta * (preset === "cosmos" ? 0.006 : 0.013);
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.08) * 0.025;
    }
    const material = ref.current.material as THREE.PointsMaterial;
    const entrance = THREE.MathUtils.smoothstep(revealTime.current, 0.6, 2.2);
    material.opacity = entrance * (0.48 + Math.sin(state.clock.elapsedTime * 0.45) * 0.08) * brightness;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={preset === "cosmos" ? null : texture} color={preset === "cosmos" ? "#bed7ff" : "#ffffff"} size={preset === "cosmos" ? (quality === "mobile" ? 0.12 : 0.15) : (quality === "mobile" ? 0.48 : 0.62)} transparent opacity={0.62} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation fog={false} />
    </points>
  );
}

function makeStarTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.17, "rgba(255,255,255,.95)");
  glow.addColorStop(0.5, "rgba(255,255,255,.28)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function StarField({ quality, reveal, density, brightness }: { quality: Quality; reveal: boolean; density: number; brightness: number }) {
  const ref = useRef<THREE.Points>(null);
  const revealTime = useRef(0);
  const count = Math.round((quality === "mobile" ? 2400 : 4800) * density);
  const texture = useMemo(makeStarTexture, []);
  const { positions, colors } = useMemo(() => {
    const points = new Float32Array(count * 3);
    const shades = new Float32Array(count * 3);
    const ice = new THREE.Color("#b5edff");
    const rose = new THREE.Color("#ffd0e7");
    const warm = new THREE.Color("#fff3c2");
    for (let index = 0; index < count; index += 1) {
      const [x, y, z] = ambientSpherePoint(index, count, 0.63);
      points[index * 3] = x;
      points[index * 3 + 1] = y;
      points[index * 3 + 2] = z;
      const color = index % 7 === 0 ? warm : index % 3 === 0 ? rose : ice;
      const strength = 0.65 + Math.random() * 0.35;
      shades[index * 3] = color.r * strength;
      shades[index * 3 + 1] = color.g * strength;
      shades[index * 3 + 2] = color.b * strength;
    }
    return { positions: points, colors: shades };
  }, [count]);

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((state, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    ref.current.rotation.y -= delta * 0.009;
    (ref.current.material as THREE.PointsMaterial).opacity = THREE.MathUtils.smoothstep(revealTime.current, 0.8, 2.5)
      * (0.58 + Math.sin(state.clock.elapsedTime * 0.75) * 0.09) * brightness;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} vertexColors size={quality === "mobile" ? 0.24 : 0.19} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation fog={false} />
    </points>
  );
}

function RadiantTree({ quality, reveal, density, brightness, growthDuration }: { quality: Quality; reveal: boolean; density: number; brightness: number; growthDuration: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const revealTime = useRef(0);
  const count = Math.round((quality === "mobile" ? 11000 : 18000) * density);
  const { positions, colors } = useMemo(() => {
    const points = new Float32Array(count * 3);
    const shades = new Float32Array(count * 3);
    const white = new THREE.Color("#ffffff");
    const pink = new THREE.Color("#ff75c9");
    const ice = new THREE.Color("#bfeaff");
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      // Generate directly in ascending Y order. drawRange can now reveal the
      // complete silhouette bottom-to-top without sorting tens of thousands of
      // particles on the main thread when the user enters the scene.
      const normalized = index / Math.max(1, count - 1);
      const y = normalized * 22 - 8;
      const tierPosition = normalized * 6;
      const tier = Math.min(5, Math.floor(tierPosition));
      const tierProgress = tierPosition - tier;
      const envelope = Math.max(0.18, (1 - normalized) * 7.9);
      const tierExpansion = 0.7 + Math.pow(1 - tierProgress, 2.4) * 0.42;
      const branchRadius = Math.pow(Math.random(), 0.7) * envelope * tierExpansion;
      const trunkWeight = 0.11 + normalized * 0.04;
      const radius = Math.random() < trunkWeight ? Math.random() * 0.5 : branchRadius;
      const angle = Math.random() * Math.PI * 2 + tier * 0.68;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points[index * 3] = x;
      points[index * 3 + 1] = y;
      points[index * 3 + 2] = z;
      color.copy(white);
      const edge = Math.min(1, Math.hypot(x, z) / 7.8);
      color.lerp(index % 5 === 0 ? ice : pink, radius < 0.55 ? 0.08 : 0.17 + edge * 0.34);
      color.multiplyScalar(0.8 + Math.random() * 0.55);
      shades[index * 3] = color.r;
      shades[index * 3 + 1] = color.g;
      shades[index * 3 + 2] = color.b;
    }
    return { positions: points, colors: shades };
  }, [count]);

  useEffect(() => {
    revealTime.current = 0;
    geometryRef.current?.setDrawRange(0, 0);
  }, [count, reveal]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    const progress = reveal ? THREE.MathUtils.smoothstep(revealTime.current, 0, growthDuration) : 0;
    geometryRef.current?.setDrawRange(0, Math.floor(count * progress));
    ref.current.rotation.y -= delta * 0.022;
    const material = ref.current.material as THREE.PointsMaterial;
    material.opacity = Math.min(1, progress * 4) * (0.76 + Math.sin(state.clock.elapsedTime * 1.5) * 0.07) * brightness;
  });

  return (
    <points ref={ref} position={[0, -1, 0]} frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={quality === "mobile" ? 0.105 : 0.085} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function ParticleGround({ quality, reveal, density, brightness, growthDuration }: { quality: Quality; reveal: boolean; density: number; brightness: number; growthDuration: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const revealTime = useRef(0);
  const count = Math.round((quality === "mobile" ? 2400 : 4200) * density);
  const { positions, colors } = useMemo(() => {
    const points = new Float32Array(count * 3);
    const shades = new Float32Array(count * 3);
    const pink = new THREE.Color("#ff77c8");
    const white = new THREE.Color("#ffffff");
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      // The buffer is already ordered from the root centre to the outer ground.
      // drawRange can therefore spread the particles outwards without sorting.
      const normalized = index / Math.max(1, count - 1);
      const radius = 0.35 + Math.sqrt(normalized) * 27.15;
      const angle = index * 2.399963229728653 + (Math.random() - 0.5) * 0.2;
      points[index * 3] = Math.cos(angle) * radius;
      points[index * 3 + 1] = -9.4 + Math.sin(radius * 0.55 + angle * 2) * 0.32 + (Math.random() - 0.5) * 0.38;
      points[index * 3 + 2] = Math.sin(angle) * radius;
      color.copy(white).lerp(pink, Math.random() * 0.34);
      shades[index * 3] = color.r;
      shades[index * 3 + 1] = color.g;
      shades[index * 3 + 2] = color.b;
    }
    return { positions: points, colors: shades };
  }, [count]);

  useEffect(() => {
    revealTime.current = 0;
    geometryRef.current?.setDrawRange(0, 0);
  }, [count, reveal]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    const progress = reveal ? THREE.MathUtils.smoothstep(revealTime.current, growthDuration * 0.08, growthDuration * 0.96) : 0;
    geometryRef.current?.setDrawRange(0, Math.floor(count * progress));
    ref.current.rotation.y += delta * 0.025;
    (ref.current.material as THREE.PointsMaterial).opacity = Math.min(1, progress * 3.5) * 0.58 * brightness;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={quality === "mobile" ? 0.07 : 0.055} transparent opacity={0.66} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function EnergyBeam({ quality, reveal, density, brightness, growthDuration }: { quality: Quality; reveal: boolean; density: number; brightness: number; growthDuration: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const revealTime = useRef(0);
  const count = Math.round((quality === "mobile" ? 900 : 1600) * density);
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const normalized = index / Math.max(1, count - 1);
      const y = normalized * 22 - 8.7;
      const radius = Math.pow(Math.random(), 4.5) * (0.45 + (y + 9) * 0.018);
      const angle = Math.random() * Math.PI * 2;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = y;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, [count]);

  useEffect(() => {
    revealTime.current = 0;
    geometryRef.current?.setDrawRange(0, 0);
  }, [count, reveal]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    const progress = reveal ? THREE.MathUtils.smoothstep(revealTime.current, 0, growthDuration) : 0;
    geometryRef.current?.setDrawRange(0, Math.floor(count * progress));
    ref.current.rotation.y += delta * 0.7;
    (ref.current.material as THREE.PointsMaterial).opacity = Math.min(1, progress * 4) * 0.62 * brightness;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry ref={geometryRef}><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#fff5fb" size={quality === "mobile" ? 0.085 : 0.07} transparent opacity={0.68} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function PhotoCard({ memory, position, floatPhase, revealAt, reveal, photoScale, borderColor, onSelect }: { memory: GalaxyMemory; position: [number, number, number]; floatPhase: number; revealAt: number; reveal: boolean; photoScale: number; borderColor: string; onSelect: (memory: GalaxyMemory, origin: PhotoOrigin) => void }) {
  const group = useRef<THREE.Group>(null);
  const frameMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const photoMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const dotMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const revealTime = useRef(0);
  const mediaRevealTime = useRef(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const interactionScale = useRef(1);
  const target = useMemo(() => new THREE.Vector3(), []);
  const markMediaReady = useCallback(() => setMediaReady(true), []);
  const prepareDetail = () => { if (!isVideoUrl(memory.url)) prepareGalaxyDetailImage(memory.url); };
  useCursor(hovered);
  useFrame((state, delta) => {
    if (!group.current) return;
    if (reveal) revealTime.current += delta;
    if (reveal && mediaReady) mediaRevealTime.current += delta;
    const treeProgress = THREE.MathUtils.smoothstep(revealTime.current, revealAt, revealAt + 1.25);
    const mediaProgress = mediaReady ? THREE.MathUtils.smoothstep(mediaRevealTime.current, 0, 0.65) : 0;
    const progress = Math.min(treeProgress, mediaProgress);
    group.current.visible = progress > 0.001;
    group.current.quaternion.copy(state.camera.quaternion);
    group.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.55 + floatPhase) * 0.28;
    const interactionTarget = reduceMotion ? 1 : pressed ? .98 : hovered ? 1.03 : 1;
    // Frame-rate independent ease-out, reaching 99% of the target in 220ms.
    interactionScale.current = THREE.MathUtils.lerp(interactionScale.current, interactionTarget, reduceMotion ? 1 : 1 - Math.exp(-Math.log(100) * delta / .22));
    const scale = photoScale * (0.94 + progress * 0.06) * interactionScale.current;
    target.set(scale, scale, scale);
    group.current.scale.copy(target);
    if (frameMaterial.current) frameMaterial.current.opacity = progress;
    if (photoMaterial.current) photoMaterial.current.opacity = progress;
    if (dotMaterial.current) dotMaterial.current.opacity = progress;
  });

  return (
    <group ref={group} position={position} onPointerOver={(event) => { event.stopPropagation(); prepareDetail(); setHovered(true); }} onPointerOut={() => { setHovered(false); setPressed(false); }} onPointerDown={(event) => { event.stopPropagation(); prepareDetail(); setPressed(true); }} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onClick={(event) => { event.stopPropagation(); setPressed(false); const pointer = event.nativeEvent; onSelect(memory, { x: pointer.clientX, y: pointer.clientY }); }}>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={isVideoUrl(memory.url) ? [3.05, 3.95] : [3.45, 3.45]} />
        <meshBasicMaterial ref={frameMaterial} color={borderColor} transparent opacity={0} toneMapped={false} />
      </mesh>
      {isVideoUrl(memory.url) ? <VideoMediaSurface url={memory.url} playing={hovered} materialRef={photoMaterial} onReady={markMediaReady} /> : <ImageMediaSurface url={memory.thumbnail_url || memory.url} materialRef={photoMaterial} onReady={markMediaReady} />}
      <mesh position={[-1.1, isVideoUrl(memory.url) ? -1.68 : -1.65, 0.02]}>
        <circleGeometry args={[0.055, 16]} />
        <meshBasicMaterial ref={dotMaterial} color={hovered ? "#ff75c9" : "#2e3333"} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 1, 0);
  }, [camera]);
  return null;
}

function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const reported = useRef(false);
  useFrame(() => {
    if (reported.current) return;
    frames.current += 1;
    if (frames.current >= 3) {
      reported.current = true;
      onReady();
    }
  });
  return null;
}

const Scene = memo(function Scene({ memories, quality, reveal, settings, onReady, onSelect }: { memories: GalaxyMemory[]; quality: Quality; reveal: boolean; settings: GalaxySettings; onReady: () => void; onSelect: (memory: GalaxyMemory, origin: PhotoOrigin) => void }) {
  const particleDensity = settingFactor(settings.galaxy_particle_density, 70);
  const snowDensity = settingFactor(settings.galaxy_snow_density, 75);
  const brightness = settingFactor(settings.galaxy_particle_brightness, 100);
  const growthDuration = settingNumber(settings.galaxy_growth_duration, 4, 1.5, 12);
  const photoScale = settingNumber(settings.galaxy_photo_scale, 70, 35, 130) / 100;
  const photoSpread = settingNumber(settings.galaxy_photo_spread, 115, 70, 180) / 100;
  const photoBorderColor = /^#[0-9a-f]{6}$/i.test(settings.galaxy_photo_border_color) ? settings.galaxy_photo_border_color : "#242b30";
  const photoPlan = useMemo(() => createPhotoPlan(memories, photoSpread, growthDuration * 0.56), [growthDuration, memories, photoSpread]);
  const preset = settings.galaxy_scene_preset;
  const background = preset === "cosmos" ? "#02030d" : "#000000";
  const fog = preset === "cosmos" ? "#06091a" : "#000000";

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[fog, 28, 74]} />
      <CameraRig />
      {isDesktopGalaxyClient() && <DesktopTextureUploads />}
      <SnowField quality={quality} reveal={reveal} density={snowDensity} brightness={brightness} preset={preset} />
      <StarField quality={quality} reveal={reveal} density={snowDensity} brightness={brightness} />
      <ParticleGround quality={quality} reveal={reveal} density={particleDensity} brightness={brightness} growthDuration={growthDuration} />
      <EnergyBeam quality={quality} reveal={reveal} density={particleDensity} brightness={brightness} growthDuration={growthDuration} />
      <RadiantTree quality={quality} reveal={reveal} density={particleDensity} brightness={brightness} growthDuration={growthDuration} />
      {photoPlan.map((photo) => <Suspense key={`${photo.key}-${photo.memory.url}`} fallback={null}><PhotoCard memory={photo.memory} position={photo.position} floatPhase={photo.floatPhase} revealAt={photo.revealAt} reveal={reveal} photoScale={photoScale} borderColor={photoBorderColor} onSelect={onSelect} /></Suspense>)}
      <SceneReady onReady={onReady} />
      <OrbitControls enablePan={false} enableZoom minDistance={18} maxDistance={46} zoomSpeed={0.65} enableDamping dampingFactor={0.055} rotateSpeed={0.42} autoRotate autoRotateSpeed={preset === "cosmos" ? 0.12 : preset === "snowfall" ? 0.14 : 0.22} minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.69} />
    </>
  );
});

function MemoryDetailMedia({ memory, opening, onAspectChange }: { memory: GalaxyMemory; opening: boolean; onAspectChange: (aspect: number) => void }) {
  const primaryIsVideo = isVideoUrl(memory.url);
  const imageUrl = primaryIsVideo ? "" : memory.url;
  const videoUrl = memory.video_url || (primaryIsVideo ? memory.url : "");
  const [view, setView] = useState<"image" | "video">(imageUrl ? "image" : "video");
  const [videoReady, setVideoReady] = useState(false);
  const [imageAspect, setImageAspect] = useState(() => galaxyDetailImageAspect(memory.url));
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoAdvanced = useRef(false);
  useEffect(() => { if (!opening) onAspectChange(view === "image" ? imageAspect : videoAspect); }, [opening, view, imageAspect, videoAspect, onAspectChange]);
  useEffect(() => {
    setView(imageUrl ? "image" : "video");
    setVideoReady(false);
    autoAdvanced.current = false;
  }, [imageUrl, videoUrl]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (view === "video" && videoReady) void video.play().catch(() => undefined);
    else video.pause();
  }, [view, videoReady]);
  const videoAvailable = Boolean(videoUrl);
  const showVideo = () => {
    if (videoReady || !imageUrl) setView("video");
  };
  useEffect(() => {
    if (!imageUrl || !videoReady || autoAdvanced.current) return;
    autoAdvanced.current = true;
    const timer = window.setTimeout(() => setView("video"), 500);
    return () => window.clearTimeout(timer);
  }, [imageUrl, videoReady]);
  return <div className="ix-detail-media" style={{ "--media-aspect": view === "image" ? imageAspect : videoAspect } as CSSProperties}>
    {imageUrl && <img decoding="async" className={view === "image" ? "is-active" : ""} src={imageUrl} alt={memory.title} onLoad={(event) => { const image = event.currentTarget; if (image.naturalHeight) setImageAspect(image.naturalWidth / image.naturalHeight); }} />}
    {videoAvailable && <video ref={videoRef} className={view === "video" ? "is-active" : ""} src={videoUrl} aria-label={memory.title} controls={view === "video"} muted loop playsInline preload="auto" onCanPlay={() => setVideoReady(true)} onLoadedMetadata={(event) => { const video = event.currentTarget; if (video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight); }} />}
    {imageUrl && videoAvailable && <div className="ix-media-dots" aria-label="图片与视频切换">
      {imageUrl && <button type="button" className={`image-dot${view === "image" ? " active" : ""}`} aria-label="查看图片" onClick={() => setView("image")} />}
      {videoAvailable && <button type="button" className={`video-dot${view === "video" ? " active" : ""}`} aria-label={videoReady ? "播放视频" : "视频加载中"} onClick={showVideo} />}
    </div>}
    {videoAvailable && !videoReady && <span className="ix-video-wait">视频加载中，先为你展示照片</span>}
  </div>;
}

export default function MemoryGalaxy({ memories, onClose, revealStarted, onSceneReady, settings }: { memories: GalaxyMemory[]; onClose: () => void; revealStarted: boolean; onSceneReady: () => void; settings: GalaxySettings }) {
  const [active, setActive] = useState<{ memory: GalaxyMemory; origin: PhotoOrigin } | null>(null);
  const [quality, setQuality] = useState<Quality>("desktop");
  const [immersive, setImmersive] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mediaAspect, setMediaAspect] = useState(1);
  const [detailOpening, setDetailOpening] = useState(false);
  const selectMemory = useCallback((memory: GalaxyMemory, origin: PhotoOrigin) => {
    setMediaAspect(galaxyDetailImageAspect(memory.url));
    setDetailOpening(true);
    setActive({ memory, origin });
  }, []);
  const [viewport, setViewport] = useState({ width: 1280, height: 900 });
  const layout = galaxyMediaLayout(mediaAspect, viewport.width, viewport.height);
  const closeSmoothly = () => {
    if (leaving) return;
    setActive(null);
    setLeaving(true);
    window.setTimeout(onClose, 720);
  };
  useEffect(() => {
    const update = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
      const constrained = window.innerWidth < 900
        || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
        || (typeof navigatorWithMemory.deviceMemory === "number" && navigatorWithMemory.deviceMemory <= 4);
      setQuality(constrained ? "mobile" : "desktop");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div className={`ix-galaxy${revealStarted ? " is-revealing" : " is-waiting"}${immersive ? " is-immersive" : ""}${leaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="可旋转的青春记忆树" aria-busy={leaving}>
      <div className="ix-galaxy-top">
        <div className="ix-galaxy-actions"><button className="ix-return-button" onClick={closeSmoothly} disabled={leaving} aria-label="返回主页">← 返回现实</button><button className="ix-immersive-button" onClick={() => setImmersive((current) => !current)}>{immersive ? "退出沉浸式观看" : "沉浸观看"}</button></div>
        <div className="ix-galaxy-heading"><span>MEMORY ARCHIVE / 2026</span><strong>3D 粒子树</strong></div>
        <span className="ix-live"><i /> 正在流动</span>
      </div>
      <div className="ix-galaxy-help">拖动旋转 · 双指或滚轮缩放 · 悬停放大 · 点击查看</div>
      <Canvas className="ix-galaxy-canvas" dpr={quality === "mobile" ? [0.7, 0.9] : [0.8, 1]} camera={{ position: [0, 2.5, 31], fov: 52, near: 0.1, far: 120 }} gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}>
        <Suspense fallback={null}><Scene memories={memories} quality={quality} reveal={revealStarted} settings={settings} onReady={onSceneReady} onSelect={selectMemory} /></Suspense>
      </Canvas>
      <div className="ix-galaxy-title"><span>THE DAYS WE SHINE</span><strong>我们走过的日子</strong><small>{settings.galaxy_scene_preset === "cosmos" ? "每一颗星，都对应一段仍在发光的记忆" : settings.galaxy_scene_preset === "snowfall" ? "像初次遇见的雪，安静落进我们的故事里" : "每一片雪花，都替记忆保存了一点光"}</small></div>
      {active && (
        <div key={active.memory.url} className={`ix-memory-detail ix-galaxy-detail${layout.stacked ? " is-wide-media" : ""}${detailOpening ? " is-opening" : ""}`} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setDetailOpening(false); }} role="dialog" aria-label={`照片详情：${active.memory.title}`} style={{ "--detail-x": `${active.origin.x}px`, "--detail-y": `${active.origin.y}px`, "--detail-width": `${layout.panelWidth}px`, "--detail-media-width": `${layout.width}px`, "--detail-media-height": `${layout.height}px` } as CSSProperties}>
          <button onClick={() => setActive(null)} aria-label="关闭照片详情">×</button>
          <MemoryDetailMedia key={active.memory.url} memory={active.memory} opening={detailOpening} onAspectChange={setMediaAspect} />
          <div><span>{active.memory.taken_at ? `${new Date(active.memory.taken_at).toLocaleString("zh-CN", { hour12: false })}${active.memory.meta ? ` · ${active.memory.meta}` : ""}` : active.memory.meta}</span><h2>{active.memory.title}</h2><p>{active.memory.body || "这段记忆还没有写下正文。"}</p></div>
        </div>
      )}
      <div className="ix-galaxy-exit-wash" aria-hidden="true" />
    </div>
  );
}
