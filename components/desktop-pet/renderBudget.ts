// Supersample even small pets so thin hair, ribbons and silhouettes stay crisp.
// Keep high-DPI detail while bounding the largest offscreen render target.
export function petRenderResolution(height: number, pixelRatio: number) {
  return Math.max(2, Math.min(3, height / 420 * Math.max(2, pixelRatio) * 2));
}
