// When a quota runs out at the current pace. Readings of how much of it is used (percent) are kept over time; the
// pace is the slope (least squares) over the last stretch since the quota was last reset.
const HOUR = 3600e3;

// percent per hour over the last `span` ms, or null when there is too little to judge
export function pace(points, now, span) {
  let from = 0;
  for (let i = 1; i < points.length; i++) if (points[i][1] < points[i - 1][1] - 2) from = i; // a drop: the quota was reset
  const pts = points.slice(from).filter(([t]) => t >= now - span && t <= now);
  if (pts.length < 3) return null;
  const t0 = pts[0][0];
  if (pts[pts.length - 1][0] - t0 < span / 6) return null; // too short a stretch
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [t, v] of pts) { const x = (t - t0) / HOUR; sx += x; sy += v; sxx += x * x; sxy += x * v; }
  const n = pts.length, den = n * sxx - sx * sx;
  return den > 0 ? (n * sxy - sx * sy) / den : null;
}

// { outAt, beforeReset } when the quota is being used up; null when it is not, or when it is unclear
export function forecast(points, now, span, pctNow, resetAt) {
  const p = pace(points, now, span);
  if (p == null || p < 0.05 || pctNow == null || pctNow >= 100) return null;
  const outAt = now + ((100 - pctNow) / p) * HOUR;
  return { perHour: p, outAt, beforeReset: !resetAt || outAt < resetAt };
}

// The readings kept: one per quota, at most one every 2 minutes; older than 6 hours, one per half hour; 8 days.
export function record(hist, key, t, v) {
  if (v == null || !Number.isFinite(v)) return;
  const list = (hist[key] = hist[key] || []);
  const last = list[list.length - 1];
  if (last && t - last[0] < 2 * 60e3) { last[1] = v; return; }
  list.push([t, v]);
  const keep = [];
  for (const p of list) {
    if (p[0] < t - 8 * 24 * HOUR) continue;
    const prev = keep[keep.length - 1];
    if (prev && p[0] < t - 6 * HOUR && p[0] - prev[0] < 30 * 60e3) continue;
    keep.push(p);
  }
  hist[key] = keep;
}

export const SPANS = { h5: 45 * 60e3, week: 24 * HOUR }; // how far back the pace is measured
