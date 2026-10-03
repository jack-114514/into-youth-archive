type Bounds = { left: number; top: number; width: number; height: number };

// Distance controls the amount of movement; avoid snapping to a unit direction
// as Live2DModel.focus() does, which also discards the configured strength.
export function pointerFocus(x: number, y: number, bounds: Bounds, viewport: { width: number; height: number }, strength: number) {
  const dx = (x - bounds.left - bounds.width / 2) / Math.max(bounds.width * 2, viewport.width * .4, 1);
  const dy = (bounds.top + bounds.height * .2 - y) / Math.max(bounds.height * 2, viewport.height * .4, 1);
  const gain = Math.max(0, Math.min(1, strength)) / Math.sqrt(1 + dx * dx + dy * dy);
  return { x: dx * gain, y: dy * gain };
}
