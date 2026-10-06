"use client";

import { useCallback, useEffect, useState } from "react";

type Note = { id: number; title: string; body: string; recorded_on: string; status: "draft" | "published" | "archived" };
type NoteDraft = Omit<Note, "id"> & { id?: number };
const statusLabels = { draft: "草稿", published: "已发布", archived: "已归档" };
const newDraft = (): NoteDraft => {
  const today = new Date();
  const recorded_on = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { title: "", body: "", recorded_on, status: "draft" };
};

async function requestNotes(path: string, token = "", options: RequestInit = {}) {
  const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "随手记加载失败");
  return data;
}

export function PublicNotes({ title, introduction }: { title: string; introduction: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void requestNotes("/api/notes", "", { signal: controller.signal }).then((data) => {
      setNotes(data.notes); setError("");
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "随手记加载失败");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="ix-notes-page" aria-busy={loading}>
    <header className="ix-journal-heading"><span>PERSONAL NOTES</span><h1>{title || "随手记"}</h1><p>{introduction}</p></header>
    {loading ? <p className="ix-journal-status" role="status">正在翻开随手记……</p> : error ? <div className="ix-journal-status" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>重新加载</button></div> : notes.length ? <div className="ix-journal-list">{notes.map((note) => <article className="ix-journal-entry" key={note.id}><time dateTime={note.recorded_on}>{note.recorded_on.replaceAll("-", ".")}</time><h2>{note.title}</h2><p>{note.body}</p></article>)}</div> : <div className="ix-journal-status"><h2>还没有发布的随手记</h2><p>日常心情、校园小事和想留住的念头，都会陆续记录在这里。</p><a href="/messages">去留言操场聊聊 →</a></div>}
  </section>;
}

export function NotesManager({ token }: { token: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState<NoteDraft>(newDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Note | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await requestNotes("/api/admin/notes", token); setNotes(data.notes); setLoadError(""); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "无法读取随手记"); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const save = async (status: Note["status"]) => {
    if (busy) return;
    if (!draft.title.trim() || !draft.body.trim() || !draft.recorded_on) { setMessage("请填写标题、正文和日期"); return; }
    setBusy(true); setMessage("");
    try {
      await requestNotes(`/api/admin/notes${draft.id ? `/${draft.id}` : ""}`, token, { method: draft.id ? "PATCH" : "POST", body: JSON.stringify({ ...draft, status }) });
      setDraft(newDraft()); setMessage(status === "published" ? "已发布，访客现在可以阅读这篇随手记" : "已保存为草稿，访客暂时看不到");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，内容已保留"); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    if (!archiveTarget || busy) return;
    setBusy(true);
    try {
      await requestNotes(`/api/admin/notes/${archiveTarget.id}`, token, { method: "DELETE" });
      if (draft.id === archiveTarget.id) setDraft(newDraft());
      setArchiveTarget(null); setMessage("已归档，访客不再看到这篇记录；可编辑后重新发布"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "归档失败"); }
    finally { setBusy(false); }
  };
  return <section className="admin-notes-manager" aria-label="随手记内容管理">
    <header><div><h2>随手记内容</h2><p>记下日常心情或校园小事。保存草稿供自己整理，发布后访客即可阅读。</p></div><button type="button" disabled={busy} onClick={() => { setDraft(newDraft()); setMessage(""); }}>＋ 新增随手记</button></header>
    <div className="admin-note-editor"><h3>{draft.id ? "编辑随手记" : "写一篇随手记"}</h3>
      <label>标题<input maxLength={100} value={draft.title} disabled={busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="给今天的片段起个名字" /></label>
      <label>记录日期<input type="date" value={draft.recorded_on} disabled={busy} onChange={(event) => setDraft({ ...draft, recorded_on: event.target.value })} /></label>
      <label>正文<textarea rows={8} maxLength={12000} value={draft.body} disabled={busy} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="写下想留住的事情……" /><small>{draft.body.length} / 12000</small></label>
      <div className="admin-note-actions"><button type="button" disabled={busy} onClick={() => void save("draft")}>保存草稿</button><button type="button" disabled={busy} onClick={() => void save("published")}>{busy ? "正在保存…" : draft.id && draft.status === "published" ? "保存并更新发布" : "发布随手记"}</button>{draft.id && <button type="button" disabled={busy} onClick={() => setDraft(newDraft())}>取消编辑</button>}</div>
      <p role="status" aria-live="polite">{message || "随手记使用上方按钮保存；页面标题和介绍使用“保存全部设置”。"}</p>
    </div>
    {loading ? <p role="status">正在读取记录……</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void load()}>重新加载</button></div> : <div className="admin-note-list">{notes.length ? notes.map((note) => <article key={note.id}><div><span>{statusLabels[note.status]} · {note.recorded_on}</span><h3>{note.title}</h3><p>{note.body.slice(0, 120)}{note.body.length > 120 ? "…" : ""}</p></div><div className="admin-note-actions"><button type="button" disabled={busy} onClick={() => { setDraft({ ...note }); setMessage(""); }}>{note.status === "archived" ? "编辑并恢复" : "编辑"}</button>{note.status !== "archived" && <button type="button" disabled={busy} onClick={() => setArchiveTarget(note)}>归档</button>}</div></article>) : <p>还没有记录，可以在上方写第一篇。</p>}</div>}
    {archiveTarget && <div className="admin-delete-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-archive-title"><div className="admin-delete-dialog"><h2 id="note-archive-title">归档这篇随手记？</h2><p>“{archiveTarget.title}”将从访客页面隐藏，内容仍会保留，可重新发布。</p><div className="admin-note-actions"><button type="button" disabled={busy} onClick={() => setArchiveTarget(null)}>取消</button><button type="button" disabled={busy} onClick={() => void archive()}>{busy ? "正在归档…" : "确认归档"}</button></div></div></div>}
  </section>;
}
