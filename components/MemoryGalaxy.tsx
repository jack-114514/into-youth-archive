"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useCursor, useTexture } from "@react-three/drei";
import * as THREE from "three";

export type GalaxyMemory = { id?: number; url: string; video_url?: string; title: string; meta: string; body?: string; taken_at?: string; sort_order?: number; show_on_home?: number; show_in_3d?: number };

type Quality = "mobile" | "desktop";
type PhotoOrigin = { x: number; y: number };

function isVideoUrl(url: string) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(url) || url.startsWith("data:video/");
}

const PHOTO_SURFACE_ASPECT = 2.72 / 3.15;

function applyCenteredCover(texture: THREE.Texture, width: number, height: number) {
  if (!width || !height) return;
  const mediaAspect = width / height;
  texture.matrixAutoUpdate = true;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  if (mediaAspect > PHOTO_SURFACE_ASPECT) {
    const visibleWidth = PHOTO_SURFACE_ASPECT / mediaAspect;
    texture.repeat.x = visibleWidth;
    texture.offset.x = (1 - visibleWidth) / 2;
  } else {
    const visibleHeight = mediaAspect / PHOTO_SURFACE_ASPECT;
    texture.repeat.y = visibleHeight;
    texture.offset.y = (1 - visibleHeight) / 2;
  }
  texture.needsUpdate = true;
}

function ImageMediaSurface({ url, materialRef }: { url: string; materialRef: RefObject<THREE.MeshBasicMaterial | null> }) {
  const sourceTexture = useTexture(url);
  const texture = useMemo(() => {
    const nextTexture = sourceTexture.clone();
    const image = sourceTexture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | undefined;
    applyCenteredCover(nextTexture, image?.naturalWidth || image?.width || 0, image?.naturalHeight || image?.height || 0);
    return nextTexture;
  }, [sourceTexture]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[0, 0.22, 0]}><planeGeometry args={[2.72, 3.15]} /><meshBasicMaterial ref={materialRef} map={texture} transparent opacity={0} toneMapped={false} /></mesh>;
}

function VideoMediaSurface({ url, playing, materialRef }: { url: string; playing: boolean; materialRef: RefObject<THREE.MeshBasicMaterial | null> }) {
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
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { video, texture };
  }, [url]);
  useEffect(() => {
    playingRef.current = playing;
    if (playing && ready && !failed) void media.video.play().catch(() => undefined);
    else if (!playing) media.video.pause();
  }, [failed, media, playing, ready]);
  useEffect(() => {
    const video = media.video;
    let warmFrameTimer = 0;
    const markReady = () => {
      media.texture.needsUpdate = true;
      setReady(true);
    };
    const pauseAfterWarmFrame = () => {
      markReady();
      if (!playingRef.current) video.pause();
    };
    const warmFirstFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markReady();
      void video.play().then(() => {
        const frameVideo = video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
        if (frameVideo.requestVideoFrameCallback) frameVideo.requestVideoFrameCallback(pauseAfterWarmFrame);
        else warmFrameTimer = window.setTimeout(pauseAfterWarmFrame, 90);
      }).catch(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markReady();
      });
    };
    const seekFirstFrame = () => {
      applyCenteredCover(media.texture, video.videoWidth, video.videoHeight);
      try { video.currentTime = Math.min(0.06, Math.max(0, video.duration || 0)); } catch { /* loadeddata still provides a fallback frame */ }
      warmFirstFrame();
    };
    const fail = () => { setFailed(true); setReady(false); };
    video.addEventListener("loadedmetadata", seekFirstFrame);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("seeked", markReady);
    video.addEventListener("error", fail);
    video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekFirstFrame();
    return () => {
      window.clearTimeout(warmFrameTimer);
      video.removeEventListener("loadedmetadata", seekFirstFrame);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("seeked", markReady);
      video.removeEventListener("error", fail);
    };
  }, [media]);
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

