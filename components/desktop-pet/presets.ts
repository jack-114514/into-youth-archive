import type { PetSettings } from "./settings";

export type PetPreset = { id: string; name: string; settings: PetSettings; createdAt: number };

export function presetName(settings: PetSettings) {
  return settings.name || "墨灵";
}

export function restorePreset(preset: PetPreset): PetSettings {
  // Keep the stored snapshot independent of subsequent editing in the form.
  return structuredClone(preset.settings);
}
