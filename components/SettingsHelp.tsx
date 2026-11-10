"use client";
import { useEffect, useState, type ReactNode } from "react";
export default function SettingsHelp({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem(`into-admin-help:${id}`) === "1"); } catch {} }, [id]);
  const toggle = () => setOpen(current => {
    const next = !current;
    try { localStorage.setItem(`into-admin-help:${id}`, next ? "1" : "0"); } catch {}
    return next;
  });
  return <div className="settings-help"><button type="button" className="settings-help-toggle" aria-expanded={open} aria-controls={`help-${id}`} onClick={toggle}>{open ? "收起说明" : "展开说明"}<span aria-hidden="true">{open ? " −" : " ＋"}</span></button><div id={`help-${id}`} className="settings-help-content" hidden={!open}>{children}</div></div>;
}
