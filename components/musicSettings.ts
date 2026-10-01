export type MusicTrack = {
  id: string;
  name: string;
  url: string;
};

export const defaultMusicSettings = {
  music_default_on: "0",
  music_default_volume: "35",
  music_playlist: "[]",
};

export function normalizeMusicVolume(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 35;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function normalizeMusicPlaylist(value: unknown): MusicTrack[] {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 20).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<MusicTrack>;
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!url || (!url.startsWith("data:audio/mpeg;base64,") && !/^\/uploads\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.mp3$/i.test(url))) return [];
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 80) : "";
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `track-${index + 1}`;
    return [{ id, name: name || `歌曲 ${index + 1}`, url }];
  });
}
