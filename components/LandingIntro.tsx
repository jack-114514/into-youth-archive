"use client";

import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

export type HomepageIntroSettings = {
  intro_logo: string;
  intro_title: string;
  intro_subtitle: string;
  intro_background_image: string;
  intro_background_desktop_image: string;
  intro_background_mobile_image: string;
  intro_background_desktop_x: string;
  intro_background_desktop_y: string;
  intro_background_desktop_zoom: string;
  intro_background_desktop_crop_left: string;
  intro_background_desktop_crop_top: string;
  intro_background_desktop_crop_width: string;
  intro_background_desktop_crop_height: string;
  intro_background_desktop_ratio_locked: string;
  intro_background_mobile_x: string;
  intro_background_mobile_y: string;
  intro_background_mobile_zoom: string;
  intro_background_mobile_crop_left: string;
  intro_background_mobile_crop_top: string;
  intro_background_mobile_crop_width: string;
  intro_background_mobile_crop_height: string;
  intro_background_mobile_ratio_locked: string;
  intro_background_blur: string;
  intro_background_brightness: string;
  intro_background_overlay: string;
  intro_watermark_opacity: string;
  intro_watermark_1: string;
  intro_watermark_2: string;
  intro_enabled: string;
  intro_show_enter_button: string;
  intro_loading_duration: string;
};

export type HomepageIntroNode = {
  id?: number | string;
  title: string;
  subtitle: string;
  sort_order: number;
  enabled: number;
};

export const defaultHomepageIntroSettings: HomepageIntroSettings = {
  intro_logo: "",
  intro_title: "记忆档案",
  intro_subtitle: "MY MEMORY ARCHIVE",
  intro_background_image: "",
  intro_background_desktop_image: "",
  intro_background_mobile_image: "",
  intro_background_desktop_x: "50",
  intro_background_desktop_y: "50",
  intro_background_desktop_zoom: "100",
  intro_background_desktop_crop_left: "",
  intro_background_desktop_crop_top: "",
  intro_background_desktop_crop_width: "",
  intro_background_desktop_crop_height: "",
  intro_background_desktop_ratio_locked: "1",
  intro_background_mobile_x: "50",
  intro_background_mobile_y: "50",
  intro_background_mobile_zoom: "100",
  intro_background_mobile_crop_left: "",
  intro_background_mobile_crop_top: "",
  intro_background_mobile_crop_width: "",
  intro_background_mobile_crop_height: "",
  intro_background_mobile_ratio_locked: "1",
  intro_background_blur: "0",
  intro_background_brightness: "104",
  intro_background_overlay: "100",
  intro_watermark_opacity: "13",
  intro_watermark_1: "YOUTH",
  intro_watermark_2: "MEMORY",
  intro_enabled: "1",
  intro_show_enter_button: "1",
  intro_loading_duration: "6000",
};

export const defaultHomepageIntroNodes: HomepageIntroNode[] = [
  { id: "default-1", title: "入学", subtitle: "ARRIVAL", sort_order: 1, enabled: 1 },
  { id: "default-2", title: "军训", subtitle: "TRAINING", sort_order: 2, enabled: 1 },
  { id: "default-3", title: "社团", subtitle: "COMMUNITY", sort_order: 3, enabled: 1 },
  { id: "default-4", title: "毕业", subtitle: "GRADUATION", sort_order: 4, enabled: 1 },
];

export function normalizeHomepageIntroSettings(value: Partial<HomepageIntroSettings> | undefined): HomepageIntroSettings {
  const normalized = { ...defaultHomepageIntroSettings, ...(value || {}) };
  normalized.intro_background_desktop_image ||= normalized.intro_background_image;
  return normalized;
}

type IntroPoint = { x: number; y: number; progress: number };
type IntroStyle = CSSProperties & Record<`--${string}`, string | number>;

const ROUTE_PATH = "M 58 174 C 158 238, 235 76, 350 139 S 548 226, 650 113 S 826 70, 942 151";
const easeOut = [0.22, 1, 0.36, 1] as const;

function enabledNodes(nodes: HomepageIntroNode[]) {
  return [...nodes]
    .filter((node) => Number(node.enabled) === 1)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
}

