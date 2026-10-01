"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function MediaLightbox({ src, title, meta, video, onClose }: { src: string; title: string; meta: string; video: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  return createPortal(<dialog ref={dialogRef} className="ix-image-lightbox" aria-label={`查看大图：${title}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <button type="button" className="ix-image-lightbox-close" onClick={onClose} aria-label="关闭大图">×</button>
    <figure>
      {video ? <video src={src} aria-label={title} controls playsInline autoPlay muted /> : <img src={src} alt={title} decoding="async" />}
      <figcaption><strong>{title}</strong><span>{meta}</span></figcaption>
    </figure>
  </dialog>, document.body);
}
