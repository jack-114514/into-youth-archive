import type { PetSettings } from "./settings";

export type PetPreset = { id: string; name: string; settings: PetSettings; createdAt: number };

export function presetName(settings: PetSettings) {
  const names: Record<string, string> = {
    hanabi: "花火测试版", miku: "初音未来", haru: "Haru", "haru-soft": "Haru 柔和版",
  };
  return names[settings.character] || settings.name || "自定义角色";
}

export function restorePreset(preset: PetPreset): PetSettings {
  // Keep the stored snapshot independent of subsequent editing in the form.
  return structuredClone(preset.settings);
}
