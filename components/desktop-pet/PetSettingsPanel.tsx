"use client";
import { useEffect, useState } from "react";
import { presetName, restorePreset, type PetPreset } from "./presets";
import { PetCharacter } from "./DesktopPet";
import { actions, booleanFields, chooseLine, emotions, lineFields, numericFields, type Action, type Emotion, type PetCue, type PetSettings, type VisitorIdentity } from "./settings";

async function adminRequest(token: string, path: string, data?: unknown) {
  const response = await fetch(path, { method: data ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "请求失败");
  return result;
}

export default function PetSettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<PetSettings | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [presets, setPresets] = useState<PetPreset[]>([]);
  const [presetTitle, setPresetTitle] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [key, setKey] = useState("");
  const [mask, setMask] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState<"named" | "guest">("named");
  const [emotion, setEmotion] = useState<Emotion>("happy");
  const [action, setAction] = useState<Action>("wave");
  const [cue, setCue] = useState<PetCue | null>(null);
  useEffect(() => {
    let active = true;
    adminRequest(token, "/api/admin/pet").then(result => { if (active) { setSettings(result.settings); setMask(result.keyMask); } }).catch(e => { if (active) setError(e.message); });
    adminRequest(token, "/api/admin/pet/presets").then(result => { if (active) setPresets(result.presets); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token]);
  const change = (field: keyof PetSettings, value: string | number | boolean) => setSettings(current => current ? { ...current, [field]: value } : current);
  const identity: VisitorIdentity = { visitorMode: previewMode, visitorName: previewMode === "named" ? "小明" : "" };
  const save = async () => {
  if (!settings) return;
    if (settings.lines.guest.some(s => s.includes("{name}"))) { setError("游客欢迎语不能包含 {name}"); return; }
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await adminRequest(token, "/api/admin/pet", { settings, ...(key ? { apiKey: key } : {}) });
      setSettings(result.settings); setMask(result.keyMask); setKey(""); setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMessage(""); setError("");
    try { await adminRequest(token, "/api/admin/pet/test", {}); setMessage("DeepSeek 连接正常（使用已保存的 Key 与模型）"); }
    catch (e) { setError(e instanceof Error ? e.message : "连接失败"); }
    finally { setBusy(false); }
  };
  const addPreset = async () => {
    if (!settings) return;
    setPresetBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest(token, "/api/admin/pet/presets", { name: presetTitle.trim() || presetName(settings), settings });
      setPresets(result.presets); setPresetTitle(""); setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "预设保存失败"); }
    finally { setPresetBusy(false); }
  };
  const loadPreset = (preset: PetPreset) => {
    setSettings(restorePreset(preset)); setKey(""); setCue(null); setError("");
    setMessage(`已载入「${preset.name}」，点击保存桌宠设置应用到网站；API Key 保持不变。`);
  };
  const deletePreset = async (preset: PetPreset) => {
    if (!window.confirm(`删除预设「${preset.name}」？当前桌宠设置不会改变。`)) return;
    setPresetBusy(true); setError("");
    try {
      const result = await adminRequest(token, "/api/admin/pet/presets/delete", { id: preset.id });
      setPresets(result.presets); setMessage("预设已删除，当前参数保持不变");
    } catch (e) { setError(e instanceof Error ? e.message : "预设删除失败"); }
    finally { setPresetBusy(false); }
  };
  if (!settings) return <div className="admin-empty">{error || "正在加载 AI 桌宠设置…"}</div>;
  return <div className={`pet-settings-layout${notesOpen ? "" : " notes-collapsed"}`}>
    <div className="pet-settings-form">
      <div className="pet-settings-actions"><button type="button" disabled={busy || presetBusy} onClick={save}>{busy ? "处理中…" : "保存桌宠设置"}</button><button type="button" className="pet-help-toggle" aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>{notesOpen ? "收起说明" : "展开说明"}</button><span role="status">{message}</span>{error && <span role="alert" className="pet-settings-error">{error}</span>}</div>
      <section className="pet-presets"><h3>角色预设</h3>
        <div className="pet-preset-create"><label>预设名称<input value={presetTitle} maxLength={60} placeholder={presetName(settings)} onChange={e => setPresetTitle(e.target.value)} /></label><button type="button" disabled={busy || presetBusy} onClick={addPreset}>{presetBusy ? "处理中…" : "添加当前配置为预设"}</button></div>
        <div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">保存当前表单的角色、名称、语态、人设、台词和全部参数，包括尚未应用的调整。预设保存在服务器，API Key 不写入预设。载入后立即预览，点击保存桌宠设置应用到网站。</p></div>
        <div className="pet-preset-list">{presets.map(preset => <div className="pet-preset-item" key={preset.id}><button type="button" className="pet-preset-load" aria-label={`载入预设 ${preset.name}`} disabled={busy || presetBusy} onClick={() => loadPreset(preset)}><strong>{preset.name}</strong><span>{preset.settings.name} · {preset.settings.size}px</span><small>点击载入 ↗</small></button><button type="button" className="pet-preset-delete" aria-label={`删除预设 ${preset.name}`} disabled={busy || presetBusy} onClick={() => deletePreset(preset)}>删除</button></div>)}</div>
        {!presets.length && <p className="pet-preset-empty">还没有预设，先把喜欢的配置保存下来。</p>}
      </section>
      <section><h3>角色与人设</h3><label>AI 助手名称<input value={settings.name} maxLength={40} onChange={e => change("name", e.target.value)} /></label><label>Live2D 角色<select value={settings.character} onChange={e => change("character", e.target.value)}><option value="miku">初音未来 · Live2D 官方标准版</option><option value="haru">Haru · 原色</option><option value="haru-soft">Haru · 柔和色调（同一角色）</option><option value="custom">自定义 Live2D 模型</option></select></label>{settings.character === "custom" && <label>角色模型地址<input value={settings.modelUrl || ""} maxLength={1000} placeholder="/assets/my-pet/avatar.model3.json" onChange={e => change("modelUrl", e.target.value)} /></label>}<label>语态（说话风格）<textarea value={(settings.tones || {})[settings.character === "haru-soft" ? "haru" : settings.character] || ""} maxLength={600} placeholder="描述这个角色该怎么说话，例如：用轻快元气的少女语气，句子短，偶尔带语气词。" onChange={e => setSettings({ ...settings, tones: { ...(settings.tones || {}), [settings.character === "haru-soft" ? "haru" : settings.character]: e.target.value } })} /></label><label>AI 助手人设 / System Prompt<textarea value={settings.systemPrompt || ""} maxLength={6000} onChange={e => change("systemPrompt", e.target.value)} /></label><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">语态会追加到 System Prompt 中，只影响 AI 的说话方式，不改变性格设定本身。每个角色各存一份语态，切换角色时自动切换；留空表示不额外要求语态。</p></div><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">可以更换实际形象：使用有授权的 Cubism 3 / 4 模型，将完整模型资源放在本站或支持跨域的 HTTPS 地址，填入 .model3.json 地址。贴图、动作、物理文件须保留相对路径。图片或立绘不能直接作为 Live2D 模型。自定义角色使用已有 Idle / Tap 动作；同名英文表情可自动匹配，其余保留模型默认表情。</p></div>{settings.character === "hanabi" && <div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">花火为第三方同人 Live2D 模型（非官方授权角色），来源 GitHub KISGP/model，仅作本地测试与个人站点试用；正式对外长期使用前请自行确认角色版权。模型含 5 个动作（2 个待机 + 3 个互动）与 4 个姿势表情，没有情绪表情；若模型加载失败会自动回退到 Haru。</p></div>}{settings.character === "miku" && <div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">初音模型包含 8 个动作和头发物理，无独立表情文件；思考/休息使用待机动作。模型采用 Live2D 与 Crypton 条件授权，非 MIT/CC0；角色商用需另行授权。<a href="/assets/desktop-pet/NOTICE.txt" target="_blank" rel="noreferrer">查看来源与许可</a></p></div>}</section><details className="pet-settings-group pet-interaction-group"><summary><span>显示与鼠标互动</span><small>{booleanFields.length} 项开关</small></summary><div className="pet-settings-group-body pet-interaction-settings"><label>默认位置<select value={settings.position} onChange={e => change("position", e.target.value)}><option value="right">右下角</option><option value="left">左下角</option></select></label><div className="pet-toggle-grid">{booleanFields.map(([field, label]) => <label className="pet-toggle" key={field}><input type="checkbox" checked={Boolean(settings[field])} onChange={e => change(field, e.target.checked)} />{label}</label>)}</div></div></details>
      <details className="pet-settings-group"><summary><span>大小、位置与行为参数</span><small>{numericFields.length} 项调节</small></summary><div className="pet-settings-group-body pet-numeric-settings">{numericFields.map(([field, label, min, max, step]) => <label key={field}>{label}<div className="pet-slider"><input aria-label={label} type="range" min={min} max={max} step={step} value={Number(settings[field])} onChange={e => change(field, Number(e.target.value))} /><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={Number(settings[field])} onChange={e => change(field, Math.max(min, Math.min(max, Number(e.target.value))))} /></div></label>)}</div></details>
      <details className="pet-settings-group"><summary><span>欢迎与自动气泡台词</span><small>{Object.keys(lineFields).length} 组台词</small></summary><div className="pet-settings-group-body"><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">底部选项及互动气泡仅在悬停或键盘聚焦角色时显示；欢迎和定时气泡可主动出现。自动气泡按独立间隔随机选择定时台词或当前时段台词，停留超过两分钟时优先使用长时间停留台词。每行一句。昵称欢迎语支持 {'{name}'}、{'{time}'}、{'{page}'}。游客欢迎语禁止 {'{name}'}；留空表示不说该类台词。</p></div>{Object.entries(lineFields).map(([field, label]) => <label key={field}>{label}<textarea value={(settings.lines[field] || []).join("\n")} maxLength={9000} onChange={e => setSettings({ ...settings, lines: { ...settings.lines, [field]: e.target.value.split("\n") } })} /></label>)}</div></details>
      <section><h3>DeepSeek 设置</h3><label>API Key<input type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} placeholder={mask || "输入新的 DeepSeek Key"} /></label><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">{mask ? `已保存：${mask}。留空保留旧 Key，修改时重新输入。` : "尚未保存 API Key。"}</p></div><label>模型<input value={settings.model || ""} maxLength={80} onChange={e => change("model", e.target.value)} /></label><label>API 地址<select value={settings.apiUrl} onChange={e => change("apiUrl", e.target.value)}><option value="https://api.deepseek.com">https://api.deepseek.com</option><option value="https://api.deepseek.com/v1">https://api.deepseek.com/v1</option></select></label><button type="button" disabled={busy || !mask} onClick={test}>测试已保存的 API 连接</button><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">先保存新 Key、模型与人设，再测试连接。</p></div></section>
    </div>
    <aside className="pet-preview-panel"><h3>实时预览</h3><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">调整立即预览，保存后应用到网站。角色、透明气泡、鼠标跟随、Hover 与点击均可直接体验。</p></div><div className="pet-preview-stage">{settings.enabled ? <PetCharacter settings={{ ...settings, right: Math.min(settings.right, 60), bottom: Math.min(settings.bottom, 100) }} identity={identity} page="首页" preview previewCue={cue} /> : <p>桌宠已关闭</p>}</div><div className="pet-preview-controls"><button type="button" onClick={() => { const mode = previewMode === "named" ? "guest" : "named"; setPreviewMode(mode); }}>切换为{previewMode === "named" ? "游客" : "小明"}</button><button type="button" onClick={() => setCue({ emotion, action, text: chooseLine(settings, previewMode, identity, "首页"), id: Date.now() })}>预览欢迎语</button><button type="button" onClick={() => setCue({ emotion, action, id: Date.now() })}>播放动作 / 表情</button></div><label>表情<select value={emotion} onChange={e => setEmotion(e.target.value as Emotion)}>{emotions.map(v => <option key={v}>{v}</option>)}</select></label><label>动作<select value={action} onChange={e => setAction(e.target.value as Action)}>{actions.map(v => <option key={v}>{v}</option>)}</select></label><div className="pet-settings-note-drawer" aria-hidden={!notesOpen} inert={!notesOpen}><p className="pet-settings-note">预览使用示例身份，不会改动访客登录数据或调用 DeepSeek。Haru 提供实际 Idle / Tap 动作，语义动作映射到对应模型文件。极大位置偏移在此预览容器内限制。</p></div></aside>
  </div>;
}
