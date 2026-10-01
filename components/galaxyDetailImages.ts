// Keep only a few originals decoded. Thumbnails remain the scene's texture path.
const detailImages = new Map<string, HTMLImageElement>();

export function prepareGalaxyDetailImage(url: string) {
  if (detailImages.has(url)) return;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => { void image.decode().catch(() => undefined); };
  image.onerror = () => { if (detailImages.get(url) === image) detailImages.delete(url); };
  detailImages.set(url, image);
  image.src = url;
  if (detailImages.size > 3) {
    const oldest = detailImages.keys().next().value;
    if (oldest) detailImages.delete(oldest);
  }
}

export function galaxyDetailImageAspect(url: string) {
  const image = detailImages.get(url);
  return image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
}
