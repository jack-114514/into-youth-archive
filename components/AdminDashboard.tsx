"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Row = Record<string, string | number | null>;
type TimelineItem = { date: string; title: string; text: string };
type MediaTarget = "primary" | "companion" | { id: number; field: "url" | "video_url" };

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

// Cloudflare's public test key. Replace this with your own public site key in production.
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

function TurnstileVerification({ onVerify, resetSignal }: { onVerify: (token: string) => void; resetSignal: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "admin_password_recovery",
        theme: "light",
        size: "flexible",
        callback: (value: string) => onVerify(value),
        "expired-callback": () => onVerify(""),
        "error-callback": () => onVerify(""),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-into-turnstile="true"]');
    if (existing) {
      if (window.turnstile) renderWidget();
      else existing.addEventListener("load", renderWidget, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.intoTurnstile = "true";
      script.addEventListener("load", renderWidget, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [onVerify]);

  useEffect(() => {
    if (resetSignal && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onVerify("");
    }
  }, [resetSignal, onVerify]);

  return <div className="turnstile-box"><div ref={containerRef} /><small>通过安全验证后才能发送邮箱验证码</small></div>;
}

const defaultTimelineItems: TimelineItem[] = [
  { date: "2023.09", title: "第一次走进这里", text: "风很轻，书包很重，未来还是一张没有写字的纸。" },
  { date: "2024.03", title: "春天在操场集合", text: "我们用一整个下午，把笑声留在跑道边。" },
  { date: "2025.06", title: "教室最后一排", text: "黑板上的倒计时越来越小，想说的话却越来越多。" },
  { date: "NOW", title: "故事仍在继续", text: "今天也值得记录。等未来回头看，它一定很亮。" },
];

function parseTimelineItems(value: unknown): TimelineItem[] {
  try {
    const parsed = JSON.parse(String(value || ""));
    return Array.isArray(parsed) && parsed.length ? parsed.slice(0, 8).map((item) => ({
      date: String(item?.date || ""), title: String(item?.title || ""), text: String(item?.text || ""),
    })) : defaultTimelineItems;
  } catch {
    return defaultTimelineItems;
  }
}

async function api(path: string, options: RequestInit = {}, token = "") {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatDate(value: unknown) {
  if (!value) return "";
  return new Date(String(value)).toLocaleString("zh-CN", { hour12: false });
}

function isVideoUrl(value: unknown) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(String(value || "")) || String(value || "").startsWith("data:video/");
}

export default function AdminDashboard() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("comments");
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadData, setUploadData] = useState("");
  const [videoUploadData, setVideoUploadData] = useState("");
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaMeta, setMediaMeta] = useState("");
  const [mediaBody, setMediaBody] = useState("");
  const [mediaTakenAt, setMediaTakenAt] = useState("");
  const [mediaSortOrder, setMediaSortOrder] = useState("");
  const [mediaShowOnHome, setMediaShowOnHome] = useState(true);
  const [mediaShowIn3d, setMediaShowIn3d] = useState(true);
  const [settings, setSettings] = useState({ site_title: "INTO / 青春纪事", hero_title: "把青春留在风经过的地方", profile_text: "", timeline_items: JSON.stringify(defaultTimelineItems) });
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [securityMessage, setSecurityMessage] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCodeSent, setRecoveryCodeSent] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("into-admin-token");
    if (saved) setToken(saved);
    setSidebarCollapsed(localStorage.getItem("into-admin-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    if (!token) return;
    loadTab(tab);
    api("/api/content").then((data) => setSettings((current) => ({ ...current, ...(data.settings || {}) }))).catch(() => undefined);
  }, [token, tab]);

  const loadTab = async (target: string) => {
    setLoading(true);
    try {
      const data = await api(`/api/admin/${target}`, {}, token);
      setRows(data[target] || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
      if (String(error).includes("重新登录")) logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      sessionStorage.setItem("into-admin-token", data.token);
      setToken(data.token);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  };

  const logout = () => {
    sessionStorage.removeItem("into-admin-token");
    setToken("");
    setRows([]);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("into-admin-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const remove = async (id: number) => {
    if (!window.confirm("确认删除这条内容？删除后无法恢复。")) return;
    try {
      await api(`/api/admin/${tab}/${id}`, { method: "DELETE" }, token);
      setRows((items) => items.filter((item) => Number(item.id) !== id));
      setMessage("已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  const chooseMedia = (file?: File, target: MediaTarget = "primary") => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (/\.(heic|heif)$/.test(lowerName) || /image\/(heic|heif)/.test(file.type)) return setMessage("苹果实况照片请先从相册导出为 JPEG；当前会按静态照片保存");
    if (lowerName.endsWith(".mov") || file.type === "video/quicktime") return setMessage("苹果实况视频请先转换成 720P MP4 再上传");
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
    if (!isVideo && !isImage) return setMessage("仅支持 JPG、PNG、WebP、GIF、MP4 或 WebM");
    const companionTarget = target === "companion" || (typeof target === "object" && target.field === "video_url");
    if (companionTarget && !isVideo) return setMessage("关联内容只能选择 MP4 或 WebM 短视频");
    if (!isVideo && file.size > 5 * 1024 * 1024) return setMessage("图片不能超过 5MB");
    if (isVideo && file.size > 12 * 1024 * 1024) return setMessage("短视频不能超过 12MB");
    const read = () => {
      const reader = new FileReader();
      reader.onload = () => typeof target === "object" ? updateMediaRow(target.id, target.field, String(reader.result)) : target === "companion" ? setVideoUploadData(String(reader.result)) : setUploadData(String(reader.result));
      reader.onerror = () => setMessage("无法读取这个文件");
      reader.readAsDataURL(file);
    };
    if (!isVideo) return read();
    const previewUrl = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(previewUrl);
      if (!Number.isFinite(probe.duration) || probe.duration > 10.1) return setMessage("视频最长为 10 秒，建议控制在 5 秒左右");
      read();
    };
    probe.onerror = () => { URL.revokeObjectURL(previewUrl); setMessage("无法读取视频时长，请换成 MP4 或 WebM"); };
    probe.src = previewUrl;
  };

  const addMedia = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadData) return setMessage("请先选择图片或短视频");
    if (videoUploadData && isVideoUrl(uploadData)) return setMessage("只有照片可以再关联一个视频；如果只上传视频，请清除右侧关联视频");
    try {
      setLoading(true);
      const uploaded = await api("/api/upload", { method: "POST", body: JSON.stringify({ data: uploadData }) });
      const companion = videoUploadData ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: videoUploadData }) }) : { url: "" };
      await api("/api/admin/media", { method: "POST", body: JSON.stringify({ url: uploaded.url, video_url: companion.url, title: mediaTitle || "新的青春片段", meta: mediaMeta || "校园日常", body: mediaBody, taken_at: mediaTakenAt, sort_order: mediaSortOrder.trim() ? Number(mediaSortOrder) : null, show_on_home: mediaShowOnHome ? 1 : 0, show_in_3d: mediaShowIn3d ? 1 : 0 }) }, token);
      setUploadData(""); setVideoUploadData(""); setMediaTitle(""); setMediaMeta(""); setMediaBody(""); setMediaTakenAt(""); setMediaSortOrder(""); setMediaShowOnHome(true); setMediaShowIn3d(true);
      setMessage("内容已经加入记忆展厅");
      await loadTab("media");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setLoading(false);
    }
  };

  const updateMediaRow = (id: number, key: string, value: string | number) => {
    setRows((items) => items.map((item) => Number(item.id) === id ? { ...item, [key]: value } : item));
  };

  const updateMediaOrder = (id: number, value: string) => {
    setRows((items) => items.map((item) => Number(item.id) === id ? { ...item, sort_order_input: value, sort_order_dirty: 1 } : item));
  };

  const removeRowMedia = (row: Row, field: "url" | "video_url") => {
    const otherField = field === "url" ? "video_url" : "url";
    if (!row[otherField]) return setMessage("每条内容至少要保留一张图片或一个视频；如需全部移除，请删除整条内容");
    updateMediaRow(Number(row.id), field, "");
    setMessage(field === "url" ? "图片已标记移除，点击“保存修改”后生效" : "视频已标记移除，点击“保存修改”后生效");
  };

  const saveMedia = async (row: Row) => {
    try {
      setLoading(true);
      const primary = String(row.url || "");
      const companion = String(row.video_url || "");
      const savedPrimary = primary.startsWith("data:") ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: primary }) }) : { url: primary };
      const savedCompanion = companion.startsWith("data:") ? await api("/api/upload", { method: "POST", body: JSON.stringify({ data: companion }) }) : { url: companion };
      await api(`/api/admin/media/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: row.title || "未命名照片",
          url: savedPrimary.url,
          video_url: savedCompanion.url,
          meta: row.meta || "",
          body: row.body || "",
          taken_at: row.taken_at || "",
          sort_order: String(row.sort_order_input ?? row.sort_order ?? "").trim() && (Number(row.sort_order_dirty) === 1 || Number(row.sort_manual) === 1) ? Number(row.sort_order_input ?? row.sort_order) : null,
          show_on_home: Number(row.show_on_home ?? 1) === 1 ? 1 : 0,
          show_in_3d: Number(row.show_in_3d ?? 1) === 1 ? 1 : 0,
        }),
      }, token);
      setMessage("标题、正文、时间、顺序与首页展示状态已保存");
      await loadTab("media");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片信息保存失败");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) }, token);
      setMessage("网站文字已经更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const timelineItems = parseTimelineItems(settings.timeline_items);
  const setTimelineItems = (items: TimelineItem[]) => setSettings({ ...settings, timeline_items: JSON.stringify(items) });
  const updateTimelineItem = (index: number, key: keyof TimelineItem, value: string) => {
    const next = timelineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    setTimelineItems(next);
  };
  const moveTimelineItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= timelineItems.length) return;
    const next = [...timelineItems];
    [next[index], next[target]] = [next[target], next[index]];
    setTimelineItems(next);
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/admin/password-recovery/complete", { method: "POST", body: JSON.stringify({ password: newPassword, code: verificationCode }) });
      setMessage("密码已更新，请使用新密码登录");
      setNewPassword("");
      setVerificationCode("");
      setRecoveryCodeSent(false);
      setTurnstileToken("");
      if (token) logout();
      else setRecoveryOpen(false);
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "修改失败");
    }
  };

  const sendPasswordCode = async () => {
    if (!turnstileToken) return setSecurityMessage("请先完成人机验证");
    try {
      setCodeLoading(true);
      setSecurityMessage("");
      const data = await api("/api/admin/password-recovery/code", { method: "POST", body: JSON.stringify({ turnstile_token: turnstileToken }) });
      setSecurityMessage(`验证码已发送到 ${data.email}，10 分钟内有效`);
      setRecoveryCodeSent(true);
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setCodeLoading(false);
      setTurnstileReset((value) => value + 1);
    }
  };

  if (!token) {
    return (
      <main className="admin-shell login-shell">
        <a className="admin-brand" href="/">INTO <span>/</span> 青春纪事</a>
        <form className="admin-login" onSubmit={recoveryOpen ? changePassword : login}>
          <div className="admin-symbol">✦</div>
          <p>CREATOR CONSOLE</p>
          <h1>{recoveryOpen ? <>找回你的<br /><em>管理员密码</em></> : <>回到你的<br /><em>青春控制室</em></>}</h1>
          {recoveryOpen ? <>
            <div className="recovery-steps"><span className="active">1 人机验证</span><span className={recoveryCodeSent ? "active" : ""}>2 邮箱验证</span><span className={recoveryCodeSent ? "active" : ""}>3 新密码</span></div>
            {!recoveryCodeSent && <>
              <p className="recovery-hint">先完成人机验证，再把 6 位验证码发送到管理员邮箱。</p>
              <TurnstileVerification onVerify={setTurnstileToken} resetSignal={turnstileReset} />
              <button type="button" onClick={sendPasswordCode} disabled={codeLoading || !turnstileToken}>{codeLoading ? "正在发送…" : "发送邮箱验证码"}<span>↗</span></button>
            </>}
            {recoveryCodeSent && <>
              <label>6 位邮箱验证码</label>
              <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} placeholder="输入邮箱中的验证码" required />
              <label>新管理员密码</label>
              <input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 12 位" required />
              <button type="submit">验证并更新密码 <span>↗</span></button>
            </>}
            {securityMessage && <div className="security-message" role="status">{securityMessage}</div>}
            <button className="login-link-button" type="button" onClick={() => { setRecoveryOpen(false); setRecoveryCodeSent(false); setSecurityMessage(""); setTurnstileToken(""); }}>返回管理员登录</button>
          </> : <>
            <label>管理员用户名</label>
            <input type="email" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required placeholder="输入管理员邮箱" />
            <label>管理员密码</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="输入管理员密码" />
            <button type="submit">进入后台 <span>↗</span></button>
            <button className="login-link-button" type="button" onClick={() => { setRecoveryOpen(true); setMessage(""); }}>忘记密码？</button>
            {message && <small>{message}</small>}
          </>}
        </form>
      </main>
    );
  }

  return (
    <main className={"admin-shell" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head"><a className="admin-brand" href="/"><b>INTO</b> <span>/</span> <em>青春纪事</em></a><button className="admin-sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "展开菜单栏" : "收起菜单栏"} title={sidebarCollapsed ? "展开菜单栏" : "收起菜单栏"}>{sidebarCollapsed ? "→" : "←"}</button></div>
        <nav>
          {[["comments", "留言管理", "◎"], ["submissions", "投稿信箱", "✦"], ["media", "图片与内容", "▣"], ["settings", "网站设置", "◇"], ["account", "账号管理", "◉"]].map(([key, label, icon]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setSecurityMessage(""); }} title={sidebarCollapsed ? label : undefined}><span>{icon}</span><b>{label}</b></button>
          ))}
        </nav>
        <div className="sidebar-bottom"><a href="/" target="_blank"><span>↗</span><b>查看网站</b></a><button onClick={logout}><span>↩</span><b>退出后台</b></button></div>
      </aside>
      <section className="admin-main">
        <header><div><p>CREATOR CONSOLE / 2026</p><h1>{tab === "comments" ? "留言管理" : tab === "submissions" ? "投稿信箱" : tab === "media" ? "图片与内容" : tab === "account" ? "账号管理" : "网站设置"}</h1></div><span className="admin-status"><i /> 服务正常</span></header>
        {message && <div className="admin-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
        {tab === "media" && (
          <form className="media-form" onSubmit={addMedia}>
            <label className="media-drop">{uploadData ? isVideoUrl(uploadData) ? <video src={uploadData} muted loop autoPlay playsInline /> : <img src={uploadData} alt="上传预览" /> : <><strong>＋</strong><span>选择校园照片或短视频</span><small>图片最大 5MB；MP4/WebM 最长 10 秒、最大 12MB。苹果实况照片请导出 JPEG，保留动态则转为 720P MP4。</small></>}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0])} /></label>
            <div><input placeholder="内容标题" value={mediaTitle} onChange={(event) => setMediaTitle(event.target.value)} /><input placeholder="地点或说明，例如：初夏 · 操场" value={mediaMeta} onChange={(event) => setMediaMeta(event.target.value)} /><textarea className="media-body-input" placeholder="正文内容：写下这张照片或视频背后的故事" maxLength={3000} value={mediaBody} onChange={(event) => setMediaBody(event.target.value)} /><label className="media-companion">关联短视频（可选）<span>{videoUploadData ? <video src={videoUploadData} muted playsInline /> : "先展示左侧照片；视频加载完成后自动播放"}</span><input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], "companion")} />{videoUploadData && <button type="button" onClick={() => setVideoUploadData("")}>移除关联视频</button>}</label><label className="media-field">拍摄时间<input type="datetime-local" value={mediaTakenAt} onChange={(event) => setMediaTakenAt(event.target.value)} /></label><label className="media-field">展示顺序（可选）<input type="number" min="1" step="1" placeholder="留空则按拍摄时间自动排序" value={mediaSortOrder} onChange={(event) => setMediaSortOrder(event.target.value)} /></label><div className="media-visibility-toggles"><label className="media-home-toggle"><input type="checkbox" checked={mediaShowOnHome} onChange={(event) => setMediaShowOnHome(event.target.checked)} /><span>在首页展示</span></label><label className="media-home-toggle"><input type="checkbox" checked={mediaShowIn3d} onChange={(event) => setMediaShowIn3d(event.target.checked)} /><span>在 3D 树中展示</span></label></div><button type="submit" disabled={loading}>加入记忆展厅</button></div>
          </form>
        )}
        {tab === "settings" ? (
          <div className="settings-grid settings-grid-single">
            <form className="settings-form" onSubmit={saveSettings}>
              <h2>网站文字</h2>
              <label>网站名称<input value={settings.site_title} onChange={(event) => setSettings({ ...settings, site_title: event.target.value })} /></label>
              <label>首屏标题<input value={settings.hero_title} onChange={(event) => setSettings({ ...settings, hero_title: event.target.value })} /></label>
              <label>个人简介<textarea value={settings.profile_text} onChange={(event) => setSettings({ ...settings, profile_text: event.target.value })} /></label>
              <div className="timeline-settings">
                <h2>青春时间线</h2>
                <p>依次修改每一段的时间、标题和正文，保存后首页会立即更新。</p>
                {timelineItems.map((item, index) => (
                  <fieldset key={index}>
                    <legend>第 {index + 1} 段</legend>
                    <label>时间<input value={item.date} maxLength={20} onChange={(event) => updateTimelineItem(index, "date", event.target.value)} /></label>
                    <label>标题<input value={item.title} maxLength={80} onChange={(event) => updateTimelineItem(index, "title", event.target.value)} /></label>
                    <label>正文<textarea value={item.text} maxLength={500} onChange={(event) => updateTimelineItem(index, "text", event.target.value)} /></label>
                    <div className="timeline-row-actions"><button type="button" disabled={index === 0} onClick={() => moveTimelineItem(index, -1)}>上移</button><button type="button" disabled={index === timelineItems.length - 1} onClick={() => moveTimelineItem(index, 1)}>下移</button><button type="button" disabled={timelineItems.length === 1} onClick={() => setTimelineItems(timelineItems.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div>
                  </fieldset>
                ))}
                <button className="timeline-add" type="button" disabled={timelineItems.length >= 8} onClick={() => setTimelineItems([...timelineItems, { date: "", title: "新的青春片段", text: "" }])}>＋ 添加时间线片段</button>
              </div>
              <button type="submit">保存全部文字设置</button>
            </form>
          </div>
        ) : tab === "account" ? (
          <div className="account-management">
            <form className="settings-form account-settings" onSubmit={changePassword}>
              <div className="account-settings-head"><div><p>ADMINISTRATOR ACCOUNT</p><h2>更改管理员密码</h2></div><span>当前账号<br /><strong>{username}</strong></span></div>
              <p className="account-intro">为了保护后台内容，必须先完成人机验证，再通过管理员邮箱收到的 6 位验证码更改密码。</p>
              <div className="recovery-steps"><span className="active">1 人机验证</span><span className={recoveryCodeSent ? "active" : ""}>2 邮箱验证</span><span className={recoveryCodeSent ? "active" : ""}>3 新密码</span></div>
              {!recoveryCodeSent ? <>
                <TurnstileVerification onVerify={setTurnstileToken} resetSignal={turnstileReset} />
                <button type="button" onClick={sendPasswordCode} disabled={codeLoading || !turnstileToken}>{codeLoading ? "正在发送…" : "发送邮箱验证码"}</button>
              </> : <>
                <label>6 位邮箱验证码<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} placeholder="输入邮箱中的验证码" required /></label>
                <label>新管理员密码<input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 12 位" required /></label>
                <p>验证码 10 分钟内有效。密码修改成功后，所有后台会话都会安全退出。</p>
                <div className="account-actions"><button type="submit">验证并更新密码</button><button type="button" className="secondary" onClick={() => { setRecoveryCodeSent(false); setVerificationCode(""); setSecurityMessage(""); setTurnstileReset((value) => value + 1); }}>重新发送验证码</button></div>
              </>}
              {securityMessage && <div className="security-message" role="status">{securityMessage}</div>}
            </form>
          </div>
        ) : (
          <div className="admin-table-wrap">
            {loading ? <div className="admin-empty">正在整理内容…</div> : rows.length === 0 ? <div className="admin-empty">这里暂时还没有内容</div> : (
              <div className="admin-table">
                {rows.map((row) => <article key={String(row.id)} className={tab === "media" ? "media-row" : ""}>
                  {tab === "media" && (row.url || row.video_url) ? <div className="media-row-preview">{row.url ? <div className="media-preview-item"><label title="点击更换图片或视频">{isVideoUrl(row.url) ? <video src={String(row.url)} muted loop autoPlay playsInline /> : <img src={String(row.url)} alt="内容图片，点击更换" />}<span>点击更换</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: Number(row.id), field: "url" })} /></label><button type="button" onClick={() => removeRowMedia(row, "url")}>{isVideoUrl(row.url) ? "删除视频" : "删除图片"}</button></div> : <label className="media-preview-empty">＋ 添加图片或视频<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: Number(row.id), field: "url" })} /></label>}{row.video_url && <div className="media-preview-item"><label title="点击更换关联视频"><video src={String(row.video_url)} muted playsInline /><span>点击更换</span><input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: Number(row.id), field: "video_url" })} /></label><button type="button" onClick={() => removeRowMedia(row, "video_url")}>删除视频</button></div>}</div> : <div className="row-avatar">{tab === "comments" ? String(row.avatar || "○") : "✉"}</div>}
                  <div className="row-content"><div><strong>{String(row.nickname || row.title || "未命名")}</strong><time>{formatDate(row.created_at)}</time></div>{tab === "media" ? <div className="media-row-editor"><label>标题<input value={String(row.title || "")} onChange={(event) => updateMediaRow(Number(row.id), "title", event.target.value)} /></label><label>地点 / 说明<input value={String(row.meta || "")} onChange={(event) => updateMediaRow(Number(row.id), "meta", event.target.value)} /></label><label className="media-body-field">正文<textarea maxLength={3000} value={String(row.body || "")} onChange={(event) => updateMediaRow(Number(row.id), "body", event.target.value)} /></label><label>拍摄时间<input type="datetime-local" value={String(row.taken_at || "")} onChange={(event) => updateMediaRow(Number(row.id), "taken_at", event.target.value)} /></label><label>展示顺序<input type="number" min="1" step="1" value={String(row.sort_order_input ?? row.sort_order ?? "")} onChange={(event) => updateMediaOrder(Number(row.id), event.target.value)} /></label><div className="media-visibility-toggles"><label className="media-home-toggle"><input type="checkbox" checked={Number(row.show_on_home ?? 1) === 1} onChange={(event) => updateMediaRow(Number(row.id), "show_on_home", event.target.checked ? 1 : 0)} /><span>在首页展示</span></label><label className="media-home-toggle"><input type="checkbox" checked={Number(row.show_in_3d ?? 1) === 1} onChange={(event) => updateMediaRow(Number(row.id), "show_in_3d", event.target.checked ? 1 : 0)} /><span>在 3D 树中展示</span></label></div><label className="media-row-video">关联短视频<input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseMedia(event.target.files?.[0], { id: Number(row.id), field: "video_url" })} /><span>{row.video_url ? "已关联视频，可点击左侧预览更换" : "未关联"}</span></label>{row.video_url && <button type="button" className="media-remove-video" onClick={() => removeRowMedia(row, "video_url")}>移除关联视频</button>}<button type="button" onClick={() => saveMedia(row)} disabled={loading}>保存修改</button></div> : <><h3>{tab === "submissions" ? String(row.title || "") : ""}</h3><p>{String(row.text || row.body || "")}</p>{row.image ? <a href={String(row.image)} target="_blank">查看附图 ↗</a> : null}</>}</div>
                  <button className="delete-row" onClick={() => remove(Number(row.id))}>删除</button>
                </article>)}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