function SnowField({ quality, reveal }: { quality: Quality; reveal: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const revealTime = useRef(0);
  const count = quality === "mobile" ? 520 : 760;
  const texture = useMemo(makeSnowflakeTexture, []);
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 18 + Math.random() * 42;
      const angle = Math.random() * Math.PI * 2;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = (Math.random() - 0.48) * 42;
      values[index * 3 + 2] = Math.sin(angle) * radius - 8;
    }
    return values;
  }, [count]);

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((state, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    ref.current.rotation.y += delta * 0.013;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.08) * 0.025;
    const material = ref.current.material as THREE.PointsMaterial;
    const entrance = THREE.MathUtils.smoothstep(revealTime.current, 0.6, 2.2);
    material.opacity = entrance * (0.55 + Math.sin(state.clock.elapsedTime * 0.45) * 0.11);
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} color="#ffffff" size={quality === "mobile" ? 0.55 : 0.7} transparent opacity={0.62} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function RadiantTree({ quality, reveal }: { quality: Quality; reveal: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const revealTime = useRef(0);
  const count = quality === "mobile" ? 19000 : 27000;
  const { positions, colors } = useMemo(() => {
    const points = new Float32Array(count * 3);
    const shades = new Float32Array(count * 3);
    const white = new THREE.Color("#ffffff");
    const pink = new THREE.Color("#ff75c9");
    const ice = new THREE.Color("#bfeaff");
    for (let index = 0; index < count; index += 1) {
      const trunk = index < count * 0.13;
      let x: number;
      let y: number;
      let z: number;
      if (trunk) {
        y = Math.random() * 13 - 8;
        const radius = 0.22 + Math.random() * 0.42;
        const angle = Math.random() * Math.PI * 2;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      } else {
        const normalized = Math.random();
        y = normalized * 19 - 4.8;
        const tier = Math.floor(normalized * 6);
        const tierProgress = normalized * 6 - tier;
        const envelope = (1 - normalized) * 7.8 + 0.35;
        const tierRadius = envelope * (0.7 + Math.pow(1 - tierProgress, 2.5) * 0.4);
        const radius = Math.pow(Math.random(), 0.72) * tierRadius;
        const angle = Math.random() * Math.PI * 2 + tier * 0.7;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      }
      points[index * 3] = x;
      points[index * 3 + 1] = y;
      points[index * 3 + 2] = z;
      const color = white.clone();
      const edge = Math.min(1, Math.hypot(x, z) / 7.8);
      color.lerp(index % 5 === 0 ? ice : pink, trunk ? 0.08 : 0.17 + edge * 0.34);
      color.multiplyScalar(0.8 + Math.random() * 0.55);
      shades[index * 3] = color.r;
      shades[index * 3 + 1] = color.g;
      shades[index * 3 + 2] = color.b;
    }
    const order = Array.from({ length: count }, (_, index) => index).sort((a, b) => {
      const ay = (points[a * 3 + 1] + 8) / 22.2;
      const by = (points[b * 3 + 1] + 8) / 22.2;
      const ar = Math.hypot(points[a * 3], points[a * 3 + 2]) / 8;
      const br = Math.hypot(points[b * 3], points[b * 3 + 2]) / 8;
      return ay * 0.78 + ar * 0.22 - (by * 0.78 + br * 0.22);
    });
    const sortedPoints = new Float32Array(count * 3);
    const sortedShades = new Float32Array(count * 3);
    order.forEach((source, target) => {
      sortedPoints.set(points.subarray(source * 3, source * 3 + 3), target * 3);
      sortedShades.set(shades.subarray(source * 3, source * 3 + 3), target * 3);
    });
    return { positions: sortedPoints, colors: sortedShades };
  }, [count]);

  useEffect(() => {
    revealTime.current = 0;
    geometryRef.current?.setDrawRange(0, 0);
  }, [count, reveal]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    const progress = reveal ? THREE.MathUtils.smoothstep(revealTime.current, 0, 3.05) : 0;
    geometryRef.current?.setDrawRange(0, Math.floor(count * progress));
    ref.current.rotation.y -= delta * 0.022;
    const material = ref.current.material as THREE.PointsMaterial;
    material.opacity = Math.min(1, progress * 4) * (0.82 + Math.sin(state.clock.elapsedTime * 1.5) * 0.09);
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

function ParticleGround({ quality, reveal }: { quality: Quality; reveal: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const revealTime = useRef(0);
  const count = quality === "mobile" ? 5000 : 7200;
  const { positions, colors } = useMemo(() => {
    const points = new Float32Array(count * 3);
    const shades = new Float32Array(count * 3);
    const pink = new THREE.Color("#ff77c8");
    const white = new THREE.Color("#ffffff");
    for (let index = 0; index < count; index += 1) {
      const radius = 4.5 + Math.sqrt(Math.random()) * 23;
      const angle = Math.random() * Math.PI * 2;
      points[index * 3] = Math.cos(angle) * radius;
      points[index * 3 + 1] = -9.4 + Math.sin(radius * 0.55 + angle * 2) * 0.32 + (Math.random() - 0.5) * 0.38;
      points[index * 3 + 2] = Math.sin(angle) * radius;
      const color = white.clone().lerp(pink, Math.random() * 0.34);
      shades[index * 3] = color.r;
      shades[index * 3 + 1] = color.g;
      shades[index * 3 + 2] = color.b;
    }
    return { positions: points, colors: shades };
  }, [count]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    ref.current.rotation.y += delta * 0.025;
    (ref.current.material as THREE.PointsMaterial).opacity = THREE.MathUtils.smoothstep(revealTime.current, 0.35, 1.8) * 0.66;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={quality === "mobile" ? 0.07 : 0.055} transparent opacity={0.66} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function EnergyBeam({ quality, reveal }: { quality: Quality; reveal: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const revealTime = useRef(0);
  const count = quality === "mobile" ? 2600 : 3600;
  const positions = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const y = Math.random() * 22 - 8.7;
      const radius = Math.pow(Math.random(), 4.5) * (0.45 + (y + 9) * 0.018);
      const angle = Math.random() * Math.PI * 2;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = y;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }
    return values;
  }, [count]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (reveal) revealTime.current += delta;
    ref.current.rotation.y += delta * 0.7;
    (ref.current.material as THREE.PointsMaterial).opacity = THREE.MathUtils.smoothstep(revealTime.current, 0.15, 1.45) * 0.68;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#fff5fb" size={quality === "mobile" ? 0.085 : 0.07} transparent opacity={0.68} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function PhotoCard({ memory, index, total, reveal, onSelect }: { memory: GalaxyMemory; index: number; total: number; reveal: boolean; onSelect: (memory: GalaxyMemory, origin: PhotoOrigin) => void }) {
  const group = useRef<THREE.Group>(null);
  const frameMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const photoMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const dotMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const revealTime = useRef(0);
  const [hovered, setHovered] = useState(false);
  const target = useMemo(() => new THREE.Vector3(), []);
  useCursor(hovered);
  const position = useMemo<[number, number, number]>(() => {
    const ring = index % 2;
    const angle = (index / Math.max(total, 1)) * Math.PI * 2 + ring * 0.42;
    const radius = 14.5 + ring * 4.2;
    return [Math.cos(angle) * radius, -2 + ((index * 7) % 12), Math.sin(angle) * radius];
  }, [index, total]);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (reveal) revealTime.current += delta;
    const progress = THREE.MathUtils.smoothstep(revealTime.current, 2.35 + index * 0.1, 3.35 + index * 0.1);
    group.current.visible = progress > 0.001;
    group.current.quaternion.copy(state.camera.quaternion);
    group.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.55 + index) * 0.28;
    const scale = (0.9 + progress * 0.1) * (hovered ? 1.34 : 1);
    target.set(scale, scale, scale);
    group.current.scale.lerp(target, 1 - Math.pow(0.002, delta));
    if (frameMaterial.current) frameMaterial.current.opacity = progress;
    if (photoMaterial.current) photoMaterial.current.opacity = progress;
    if (dotMaterial.current) dotMaterial.current.opacity = progress;
  });

  const stop = (event: ThreeEvent<PointerEvent>) => event.stopPropagation();
  return (
    <group ref={group} position={position} onPointerOver={(event) => { stop(event); setHovered(true); }} onPointerOut={() => setHovered(false)} onClick={(event) => { stop(event); const pointer = event.nativeEvent as PointerEvent; onSelect(memory, { x: pointer.clientX, y: pointer.clientY }); }}>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[3.05, 3.95]} />
        <meshBasicMaterial ref={frameMaterial} color="#f8f7f2" transparent opacity={0} toneMapped={false} />
      </mesh>
      {isVideoUrl(memory.url) ? <VideoMediaSurface url={memory.url} playing={hovered} materialRef={photoMaterial} /> : <ImageMediaSurface url={memory.url} materialRef={photoMaterial} />}
      <mesh position={[-1.1, -1.68, 0.02]}>
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

function Scene({ memories, quality, reveal, onReady, onSelect }: { memories: GalaxyMemory[]; quality: Quality; reveal: boolean; onReady: () => void; onSelect: (memory: GalaxyMemory, origin: PhotoOrigin) => void }) {
  const visible = memories;
  return (
    <>
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#000000", 28, 74]} />
      <CameraRig />
      <SnowField quality={quality} reveal={reveal} />
      <ParticleGround quality={quality} reveal={reveal} />
      <EnergyBeam quality={quality} reveal={reveal} />
      <RadiantTree quality={quality} reveal={reveal} />
      {visible.map((memory, index) => <Suspense key={`${memory.id ?? memory.url}-${index}`} fallback={null}><PhotoCard memory={memory} index={index} total={visible.length} reveal={reveal} onSelect={onSelect} /></Suspense>)}
      <SceneReady onReady={onReady} />
      <OrbitControls enablePan={false} enableZoom minDistance={18} maxDistance={46} zoomSpeed={0.65} enableDamping dampingFactor={0.055} rotateSpeed={0.42} autoRotate autoRotateSpeed={0.22} minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.69} />
    </>
  );
}

function MemoryDetailMedia({ memory }: { memory: GalaxyMemory }) {
  const primaryIsVideo = isVideoUrl(memory.url);
  const imageUrl = primaryIsVideo ? "" : memory.url;
  const videoUrl = memory.video_url || (primaryIsVideo ? memory.url : "");
  const [view, setView] = useState<"image" | "video">(imageUrl ? "image" : "video");
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoAdvanced = useRef(false);
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
  const handleVideoReady = () => {
    setVideoReady(true);
    if (imageUrl && !autoAdvanced.current) {
      autoAdvanced.current = true;
      window.setTimeout(() => setView("video"), 500);
    }
  };
  return <div className="ix-detail-media">
    {imageUrl && <img className={view === "image" ? "is-active" : ""} src={imageUrl} alt={memory.title} />}
    {videoAvailable && <video ref={videoRef} className={view === "video" ? "is-active" : ""} src={videoUrl} aria-label={memory.title} controls={view === "video"} muted loop playsInline preload="auto" onCanPlay={handleVideoReady} />}
    <div className="ix-media-dots" aria-label="图片与视频切换">
      {imageUrl && <button type="button" className={`image-dot${view === "image" ? " active" : ""}`} aria-label="查看图片" onClick={() => setView("image")} />}
      {videoAvailable && <button type="button" className={`video-dot${view === "video" ? " active" : ""}`} aria-label={videoReady ? "播放视频" : "视频加载中"} onClick={showVideo} />}
    </div>
    {videoAvailable && !videoReady && <span className="ix-video-wait">视频加载中，先为你展示照片</span>}
  </div>;
}

export default function MemoryGalaxy({ memories, onClose, revealStarted, onSceneReady }: { memories: GalaxyMemory[]; onClose: () => void; revealStarted: boolean; onSceneReady: () => void }) {
  const [active, setActive] = useState<{ memory: GalaxyMemory; origin: PhotoOrigin } | null>(null);
  const [quality, setQuality] = useState<Quality>("desktop");
  const [immersive, setImmersive] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeSmoothly = () => {
    if (leaving) return;
    setActive(null);
    setLeaving(true);
    window.setTimeout(onClose, 720);
  };
  useEffect(() => {
    const update = () => setQuality(window.innerWidth < 760 ? "mobile" : "desktop");
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div className={`ix-galaxy${revealStarted ? " is-revealing" : " is-waiting"}${immersive ? " is-immersive" : ""}${leaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="可旋转的青春记忆树" aria-busy={leaving}>
      <div className="ix-galaxy-top">
        <div className="ix-galaxy-actions"><button className="ix-return-button" onClick={closeSmoothly} disabled={leaving} aria-label="返回主页">← 返回现实</button><button className="ix-immersive-button" onClick={() => setImmersive((current) => !current)}>{immersive ? "退出沉浸式观看" : "沉浸观看"}</button></div>
        <div className="ix-galaxy-heading"><span>MEMORY ARCHIVE / 2026</span><strong>青春时间河</strong></div>
        <span className="ix-live"><i /> 正在流动</span>
      </div>
      <div className="ix-galaxy-help">拖动旋转 · 双指或滚轮缩放 · 悬停放大 · 点击查看</div>
      <Canvas className="ix-galaxy-canvas" dpr={quality === "mobile" ? [1, 1.35] : [1, 1.5]} camera={{ position: [0, 2.5, 31], fov: 52, near: 0.1, far: 120 }} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}>
        <Suspense fallback={null}><Scene memories={memories} quality={quality} reveal={revealStarted} onReady={onSceneReady} onSelect={(memory, origin) => setActive({ memory, origin })} /></Suspense>
      </Canvas>
      <div className="ix-galaxy-title"><span>THE DAYS WE SHINE</span><strong>我们走过的日子</strong><small>每一片雪花，都替记忆保存了一点光</small></div>
      {active && (
        <div className="ix-memory-detail ix-galaxy-detail" style={{ "--detail-x": `${active.origin.x}px`, "--detail-y": `${active.origin.y}px` } as CSSProperties}>
          <button onClick={() => setActive(null)} aria-label="关闭照片详情">×</button>
          <MemoryDetailMedia memory={active.memory} />
          <div><span>{active.memory.taken_at ? `${new Date(active.memory.taken_at).toLocaleString("zh-CN", { hour12: false })}${active.memory.meta ? ` · ${active.memory.meta}` : ""}` : active.memory.meta}</span><h2>{active.memory.title}</h2><p>{active.memory.body || "这段记忆还没有写下正文。"}</p></div>
        </div>
      )}
      <div className="ix-galaxy-exit-wash" aria-hidden="true" />
    </div>
  );
}
