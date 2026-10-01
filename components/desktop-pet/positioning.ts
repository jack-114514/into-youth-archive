export type PetDockSide = "left" | "right" | "top" | "bottom";

export type PetDock = { side: PetDockSide; offset: number };

type Bounds = { left: number; right: number; top: number; bottom: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function nearestPetDock(rect: Bounds, width: number, height: number): PetDock {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const distances: Array<[PetDockSide, number]> = [
    ["left", centerX], ["right", width - centerX],
    ["top", centerY], ["bottom", height - centerY],
  ];
  const side = distances.reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0];
  return {
    side,
    offset: Math.round(side === "left" || side === "right"
      ? clamp(centerY, 44, Math.max(44, height - 44))
      : clamp(centerX, 44, Math.max(44, width - 44))),
  };
}
