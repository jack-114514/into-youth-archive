/** One volume envelope for every playback entry point, including autoplay. */
export function createMusicPlayback(audio: HTMLAudioElement, onPlayingChange: (playing: boolean) => void) {
  let frame: number | null = null;
  let generation = 0;
  let wanted = false;
  let targetVolume = 0.35;

  const cancelFade = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const fadeTo = (volume: number, duration: number, complete?: () => void) => {
    cancelFade();
    const start = audio.volume;
    const startedAt = performance.now();
    const currentGeneration = generation;
    const tick = (now: number) => {
      if (currentGeneration !== generation) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = start + (volume - start) * eased;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        frame = null;
        complete?.();
      }
    };
    frame = requestAnimationFrame(tick);
  };

  audio.volume = 0;
  return {
    get wantsPlayback() { return wanted; },
    async play(restart = false) {
      const request = ++generation;
      wanted = true;
      cancelFade();
      if (audio.paused || restart) audio.volume = 0;
      if (restart) audio.currentTime = 0;
      try {
        await audio.play();
        if (request !== generation) return false;
        onPlayingChange(true);
        fadeTo(targetVolume, 1000);
        return true;
      } catch (error) {
        if (request !== generation) return false;
        wanted = false;
        audio.volume = 0;
        onPlayingChange(false);
        throw error;
      }
    },
    pause() {
      generation++;
      wanted = false;
      onPlayingChange(false);
      fadeTo(0, 650, () => audio.pause());
    },
    setVolume(volume: number) {
      targetVolume = Math.max(0, Math.min(1, volume));
      if (wanted && !audio.paused) fadeTo(targetVolume, 400);
    },
    reset() {
      generation++;
      wanted = false;
      cancelFade();
      audio.pause();
      audio.volume = 0;
    },
  };
}
