type Sample = { time: number; values: (number | null | undefined)[] };
export default function ResourceChart({ samples, labels, maximum, rate = false }: { samples: Sample[]; labels: string[]; maximum?: number; rate?: boolean }) {
  const top = maximum ?? Math.max(1024, ...samples.flatMap(s => s.values.map(v => (v ?? 0) * 1.15)));
  const end = samples.at(-1)?.time ?? Date.now();
  const start = end - 60000;
  const x = (t: number) => 64 + (t - start) / 60000 * 284;
  const y = (v: number) => 100 - Math.max(0, Math.min(top, v)) / top * 88;
  const unit = (v: number) => rate ? v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}` : `${Math.round(v)}%`;
  return <div className="resource-chart">
    <svg viewBox="0 0 356 140" role="img" aria-label={`${labels.join("、")}，最近60秒趋势${rate ? "，单位bps" : ""}`}>
      {[0, .5, 1].map(n => <g key={n}><line x1="64" x2="348" y1={y(top * n)} y2={y(top * n)} className="resource-chart-grid" /><text x="54" y={y(top * n) + 4} textAnchor="end">{unit(top * n)}</text></g>)}
      {labels.map((label, index) => {
        let previous = 0;
        const d = samples.map(s => {
          const v = s.values[index];
          if (v == null || !Number.isFinite(v)) { previous = 0; return ""; }
          const command = !previous || s.time - previous > 4000 ? "M" : "L"; previous = s.time;
          return `${command}${x(s.time).toFixed(1)},${y(v).toFixed(1)}`;
        }).join(" ");
        const last = samples.at(-1); const v = last?.values[index];
        return <g key={label} className={`resource-series series-${index}`}><path d={d} />{last && v != null && <circle cx={x(last.time)} cy={y(v)} r="2.4" />}</g>;
      })}
      <text x="64" y="128">60 秒前</text><text x="348" y="128" textAnchor="end">现在{rate ? " · bps" : ""}</text>
    </svg>
    {labels.length > 1 && <div className="resource-chart-legend">{labels.map((label, i) => <span key={label} className={`series-${i}`}><i />{label}</span>)}</div>}
    {!samples.some(s => s.values.some(v => v != null)) && <small>正在等待有效采样…</small>}
  </div>;
}
