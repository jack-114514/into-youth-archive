export type GalaxyScenePreset = "snow-orbit" | "cosmos" | "snowfall";

export type GalaxySettings = {
  galaxy_scene_preset: GalaxyScenePreset;
  galaxy_particle_density: string;
  galaxy_snow_density: string;
  galaxy_particle_brightness: string;
  galaxy_growth_duration: string;
  galaxy_photo_scale: string;
  galaxy_photo_spread: string;
  galaxy_photo_border_color: string;
};

export const defaultGalaxySettings: GalaxySettings = {
  galaxy_scene_preset: "snow-orbit",
  galaxy_particle_density: "70",
  galaxy_snow_density: "75",
  galaxy_particle_brightness: "100",
  galaxy_growth_duration: "4",
  galaxy_photo_scale: "70",
  galaxy_photo_spread: "115",
  galaxy_photo_border_color: "#242b30",
};

export const galaxyScenePresets: Array<{
  value: GalaxyScenePreset;
  label: string;
  description: string;
  settings: Omit<GalaxySettings, "galaxy_scene_preset">;
}> = [
  {
    value: "snow-orbit",
    label: "雪花环绕",
    description: "保留当前雪花围绕粒子树缓慢旋转的氛围。",
    settings: { galaxy_particle_density: "70", galaxy_snow_density: "75", galaxy_particle_brightness: "100", galaxy_growth_duration: "4", galaxy_photo_scale: "70", galaxy_photo_spread: "115", galaxy_photo_border_color: "#242b30" },
  },
  {
    value: "cosmos",
    label: "宇宙星野",
    description: "深蓝宇宙背景，以细小星点点缀粒子树。",
    settings: { galaxy_particle_density: "65", galaxy_snow_density: "55", galaxy_particle_brightness: "92", galaxy_growth_duration: "3.5", galaxy_photo_scale: "68", galaxy_photo_spread: "125", galaxy_photo_border_color: "#283142" },
  },
  {
    value: "snowfall",
    label: "初雪",
    description: "雪花从画面上方轻缓飘落，保持安静、稀疏。",
    settings: { galaxy_particle_density: "65", galaxy_snow_density: "85", galaxy_particle_brightness: "96", galaxy_growth_duration: "4.5", galaxy_photo_scale: "70", galaxy_photo_spread: "115", galaxy_photo_border_color: "#252b2d" },
  },
];

export function normalizeGalaxyPercent(value: unknown, fallback: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.max(0, Math.min(140, Math.round(parsed)))) : fallback;
}

export function normalizeGalaxyNumber(value: unknown, fallback: string, min: number, max: number, step = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(min, Math.min(max, parsed));
  const stepped = Math.round(clamped / step) * step;
  return String(Number(stepped.toFixed(2)));
}

export function normalizeGalaxyColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function normalizeGalaxySettings(value: Partial<Record<keyof GalaxySettings, unknown>>): GalaxySettings {
  const preset = galaxyScenePresets.some((item) => item.value === value.galaxy_scene_preset)
    ? value.galaxy_scene_preset as GalaxyScenePreset
    : defaultGalaxySettings.galaxy_scene_preset;
  return {
    galaxy_scene_preset: preset,
    galaxy_particle_density: normalizeGalaxyPercent(value.galaxy_particle_density, defaultGalaxySettings.galaxy_particle_density),
    galaxy_snow_density: normalizeGalaxyPercent(value.galaxy_snow_density, defaultGalaxySettings.galaxy_snow_density),
    galaxy_particle_brightness: normalizeGalaxyPercent(value.galaxy_particle_brightness, defaultGalaxySettings.galaxy_particle_brightness),
    galaxy_growth_duration: normalizeGalaxyNumber(value.galaxy_growth_duration, defaultGalaxySettings.galaxy_growth_duration, 1.5, 12, 0.25),
    galaxy_photo_scale: normalizeGalaxyNumber(value.galaxy_photo_scale, defaultGalaxySettings.galaxy_photo_scale, 35, 130, 5),
    galaxy_photo_spread: normalizeGalaxyNumber(value.galaxy_photo_spread, defaultGalaxySettings.galaxy_photo_spread, 70, 180, 5),
    galaxy_photo_border_color: normalizeGalaxyColor(value.galaxy_photo_border_color, defaultGalaxySettings.galaxy_photo_border_color),
  };
}
