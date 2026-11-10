"use client";
import { useEffect, useRef, useState } from "react";

export async function flushAdminEdits() {
  const jobs: Promise<void>[] = [];
  window.dispatchEvent(new CustomEvent("into-admin-flush", { detail: jobs }));
  await Promise.all(jobs);
}

// One writer per editor. Edits made during a request remain queued.
export function useAutosave<T>(value: T, ready: boolean, save: (value: T, previous: T) => Promise<T>, delay = 650) {
  const current = useRef({ value, ready, save });
  current.current = { value, ready, save };
  const saved = useRef<T>(value);
  const initialized = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("已保存");
  const [error, setError] = useState("");
  const signature = JSON.stringify(value);
  const differs = () => JSON.stringify(current.current.value) !== JSON.stringify(saved.current);
  const flush = async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) { await running.current; return flush(); }
    if (!initialized.current || !current.current.ready || !differs()) return;
    const job = (async () => {
      try {
        if (alive.current) { setStatus("正在自动保存…"); setError(""); }
        while (current.current.ready && differs()) {
          const snapshot = current.current.value;
          const normalized = await current.current.save(snapshot, saved.current);
          saved.current = normalized;
          // The caller merges server normalization without replacing newer edits.
          if (current.current.value === snapshot) current.current.value = normalized;
        }
        if (alive.current) setStatus("已自动保存");
      } catch (reason) {
        if (alive.current) { setStatus("保存失败 · 将自动重试"); setError(reason instanceof Error ? reason.message : "连接失败，当前修改已保留"); }
        throw reason;
      }
    })();
    running.current = job;
    try { await job; } finally { running.current = null; }
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => {
    if (!ready) { initialized.current = false; return; }
    if (!initialized.current) { saved.current = value; initialized.current = true; return; }
    if (!differs()) return;
    setStatus("待自动保存…");
    timer.current = setTimeout(() => { void flushRef.current().catch(() => undefined); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [signature, ready, delay]);
  useEffect(() => {
    alive.current = true;
    const pending = (event: Event) => { (event as CustomEvent<Promise<void>[]>).detail.push(flushRef.current()); };
    const leave = (event: BeforeUnloadEvent) => { if (initialized.current && differs()) { event.preventDefault(); event.returnValue = ""; } };
    const retry = setInterval(() => { if (initialized.current && differs()) void flushRef.current().catch(() => undefined); }, 5000);
    window.addEventListener("into-admin-flush", pending);
    window.addEventListener("beforeunload", leave);
    const online = () => { void flushRef.current().catch(() => undefined); };
    window.addEventListener("online", online);
    return () => { alive.current = false; clearInterval(retry); window.removeEventListener("into-admin-flush", pending); window.removeEventListener("beforeunload", leave); window.removeEventListener("online", online); };
  }, []);
  return { status, error, flush };
}

export function AutosaveStatus({ status, error }: { status: string; error: string }) {
  return <span className={`admin-autosave${error ? " has-error" : ""}`} role="status" aria-live="polite"><i />{status}{error && <small>{error}</small>}</span>;
}
