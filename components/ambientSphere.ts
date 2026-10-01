export const AMBIENT_RADIUS = 42;
export const AMBIENT_CENTER_Y = 1;

// Cubic-root radius samples volume, rather than the surface of a sphere.
// Irrational angular steps spread each radial band across all directions.
export function ambientSpherePoint(index: number, count: number, phase = 0): [number, number, number] {
  const radius = AMBIENT_RADIUS * Math.cbrt((index + 0.5) / Math.max(1, count));
  const elevation = 1 - 2 * ((index * 0.5698402909980532 + phase) % 1);
  const azimuth = Math.PI * 2 * ((index * 0.7548776662466927 + phase * 0.61803398875) % 1);
  const horizontal = radius * Math.sqrt(Math.max(0, 1 - elevation * elevation));
  return [horizontal * Math.cos(azimuth), AMBIENT_CENTER_Y + radius * elevation, horizontal * Math.sin(azimuth)];
}

export function wrapFallingSphereY(x: number, y: number, z: number, travel: number): number {
  const verticalRadius = Math.sqrt(Math.max(0, AMBIENT_RADIUS ** 2 - x * x - z * z));
  if (verticalRadius === 0) return AMBIENT_CENTER_Y;
  const bottom = AMBIENT_CENTER_Y - verticalRadius;
  const span = verticalRadius * 2;
  return bottom + ((((y - travel - bottom) % span) + span) % span);
}