type IntroBgSize = { width: number; height: number };

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Compute the intro background image's "cover + pan + zoom" placement so the saved
// x%/y%/zoom% (pan fractions + magnification) render as a free pan on both axes.
function introBackgroundStyle(
  xPct: number,
  yPct: number,
  zoomPct: number,
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
): CSSProperties {
  if (!boxWidth || !boxHeight || !imageWidth || !imageHeight) return {};
  const zoom = Math.max(1, zoomPct / 100);
  const coverScale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * coverScale * zoom;
  const height = imageHeight * coverScale * zoom;
  const left = (boxWidth - width) * (clampNumber(xPct, 0, 100) / 100);
  const top = (boxHeight - height) * (clampNumber(yPct, 0, 100) / 100);
  return {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${width}px`,
    height: `${height}px`,
    objectFit: "fill",
    transform: `translate3d(${left}px, ${top}px, 0)`,
  };
}

function introBackgroundCropStyle(
  settings: HomepageIntroSettings,
  viewport: "desktop" | "mobile",
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
): CSSProperties | null {
  const leftPct = Number(settings[`intro_background_${viewport}_crop_left`]);
  const topPct = Number(settings[`intro_background_${viewport}_crop_top`]);
  const widthPct = Number(settings[`intro_background_${viewport}_crop_width`]);
  const heightPct = Number(settings[`intro_background_${viewport}_crop_height`]);
  if (![leftPct, topPct, widthPct, heightPct].every(Number.isFinite) || widthPct <= 0 || heightPct <= 0) return null;
  const cropLeft = imageWidth * clampNumber(leftPct, 0, 100) / 100;
  const cropTop = imageHeight * clampNumber(topPct, 0, 100) / 100;
  const cropWidth = imageWidth * clampNumber(widthPct, 1, 100) / 100;
  const cropHeight = imageHeight * clampNumber(heightPct, 1, 100) / 100;
  const scale = Math.max(boxWidth / cropWidth, boxHeight / cropHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  // Treat the saved crop as the authored frame. At runtime it behaves like
  // background-size: cover: a narrower viewport trims the frame equally from
  // both sides, while the final image edges are always kept outside the box.
  const preferredLeft = (boxWidth - cropWidth * scale) / 2 - cropLeft * scale;
  const preferredTop = (boxHeight - cropHeight * scale) / 2 - cropTop * scale;
  const left = clampNumber(preferredLeft, boxWidth - width, 0);
  const top = clampNumber(preferredTop, boxHeight - height, 0);
  return {
    position: "absolute",
    top: 0,
    left: 0,
    width: `${width}px`,
    height: `${height}px`,
    objectFit: "fill",
    transform: `translate3d(${left}px, ${top}px, 0)`,
  };
}

export default function LandingIntro({
  settings: rawSettings,
  nodes: rawNodes,
  onComplete,
  onExitStart,
  preview = false,
  previewViewport = "desktop",
}: {
  settings: HomepageIntroSettings;
  nodes: HomepageIntroNode[];
  onComplete?: () => void;
  onExitStart?: () => void;
  preview?: boolean;
  previewViewport?: "desktop" | "mobile";
}) {
  const settings = useMemo(() => normalizeHomepageIntroSettings(rawSettings), [rawSettings]);
  const nodes = useMemo(() => enabledNodes(rawNodes), [rawNodes]);
  const routeMaskId = `landing-route-reveal-${useId().replace(/:/g, "")}`;
  const sectionRef = useRef<HTMLElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const maskPathRef = useRef<SVGPathElement>(null);
  const routeLengthRef = useRef(0);
  const completionRef = useRef(false);
  const exitStartedRef = useRef(false);
  const exitCompletedRef = useRef(false);
  const routeProgress = useMotionValue(0);
  const [points, setPoints] = useState<IntroPoint[]>([]);
  const [activeNodeCount, setActiveNodeCount] = useState(0);
  const [loadedBackgroundUrl, setLoadedBackgroundUrl] = useState("");
  const [failedBackgroundUrl, setFailedBackgroundUrl] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [containerBox, setContainerBox] = useState<IntroBgSize | null>(null);
  const [imageBox, setImageBox] = useState<IntroBgSize | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== "undefined" && !window.matchMedia("(min-width: 721px)").matches);
  const viewportView: "desktop" | "mobile" = preview ? previewViewport : (isMobileLayout ? "mobile" : "desktop");
  const activeBackgroundImage = settings[`intro_background_${viewportView}_image`] || settings.intro_background_desktop_image || settings.intro_background_image;
  const [backgroundReady, setBackgroundReady] = useState(!activeBackgroundImage);
  const reducedMotion = useReducedMotion();
  const configuredDuration = Math.max(3000, Math.min(10000, Number(settings.intro_loading_duration) || 6000));
  const duration = reducedMotion ? 700 : preview ? Math.min(configuredDuration, 4200) : configuredDuration;
  const timelineScale = duration / 6000;
  const routeStart = reducedMotion ? 0 : 2.25 * timelineScale;
  const routeDuration = reducedMotion ? 0 : Math.max(0.9, duration / 1000 - routeStart - 0.95);

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!backgroundReady || !path || nodes.length === 0) {
      setPoints([]);
      return;
    }
    const totalLength = path.getTotalLength();
    routeLengthRef.current = totalLength;
    if (maskPathRef.current) {
      maskPathRef.current.style.strokeDasharray = `${totalLength} ${totalLength}`;
      maskPathRef.current.style.strokeDashoffset = `${totalLength}`;
      maskPathRef.current.style.opacity = "0";
    }
    setPoints(Array.from({ length: nodes.length }, (_, index) => {
      const progress = nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
      const point = path.getPointAtLength(totalLength * progress);
      return { x: point.x, y: point.y, progress };
    }));
  }, [backgroundReady, nodes.length]);

  useMotionValueEvent(routeProgress, "change", (latest) => {
    const maskPath = maskPathRef.current;
    const routeLength = routeLengthRef.current;
    if (maskPath && routeLength > 0) {
      const progress = Math.max(0, Math.min(1, latest));
      maskPath.style.strokeDashoffset = `${routeLength * (1 - progress)}`;
      maskPath.style.opacity = progress > 0 ? "1" : "0";
    }
    const nextCount = points.reduce((count, point) => count + (latest > 0 && latest >= point.progress ? 1 : 0), 0);
    setActiveNodeCount((current) => current === nextCount ? current : nextCount);
  });

  useEffect(() => {
    routeProgress.set(0);
    if (!backgroundReady || points.length !== nodes.length) return;
    if (reducedMotion) {
      routeProgress.set(1);
      return;
    }
    const controls = animate(routeProgress, 1, {
      delay: routeStart,
      duration: routeDuration,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [backgroundReady, nodes.length, points.length, reducedMotion, routeDuration, routeProgress, routeStart]);

  useEffect(() => {
    setLoadedBackgroundUrl("");
    setFailedBackgroundUrl("");
    setImageBox(null);
    setBackgroundReady(!activeBackgroundImage);
    if (!activeBackgroundImage) return;
    const fallback = window.setTimeout(() => setBackgroundReady(true), 1400);
    return () => window.clearTimeout(fallback);
  }, [activeBackgroundImage]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const measure = () => {
      const rect = section.getBoundingClientRect();
      setContainerBox({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (preview) return;
    const mediaQuery = window.matchMedia("(min-width: 721px)");
    const update = () => setIsMobileLayout(!mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [preview]);

  const completeExit = useCallback(() => {
    if (exitCompletedRef.current) return;
    exitCompletedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  const startExit = useCallback(() => {
    if (!onComplete || exitStartedRef.current) return;
    exitStartedRef.current = true;
    onExitStart?.();
    setLeaving(true);
    if (reducedMotion) window.requestAnimationFrame(completeExit);
  }, [completeExit, onComplete, onExitStart, reducedMotion]);

  useEffect(() => {
    if (!backgroundReady) return;
    completionRef.current = false;
    exitStartedRef.current = false;
    exitCompletedRef.current = false;
    if (preview || !onComplete) return;
    const completionTimer = window.setTimeout(() => {
      if (completionRef.current) return;
      completionRef.current = true;
      startExit();
    }, duration);
    return () => window.clearTimeout(completionTimer);
  }, [backgroundReady, duration, onComplete, preview, startExit]);

  const finishNow = () => {
    if (!onComplete || completionRef.current) return;
    completionRef.current = true;
    startExit();
  };

  const backgroundImageStyle = useMemo(() => {
    if (!imageBox || !containerBox || !activeBackgroundImage) return {};
    const cropStyle = introBackgroundCropStyle(settings, viewportView, containerBox.width, containerBox.height, imageBox.width, imageBox.height);
    if (cropStyle) return cropStyle;
    const x = Number(settings[`intro_background_${viewportView}_x`]);
    const y = Number(settings[`intro_background_${viewportView}_y`]);
    const zoom = Number(settings[`intro_background_${viewportView}_zoom`]);
    return introBackgroundStyle(x, y, zoom, containerBox.width, containerBox.height, imageBox.width, imageBox.height);
  }, [activeBackgroundImage, imageBox, containerBox, viewportView, settings]);

  useEffect(() => {
    if (preview) return;
    const section = sectionRef.current;
    if (!section) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = section.closest(".ix-site");
    const blockedSiblings = shell
      ? Array.from(shell.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== section)
      : [];
    const previousInertState = blockedSiblings.map((element) => element.hasAttribute("inert"));
    blockedSiblings.forEach((element) => element.setAttribute("inert", ""));
    const focusTarget = section.querySelector<HTMLButtonElement>(".landing-intro-enter") || section;
    const focusFrame = window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      focusTarget.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", keepFocusInside);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", keepFocusInside);
      blockedSiblings.forEach((element, index) => {
        if (!previousInertState[index]) element.removeAttribute("inert");
      });
      previousFocus?.focus({ preventScroll: true });
    };
  }, [preview, settings.intro_show_enter_button]);

  const introStyle = {
    "--intro-duration": `${duration}ms`,
    "--intro-scale": timelineScale,
    "--intro-bg-desktop-x": `${settings.intro_background_desktop_x}%`,
    "--intro-bg-desktop-y": `${settings.intro_background_desktop_y}%`,
    "--intro-bg-desktop-zoom": Number(settings.intro_background_desktop_zoom) / 100,
    "--intro-bg-mobile-x": `${settings.intro_background_mobile_x}%`,
    "--intro-bg-mobile-y": `${settings.intro_background_mobile_y}%`,
    "--intro-bg-mobile-zoom": Number(settings.intro_background_mobile_zoom) / 100,
    "--intro-bg-blur": `${clampNumber(Number(settings.intro_background_blur) || 0, 0, 20)}px`,
    "--intro-bg-brightness": `${clampNumber(Number(settings.intro_background_brightness) || 104, 70, 125)}%`,
    "--intro-overlay-opacity": clampNumber(Number(settings.intro_background_overlay) || 0, 0, 100) / 100,
  } as IntroStyle;

  return (
    <section
      ref={sectionRef}
      className={`landing-intro${preview ? ` is-preview is-preview-${previewViewport}` : ""}${backgroundReady ? " is-ready" : ""}${loadedBackgroundUrl === activeBackgroundImage && activeBackgroundImage ? " has-background" : ""}${leaving ? " is-leaving" : ""}`}
      style={introStyle}
      role={preview ? undefined : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-label="记忆档案网站开场"
      tabIndex={preview ? undefined : -1}
      onTransitionEnd={(event) => {
        if (!preview && leaving && event.target === event.currentTarget && event.propertyName === "opacity") completeExit();
      }}
    >
      <div className="landing-intro-fallback" aria-hidden="true" />
      {activeBackgroundImage && failedBackgroundUrl !== activeBackgroundImage && (
        <img
          key={activeBackgroundImage}
          className="landing-intro-background"
          src={activeBackgroundImage}
          alt=""
          style={backgroundImageStyle}
          fetchPriority="high"
          decoding="async"
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth) setImageBox({ width: image.naturalWidth, height: image.naturalHeight });
            const reveal = () => {
              setLoadedBackgroundUrl(activeBackgroundImage);
              setBackgroundReady(true);
            };
            if (typeof image.decode === "function") image.decode().then(reveal).catch(reveal);
            else reveal();
          }}
          onError={() => {
            setFailedBackgroundUrl(activeBackgroundImage);
            setBackgroundReady(true);
          }}
        />
      )}
      <div className="landing-intro-frost" aria-hidden="true" />
      <div className="landing-intro-overlay" aria-hidden="true" />
      <div className="landing-intro-sunwash" aria-hidden="true" />

      {backgroundReady && <motion.div
        className="landing-watermark landing-watermark-one"
        initial={{ opacity: 0 }}
        animate={{ opacity: clampNumber(Number(settings.intro_watermark_opacity) || 0, 0, 30) / 100 }}
        transition={{ delay: reducedMotion ? 0 : 0.2 * timelineScale, duration: reducedMotion ? 0 : 1.2 }}
        aria-hidden="true"
      >
        {settings.intro_watermark_1}
      </motion.div>}
      {backgroundReady && <motion.div
        className="landing-watermark landing-watermark-two"
        initial={{ opacity: 0 }}
        animate={{ opacity: clampNumber(Number(settings.intro_watermark_opacity) || 0, 0, 30) / 125 }}
        transition={{ delay: reducedMotion ? 0 : 0.35 * timelineScale, duration: reducedMotion ? 0 : 1.25 }}
        aria-hidden="true"
      >
        {settings.intro_watermark_2}
      </motion.div>}

      {Number(settings.intro_show_enter_button) === 1 && !preview && (
        <button className="landing-intro-enter" type="button" onClick={finishNow}>进入首页</button>
      )}

      {backgroundReady && <div className="landing-intro-stage">
        <div className="landing-intro-brand">
          <div className="landing-logo-stage" aria-label={settings.intro_title || "网站 Logo"}>
            {[0, 1, 2, 3, 4, 5].map((ring) => (
              <motion.span
                key={ring}
                className={`landing-logo-ring ring-${ring + 1}`}
                initial={{ opacity: 0, scale: 0.76 }}
                animate={{ opacity: ring < 2 ? 0.56 : 0.32, scale: 1 }}
                transition={{ delay: reducedMotion ? 0 : (0.48 + ring * 0.11) * timelineScale, duration: reducedMotion ? 0 : 0.72, ease: easeOut }}
                aria-hidden="true"
              />
            ))}
            <motion.div
              className="landing-logo-core"
              initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ delay: reducedMotion ? 0 : 1.38 * timelineScale, duration: reducedMotion ? 0 : 0.68, ease: easeOut }}
            >
              {settings.intro_logo ? <img src={settings.intro_logo} alt={`${settings.intro_title} Logo`} /> : <span>MA</span>}
            </motion.div>
          </div>

          <div className="landing-intro-titles">
            <motion.h1
              initial={{ clipPath: "inset(0 100% 0 0)", x: -15 }}
              animate={{ clipPath: "inset(0 0% 0 0)", x: 0 }}
              transition={{ delay: reducedMotion ? 0 : 1.78 * timelineScale, duration: reducedMotion ? 0 : 0.82, ease: easeOut }}
            >
              {settings.intro_title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 0.68, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 2.14 * timelineScale, duration: reducedMotion ? 0 : 0.58, ease: easeOut }}
            >
              {settings.intro_subtitle}
            </motion.p>
          </div>
        </div>

        <div className="landing-route-wrap">
          <svg className={`landing-route${nodes.length > 5 ? " has-many-nodes" : ""}`} viewBox="0 0 1000 260" role="progressbar" aria-label="开场加载进度" aria-valuemin={0} aria-valuemax={100}>
            <defs>
              <mask id={routeMaskId} maskUnits="userSpaceOnUse" x="-20" y="-20" width="1040" height="300">
                <path ref={maskPathRef} className="landing-route-mask-line" d={ROUTE_PATH} />
              </mask>
            </defs>
            <path
              ref={pathRef}
              className="landing-route-line"
              d={ROUTE_PATH}
              pathLength="100"
              strokeDasharray="2 1"
              mask={`url(#${routeMaskId})`}
            />
            {points.map((point, index) => {
              const node = nodes[index];
              if (!node) return null;
              return (
                <g key={`${node.id ?? index}-${node.title}`} transform={`translate(${point.x} ${point.y})`}>
                  <g className={`landing-route-node${index < activeNodeCount ? " is-active" : ""}`}>
                    <circle className="landing-node-pulse" r="19" />
                    <circle className="landing-node-halo" r="19" />
                    <circle className="landing-node-dot" r="6" />
                    <text className="landing-node-title" x="0" y="38" textAnchor="middle">{node.title}</text>
                    <text className="landing-node-subtitle" x="0" y="55" textAnchor="middle">{node.subtitle}</text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>}
    </section>
  );
}
