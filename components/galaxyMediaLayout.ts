// Keep the original ratio in a reading-sized card with room for the surrounding scene.
export function galaxyMediaLayout(aspect: number, viewportWidth: number, viewportHeight: number) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const narrow = viewportWidth < 760;
  const stacked = ratio >= 1.4 || narrow;
  const padding = 40;
  const availableWidth = Math.max(1, Math.min(stacked ? 880 : 960, narrow ? viewportWidth - 32 : viewportWidth * .82));
  const availableHeight = Math.max(1, Math.min(680, viewportHeight * .78));
  const noteWidth = stacked ? 0 : Math.min(260, viewportWidth * .22);
  const gap = stacked ? 0 : 24;
  const maxWidth = Math.max(1, availableWidth - noteWidth - gap - padding);
  const maxHeight = Math.max(1, Math.min(stacked ? 460 : 520, availableHeight - padding - (stacked ? 112 : 0)));
  const width = Math.min(maxWidth, maxHeight * ratio);
  const height = width / ratio;
  const panelWidth = Math.max(stacked ? Math.min(360, availableWidth) : 0, width + noteWidth + gap + padding);
  return { width, height, panelWidth, stacked };
}
