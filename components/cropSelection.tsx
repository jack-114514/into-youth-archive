"use client";

import { forwardRef, useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import { CircleStencil, RectangleStencil, getStencilCoordinates } from "react-advanced-cropper";
import type { CropperRef } from "react-advanced-cropper";

type RectangleProps = ComponentPropsWithoutRef<typeof RectangleStencil>;
type CircleProps = ComponentPropsWithoutRef<typeof CircleStencil>;
type StencilCropper = RectangleProps["cropper"];

const isCorner = (anchor: string) => /^(east|west)(North|South)$/.test(anchor);

function useSelectionCropper(cropper: StencilCropper, lockCorners: boolean, lockRatio = false): StencilCropper {
  const pendingPan = useRef({ left: 0, top: 0 });
  const heldPan = useRef({ left: 0, top: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const panNextFrame = () => {
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const step = {
        left: pendingPan.current.left ? Math.max(-18, Math.min(18, pendingPan.current.left)) : heldPan.current.left,
        top: pendingPan.current.top ? Math.max(-18, Math.min(18, pendingPan.current.top)) : heldPan.current.top,
      };
      if (pendingPan.current.left) pendingPan.current.left -= step.left;
      if (pendingPan.current.top) pendingPan.current.top -= step.top;
      if (step.left || step.top) {
        const instance = cropper as unknown as CropperRef;
        const before = instance.getVisibleArea();
        // Positive image movement advances the source area in the drag direction.
        instance.moveImage(step.left, step.top, { transitions: false });
        const after = instance.getVisibleArea();
        if (before && after && Math.abs(before.left - after.left) < 0.001) {
          pendingPan.current.left = 0;
          heldPan.current.left = 0;
        }
        if (before && after && Math.abs(before.top - after.top) < 0.001) {
          pendingPan.current.top = 0;
          heldPan.current.top = 0;
        }
      }
      if (Math.abs(pendingPan.current.left) < 0.1) pendingPan.current.left = 0;
      if (Math.abs(pendingPan.current.top) < 0.1) pendingPan.current.top = 0;
      if ((pendingPan.current.left || pendingPan.current.top || heldPan.current.left || heldPan.current.top) && frame.current === null) panNextFrame();
    });
  };

  return new Proxy(cropper, {
    get(target, property) {
      if (property === "moveCoordinates") {
        return (directions: Parameters<StencilCropper["moveCoordinates"]>[0]) => {
          const before = target.getState();
          target.moveCoordinates(directions);
          const after = target.getState();
          if (!before?.coordinates || !before.visibleArea || !before.boundary || !after?.coordinates) return;
          const coefficient = before.visibleArea.width / before.boundary.width;
          if (!Number.isFinite(coefficient) || coefficient <= 0) return;
          const remainingLeft = (directions.left ?? 0) - (after.coordinates.left - before.coordinates.left) / coefficient;
          const remainingTop = (directions.top ?? 0) - (after.coordinates.top - before.coordinates.top) / coefficient;
          if (Math.abs(remainingLeft) > 0.1) {
            pendingPan.current.left += remainingLeft;
            heldPan.current.left = Math.sign(remainingLeft) * 6;
          } else if (directions.left) {
            pendingPan.current.left = 0;
            heldPan.current.left = 0;
          }
          if (Math.abs(remainingTop) > 0.1) {
            pendingPan.current.top += remainingTop;
            heldPan.current.top = Math.sign(remainingTop) * 6;
          } else if (directions.top) {
            pendingPan.current.top = 0;
            heldPan.current.top = 0;
          }
          if (frame.current === null && (pendingPan.current.left || pendingPan.current.top || heldPan.current.left || heldPan.current.top)) panNextFrame();
        };
      }
      if (property === "moveCoordinatesEnd") {
        return () => {
          pendingPan.current = { left: 0, top: 0 };
          heldPan.current = { left: 0, top: 0 };
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          frame.current = null;
          target.moveCoordinatesEnd();
        };
      }
      if (property === "resizeCoordinates" && (lockCorners || lockRatio)) {
        return (...args: Parameters<StencilCropper["resizeCoordinates"]>) => {
          const [anchor, directions, options] = args;
          const resizeOptions = options && typeof options === "object" ? options as Record<string, unknown> : {};
          target.resizeCoordinates(anchor, directions, { ...resizeOptions, preserveAspectRatio: lockRatio || isCorner(anchor) });
        };
      }
      return Reflect.get(target, property);
    },
  });
}

export const SelectionRectangleStencil = forwardRef<ComponentRef<typeof RectangleStencil>, RectangleProps>(function SelectionRectangleStencil(props, ref) {
  const cropper = useSelectionCropper(props.cropper, true);
  return <RectangleStencil {...props} cropper={cropper} ref={ref} aspectRatio={undefined} movable resizable handlers={{ eastNorth: true, westNorth: false, westSouth: true, eastSouth: true, north: false, east: false, south: false, west: false }} lines={{ north: true, east: true, south: true, west: true }} />;
});

export const SelectionSquareStencil = forwardRef<ComponentRef<typeof RectangleStencil>, RectangleProps>(function SelectionSquareStencil(props, ref) {
  const cropper = useSelectionCropper(props.cropper, true, true);
  return <RectangleStencil {...props} cropper={cropper} ref={ref} aspectRatio={1} movable resizable handlers={{ eastNorth: true, westNorth: false, westSouth: true, eastSouth: true, north: false, east: false, south: false, west: false }} lines={{ north: true, east: true, south: true, west: true }} />;
});

type CircleResizeGesture = {
  pointerId: number;
  centerX: number;
  centerY: number;
  radius: number;
  coordinates: { left: number; top: number; width: number; height: number };
};

export const SelectionCircleStencil = forwardRef<ComponentRef<typeof CircleStencil>, CircleProps>(function SelectionCircleStencil(props, ref) {
  const cropper = useSelectionCropper(props.cropper, false);
  const gesture = useRef<CircleResizeGesture | null>(null);
  const state = props.cropper.getState();
  const ring = getStencilCoordinates(state);
  const instance = props.cropper as unknown as CropperRef;

  return <>
    <CircleStencil {...props} cropper={cropper} ref={ref} movable resizable={false} handlers={{}} lines={{}} />
    {state?.coordinates && <svg className="selection-circle-resize-ring" style={{ left: ring.left, top: ring.top, width: ring.width, height: ring.height }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="拖动圆周等比调整取景范围">
      <circle cx="50" cy="50" r="48.5" fill="none" stroke="transparent" strokeWidth="3" pointerEvents="stroke" onPointerDown={(event) => {
        const coordinates = instance.getCoordinates();
        if (!coordinates) return;
        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
        if (!rect) return;
        event.preventDefault();
        event.stopPropagation();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        gesture.current = { pointerId: event.pointerId, centerX, centerY, radius: Math.hypot(event.clientX - centerX, event.clientY - centerY), coordinates };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.pointerId !== event.pointerId || start.radius <= 0) return;
        const radius = Math.hypot(event.clientX - start.centerX, event.clientY - start.centerY);
        const size = start.coordinates.width * radius / start.radius;
        instance.setCoordinates({ left: start.coordinates.left + (start.coordinates.width - size) / 2, top: start.coordinates.top + (start.coordinates.height - size) / 2, width: size, height: size }, { transitions: false });
      }} onPointerUp={(event) => {
        if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={(event) => {
        if (gesture.current?.pointerId === event.pointerId) gesture.current = null;
      }} />
    </svg>}
  </>;
});

export function setInitialCropAspect(instance: CropperRef, aspect: number) {
  const coordinates = instance.getCoordinates();
  if (!coordinates || !Number.isFinite(aspect) || aspect <= 0) return;
  const width = Math.min(coordinates.width, coordinates.height * aspect) * 0.9;
  const height = width / aspect;
  instance.setCoordinates({
    left: coordinates.left + (coordinates.width - width) / 2,
    top: coordinates.top + (coordinates.height - height) / 2,
    width,
    height,
  });
}
