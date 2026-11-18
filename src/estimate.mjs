// A live estimate of the Claude plan quota, between the readings the Claude desktop app records.
// The app writes the real percentages (plan-usage-history.json) only while it polls, which can pause for days.
// Between readings, the tokens in the session logs (read-only) say how much was used since; how many tokens
// one percent is worth is learned from the app's own past readings against the same logs.
import fs from 'node:fs';
import path from 'node:path';

const H5 = 5 * 3600e3, WEEK = 7 * 86400e3;
// tokens weighted roughly by what they cost: output most, cache reads least; smaller models count for less
const weigh = (model, u) => {
  const mw = /haiku/.test(model) ? 0.2 : /sonnet/.test(model) ? 0.6 : 1;
  return mw * ((u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0) + 5 * (u.output_tokens || 0));
};

// Every Claude reply of the last few days: time and weight, one entry per reply. Files are read once in full,
// then only what is appended (sessions and their subagents).
export class Ledger {
  constructor(root, days = 5) { this.root = root; this.days = days; this.msgs = new Map(); this.files = new Map(); this.ready = false; this.busy = false; this.list = null; }
  async refresh() {
    if (this.busy) return; this.busy = true;
    try {
      const cutoff = Date.now() - this.days * 86400e3, found = [];
      const walk = async (d, depth) => {
        let es = []; try { es = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) { if (depth < 3) await walk(f, depth + 1); }
          else if (e.name.endsWith('.jsonl')) found.push(f);
        }
      };
      await walk(this.root, 0);
      for (const f of found) {
        let st; try { st = await fs.promises.stat(f); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        const k = this.files.get(f) || { pos: 0, rest: '' };
        if (st.size < k.pos) { k.pos = 0; k.rest = ''; }
        if (st.size === k.pos) { this.files.set(f, k); continue; }
        await this.readFrom(f, k, st.size);
        this.files.set(f, k);
      }
      for (const [id, m] of this.msgs) if (m.t < cutoff) this.msgs.delete(id);
      this.list = null; this.ready = true;
    } finally { this.busy = false; }
  }
  async readFrom(f, k, size) {
    let fh; try { fh = await fs.promises.open(f, 'r'); } catch { return; }
    try {
      const CH = 4 * 1024 * 1024;
      while (k.pos < size) {
        const n = Math.min(CH, size - k.pos), buf = Buffer.alloc(n);
        const { bytesRead } = await fh.read(buf, 0, n, k.pos);
        if (bytesRead <= 0) break;
        k.pos += bytesRead;
        const lines = (k.rest + buf.toString('utf8', 0, bytesRead)).split('\n');
        k.rest = lines.pop();
        for (const l of lines) {
          if (!l.includes('"usage"') || !l.includes('"assistant"')) continue;
          let d; try { d = JSON.parse(l); } catch { continue; }
          const m = d.message;
          if (m && m.usage && m.id) this.msgs.set(m.id, { t: Date.parse(d.timestamp), w: weigh(m.model || '', m.usage) });
        }
        if (k.rest.length > 64 * 1024 * 1024) k.rest = ''; // a broken line that never ends
      }
    } finally { await fh.close(); }
  }
  sorted() { if (!this.list) this.list = [...this.msgs.values()].sort((a, b) => a.t - b.t); return this.list; }
  sum(a, b) { let s = 0; for (const m of this.sorted()) { if (m.t <= a) continue; if (m.t > b) break; s += m.w; } return s; }
  firstAfter(t) { for (const m of this.sorted()) if (m.t >= t) return m.t; return null; }
}

// How many weighted tokens one percent is worth, from pairs of the app's readings the logs cover.
// Short gaps only (a reset in between hides how much was really used); defaults from this computer's history.
export function calibrate(samples, led) {
  const from = Date.now() - led.days * 86400e3;
  let wf = 0, pf = 0, ws = 0, ps = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.t < from) continue;
    const dt = b.t - a.t, w = led.sum(a.t, b.t), df = b.u.fh - a.u.fh, ds = b.u.sd - a.u.sd;
    if (dt <= 40 * 60e3 && df > 0) { wf += w; pf += df; }
    if (dt <= 24 * 3600e3 && ds >= 0) { ws += w; ps += ds; }
  }
  return { fh: pf >= 20 ? wf / pf : 5e5, sd: ps >= 8 ? ws / ps : 3.4e6, nf: pf, ns: ps };
}

// The estimate itself. The 5-hour window starts with the first reply after the last one ran out; the
// weekly one resets a week after the drop seen in the readings.
export function estimate(samples, led, now) {
  const s = samples.filter((x) => x.u && x.u.fh != null);
  const a = s[s.length - 1];
  if (!a || !led.ready) return null;
  const k = calibrate(s, led);
  // 5 hours
  let fh, fhReset = null, ws = null;
  if (now - a.t < H5 && a.u.fh > 0) {
    // the window of the last reading began with the first reply after the reading before its climb
    let j = s.length - 1;
    while (j > 0 && s[j - 1].u.fh > 0 && s[j - 1].u.fh <= s[j].u.fh && s[j].t - s[j - 1].t < H5) j--;
    ws = j > 0 ? led.firstAfter(s[j - 1].t) : null;
    if (ws == null || ws + H5 > now) { fh = a.u.fh + led.sum(a.t, now) / k.fh; if (ws != null) fhReset = (ws + H5 - now) / 1000; }
    else ws = led.firstAfter(ws + H5); // that window has run out since: count the new one
  } else ws = led.firstAfter(a.t);
  if (fh == null) {
    while (ws != null && ws + H5 <= now) ws = led.firstAfter(ws + H5);
    fh = ws == null ? 0 : led.sum(ws - 1, now) / k.fh;
    if (ws != null) fhReset = (ws + H5 - now) / 1000;
  }
  // the week: find the last reset in the readings (a drop), then step by weeks
  let reset = null;
  for (let i = s.length - 1; i > 0; i--) if (s[i].u.sd < s[i - 1].u.sd) { reset = s[i].t; break; }
  let sd, sdReset = null;
  if (reset) { let next = reset; while (next <= a.t) next += WEEK; if (now >= next) { while (next + WEEK <= now) next += WEEK; sd = led.sum(next, now) / k.sd; sdReset = (next + WEEK - now) / 1000; } else { sd = a.u.sd + led.sum(a.t, now) / k.sd; sdReset = (next - now) / 1000; } }
  else sd = a.u.sd + led.sum(a.t, now) / k.sd;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  return { fh: clamp(fh), sd: clamp(sd), fhReset, sdReset, t: a.t, k };
}
