// Desktop-only policy; the existing mobile renderer and texture path stay intact.
export function isDesktopGalaxyClient() {
  return typeof navigator !== "undefined"
    && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function fitGalaxyTexture(width: number, height: number, maxEdge = 1024) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type LoadedTexture<T> = { texture: T; bytes: number };
type TextureLoader<T> = (url: string, signal: AbortSignal) => Promise<LoadedTexture<T>>;

// One decode at a time, and at most one upload per R3F frame. Cached CPU images
// survive a short return visit; GPU readiness belongs to the current renderer.
export function createDesktopTextureQueue<T>(load: TextureLoader<T>, dispose: (texture: T) => void, budget = 48 * 1024 * 1024) {
  const cache = new Map<string, LoadedTexture<T>>();
  const queued = new Set<string>();
  const listeners = new Map<string, Set<(texture: T) => void>>();
  const uploaded = new Set<string>();
  const failures = new Map<string, number>();
  let renderer: object | null = null;
  let active: { url: string; controller: AbortController } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let bytes = 0;

  function trim(clear = false) {
    for (const [url, entry] of cache) {
      if (!clear && bytes <= budget) break;
      if (listeners.has(url)) continue;
      cache.delete(url);
      uploaded.delete(url);
      bytes -= entry.bytes;
      dispose(entry.texture);
    }
  }

  function schedule() {
    if (!paused && !active && timer === undefined && queued.size) {
      timer = setTimeout(() => { timer = undefined; drain(); }, 80);
    }
  }

  function drain() {
    if (paused || active) return;
    const url = queued.values().next().value;
    if (!url) return;
    queued.delete(url);
    const job = { url, controller: new AbortController() };
    active = job;
    void load(url, job.controller.signal).then((entry) => {
      if (active !== job || job.controller.signal.aborted) {
        dispose(entry.texture);
        return;
      }
      cache.set(url, entry);
      bytes += entry.bytes;
      failures.delete(url);
      trim();
    }).catch(() => {
      if (active !== job || job.controller.signal.aborted) return;
      const attempts = (failures.get(url) || 0) + 1;
      failures.set(url, attempts);
      if (attempts < 2) queued.add(url);
    }).finally(() => {
      if (active !== job) return;
      active = null;
      schedule();
    });
  }

  function preload(urls: string[]) {
    paused = false;
    clearTimeout(releaseTimer);
    releaseTimer = undefined;
    for (const url of urls) {
      if (!cache.has(url) && active?.url !== url && !queued.has(url)) {
        failures.delete(url);
        queued.add(url);
      }
    }
    schedule();
  }

  return {
    preload,
    subscribe(url: string, listener: (texture: T) => void) {
      const subscribers = listeners.get(url) || new Set<(texture: T) => void>();
      subscribers.add(listener);
      listeners.set(url, subscribers);
      const cached = cache.get(url);
      if (cached) {
        // Move recently used entries to the end for eviction order.
        cache.delete(url);
        cache.set(url, cached);
        if (uploaded.has(url)) listener(cached.texture);
      }
      preload([url]);
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) listeners.delete(url);
        trim();
      };
    },
    uploadNext(context: object, upload: (texture: T) => void) {
      if (paused) return;
      if (renderer !== context) {
        renderer = context;
        uploaded.clear();
      }
      for (const [url, subscribers] of listeners) {
        const entry = cache.get(url);
        if (!entry || uploaded.has(url)) continue;
        upload(entry.texture);
        uploaded.add(url);
        subscribers.forEach((listener) => listener(entry.texture));
        break;
      }
    },
    pause() {
      paused = true;
      clearTimeout(timer);
      timer = undefined;
      queued.clear();
      failures.clear();
      const job = active;
      active = null;
      job?.controller.abort();
      renderer = null;
      uploaded.clear();
      trim();
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => { releaseTimer = undefined; trim(true); }, 30_000);
    },
  };
}
