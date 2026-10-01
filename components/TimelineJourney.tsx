"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";

type TimelineItem = { date: string; title: string; text: string };
type Point = { x: number; y: number };
type TrackGeometry = { width: number; height: number; path: string; nodeProgress: number[] };

function bezierPoint(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y,
  };
}

function curvedPath(points: Point[]): { path: string; nodeProgress: number[] } {
  if (!points.length) return { path: "", nodeProgress: [] };
  let path = `M ${points[0].x} ${points[0].y}`;
  let length = 0;
  const nodeLengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const rise = end.y - start.y;
    // Matching vertical tangents on both sides of a node make the route flow through it.
    const controlA = { x: start.x, y: start.y + rise * .44 };
    const controlB = { x: end.x, y: end.y - rise * .44 };
    path += ` C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`;
    let previous = start;
    for (let sample = 1; sample <= 32; sample += 1) {
      const next = bezierPoint(start, controlA, controlB, end, sample / 32);
      length += Math.hypot(next.x - previous.x, next.y - previous.y);
      previous = next;
    }
    nodeLengths.push(length);
  }
  return { path, nodeProgress: nodeLengths.map((distance) => length ? distance / length : 0) };
}

function progressAtHeight(height: number, points: Point[], nodeProgress: number[]): number {
  if (!points.length || height < points[0].y) return 0;
  if (points.length === 1 || height >= points[points.length - 1].y) return 1;
  const next = points.findIndex((point) => point.y > height);
  const start = points[next - 1];
  const end = points[next];
  const portion = (height - start.y) / Math.max(end.y - start.y, 1);
  return nodeProgress[next - 1] + (nodeProgress[next] - nodeProgress[next - 1]) * portion;
}

export default function TimelineJourney({ items, active }: { items: TimelineItem[]; active: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const maskPathRef = useRef<SVGPathElement>(null);
  const pathLengthRef = useRef(0);
  const maskId = `ix-time-route-${useId().replace(/:/g, "")}`;
  const reducedMotion = useReducedMotion();
  const routeProgress = useMotionValue(0);
  const [geometry, setGeometry] = useState<TrackGeometry>({ width: 1, height: 1, path: "", nodeProgress: [] });
  const [targetProgress, setTargetProgress] = useState(0);
  const [reachedCount, setReachedCount] = useState(0);

  useLayoutEffect(() => {
    const path = maskPathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    pathLengthRef.current = length;
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = `${length * (1 - routeProgress.get())}`;
  }, [geometry.path, routeProgress]);

  useMotionValueEvent(routeProgress, "change", (value) => {
    const path = maskPathRef.current;
    if (path && pathLengthRef.current > 0) path.style.strokeDashoffset = `${pathLengthRef.current * (1 - value)}`;
    const count = value > 0 ? geometry.nodeProgress.filter((threshold) => value >= threshold - .002).length : 0;
    setReachedCount((current) => current === count ? current : count);
  });

  useEffect(() => {
    if (!active) {
      routeProgress.set(0);
      setTargetProgress(0);
      setReachedCount(0);
    }
  }, [active, routeProgress]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !active) return;
    const scroller = list.closest<HTMLElement>(".ix-scroll-pane");
    const nodes = Array.from(list.querySelectorAll<HTMLElement>(".ix-time-node"));
    let frame = 0;
    let measuredPoints: Point[] = [];
    let measuredProgress: number[] = [];

    const updateTarget = () => {
      if (!measuredPoints.length) return;
      const bounds = list.getBoundingClientRect();
      const viewportBottom = scroller?.getBoundingClientRect().bottom ?? window.innerHeight;
      const visibleHeight = viewportBottom - bounds.top - 70;
      const next = reducedMotion ? 1 : progressAtHeight(visibleHeight, measuredPoints, measuredProgress);
      setTargetProgress((current) => Math.max(current, next));
    };
    const measure = () => {
      const bounds = list.getBoundingClientRect();
      measuredPoints = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
      });
      const track = curvedPath(measuredPoints);
      measuredProgress = track.nodeProgress;
      setGeometry({ width: Math.max(bounds.width, 1), height: Math.max(bounds.height, 1), ...track });
      updateTarget();
    };
    const requestMeasure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resizeObserver = new ResizeObserver(requestMeasure);
    resizeObserver.observe(list);
    nodes.forEach((node) => resizeObserver.observe(node));
    scroller?.addEventListener("scroll", updateTarget, { passive: true });
    window.addEventListener("resize", requestMeasure);
    requestMeasure();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scroller?.removeEventListener("scroll", updateTarget);
      window.removeEventListener("resize", requestMeasure);
    };
  }, [active, items, reducedMotion]);

  useEffect(() => {
    if (!active || !geometry.path) return;
    if (reducedMotion) {
      routeProgress.set(1);
      return;
    }
    const remaining = targetProgress - routeProgress.get();
    if (remaining <= 0) return;
    const controls = animate(routeProgress, targetProgress, {
      duration: Math.max(.35, Math.min(2.8, remaining * 2.7)),
      ease: [.22, 1, .36, 1],
    });
    return () => controls.stop();
  }, [active, geometry.path, reducedMotion, routeProgress, targetProgress]);

  return <div ref={listRef} className="ix-time-journey">
    {geometry.path && <svg className="ix-time-track" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={geometry.width} height={geometry.height}><path ref={maskPathRef} className="ix-time-track-mask" d={geometry.path} /></mask></defs>
      <path className="ix-time-track-drawn" d={geometry.path} mask={`url(#${maskId})`} />
    </svg>}
    {items.map((item, index) => <article key={`${item.date}-${index}`} className={`ix-time-moment${index < reachedCount ? " is-revealed" : ""}`}>
      <span className="ix-time-node" aria-hidden="true"><i /></span>
      <div className="ix-time-content"><div className="ix-time-meta"><span>{String(index + 1).padStart(2, "0")}</span><time>{item.date}</time></div><h3>{item.title}</h3><p>{item.text}</p></div>
    </article>)}
  </div>;
}
