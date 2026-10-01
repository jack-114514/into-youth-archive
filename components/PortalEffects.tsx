import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

type PortalEffectsSettings = {
  portal_effects_enabled?: string;
  portal_effect_spotlight?: string;
  portal_effect_particles?: string;
  portal_effect_textglow?: string;
  portal_effect_magnetic?: string;
  portal_effect_ambient?: string;
};

function enabled(value: string | undefined): boolean {
  return value === undefined || value === "1";
}

export default function PortalEffects({ settings }: { settings: PortalEffectsSettings }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const master = enabled(settings.portal_effects_enabled);
  const showSpotlight = master && enabled(settings.portal_effect_spotlight);
  const showParticles = master && enabled(settings.portal_effect_particles);
  const showTextGlow = master && enabled(settings.portal_effect_textglow);
  const showMagnetic = master && enabled(settings.portal_effect_magnetic);
  const showAmbient = master && enabled(settings.portal_effect_ambient);

  // 鼠标位置 -> 暴露为 CSS 变量，供 Spotlight / Ambient / TextGlow 使用
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--fx-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--fx-y", `${event.clientY - rect.top}px`);
    node.style.setProperty("--fx-px", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    node.style.setProperty("--fx-py", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  // 粒子：跟随鼠标流动的光点
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showParticles) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const count = 42;
    const points: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    const pointer = { x: -999, y: -999, active: false };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", resize);

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      if (pointer.active) {
        for (let i = 0; i < 2 && points.length < count; i += 1) {
          points.push({ x: pointer.x, y: pointer.y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 1 });
        }
      }
      for (let i = points.length - 1; i >= 0; i -= 1) {
        const p = points[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.018;
        if (p.life <= 0) { points.splice(i, 1); continue; }
        const alpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + (1 - p.life) * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(224, 252, 170, ${alpha})`;
        ctx.shadowColor = "rgba(205, 255, 130, 0.9)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, [showParticles]);

  return (
    <div
      ref={rootRef}
      className={`ix-portal-effects${showSpotlight ? " has-spotlight" : ""}${showTextGlow ? " has-textglow" : ""}${showAmbient ? " has-ambient" : ""}${showMagnetic ? " has-magnetic" : ""}`}
      aria-hidden="true"
      onPointerMove={handlePointerMove}
    >
      {showAmbient && <span className="fx-ambient" style={{ left: "var(--fx-x)", top: "var(--fx-y)" }} />}
      {showSpotlight && <span className="fx-spotlight" style={{ left: "var(--fx-x)", top: "var(--fx-y)" }} />}
      {showParticles && <canvas ref={canvasRef} className="fx-particles" />}
    </div>
  );
}
