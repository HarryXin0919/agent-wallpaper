// Follows the session logs as they grow. Read-only: files are only opened for reading.
import fs from 'node:fs';
import path from 'node:path';
import { Stream } from './parse.mjs';

const TAIL = 24 * 1024 * 1024;   // on start, read at most the last 24 MB of a file
const CHUNK = 4 * 1024 * 1024;

export class Tail {
  constructor(file, stream) { this.file = file; this.stream = stream; this.pos = -1; this.rest = ''; this.mtime = 0; }
  // read whatever was appended since last time; returns true if anything new arrived
  read() {
    let st; try { st = fs.statSync(this.file); } catch { return false; }
    if (st.mtimeMs === this.mtime && st.size === this.pos) return false;
    this.mtime = st.mtimeMs;
    let skipFirst = false;
    if (this.pos < 0 || st.size < this.pos) { this.pos = Math.max(0, st.size - TAIL); skipFirst = this.pos > 0; this.rest = ''; }
    if (st.size === this.pos) return false;
    let fd; try { fd = fs.openSync(this.file, 'r'); } catch { return false; }
    try {
      while (this.pos < st.size) {
        const n = Math.min(CHUNK, st.size - this.pos);
        const buf = Buffer.alloc(n);
        const got = fs.readSync(fd, buf, 0, n, this.pos);
        if (got <= 0) break;
        this.pos += got;
        const lines = (this.rest + buf.toString('utf8', 0, got)).split('\n');
        this.rest = lines.pop();
        if (skipFirst) { lines.shift(); skipFirst = false; }
        for (const l of lines) this.stream.line(l);
      }
    } finally { fs.closeSync(fd); }
    return true;
  }
}

export class Live {
  constructor(root, opts = {}) {
    this.root = root;
    this.hours = opts.hours || 12;
    this.sessions = new Map(); // id -> { id, file, dir, tail, stream, subs: Map(file -> {tail, stream, meta}) }
    this.lastScan = 0;
    this.version = 0;
  }
  scan() {
    const cutoff = Date.now() - this.hours * 3600e3;
    let projects = [];
    try { projects = fs.readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return; }
    for (const p of projects) {
      const pdir = path.join(this.root, p.name);
      let files = [];
      try { files = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const file = path.join(pdir, f);
        const id = f.slice(0, -6);
        if (this.sessions.has(id)) continue;
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        const stream = new Stream();
        this.sessions.set(id, { id, file, dir: file.slice(0, -6), stream, tail: new Tail(file, stream), subs: new Map() });
      }
    }
    // forget sessions that went quiet long ago
    for (const [id, s] of this.sessions) if (s.tail.mtime && s.tail.mtime < cutoff) this.sessions.delete(id);
    this.lastScan = Date.now();
  }
  scanSubs(s) {
    const dir = path.join(s.dir, 'subagents');
    let files; try { files = fs.readdirSync(dir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(dir, f);
      if (s.subs.has(file)) continue;
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (st.mtimeMs < Date.now() - this.hours * 3600e3) continue;
      const stream = new Stream(true);
      s.subs.set(file, { tail: new Tail(file, stream), stream, meta: null, metaFile: file.replace(/\.jsonl$/, '.meta.json') });
    }
  }
  // returns true if anything changed
  poll() {
    let changed = false;
    if (Date.now() - this.lastScan > 10000) this.scan();
    for (const s of this.sessions.values()) {
      if (s.tail.read()) changed = true;
      const hasAgents = s.stream.ev.some((e) => e.kind === 'agent');
      if (hasAgents) {
        if (!s.subScan || Date.now() - s.subScan > 3000) { this.scanSubs(s); s.subScan = Date.now(); }
        for (const sub of s.subs.values()) {
          if (sub.tail.read()) changed = true;
          if (!sub.meta) { try { sub.meta = JSON.parse(fs.readFileSync(sub.metaFile, 'utf8')); changed = true; } catch {} }
        }
      }
    }
    if (changed) this.version++;
    return changed;
  }
  // the latest task of each session, with subagent timelines attached to the call that started them
  snapshot() {
    const out = [];
    for (const s of this.sessions.values()) {
      const ev = s.stream.ev;
      if (!ev.length) continue;
      const first = ev[0];
      const task = { prompt: first.k === 'prompt' ? first.text : '', t0: first.t, ev: [], title: s.stream.title, mode: s.stream.mode };
      for (const e of ev) {
        if (e === first && e.k === 'prompt') continue;
        const c = { ...e };
        if (e.k === 'tool' && e.kind === 'agent') {
          for (const sub of s.subs.values()) {
            if (sub.meta?.toolUseId !== e.id) continue;
            c.sub = sub.stream.ev.filter((x) => x.k !== 'prompt').map((x) => ({ t: x.t, k: x.k, kind: x.kind, dur: x.dur, target: x.target, files: x.files, tEnd: x.tEnd, err: x.err }));
            const last = c.sub.length ? Math.max(...c.sub.map((x) => x.tEnd || x.t)) : e.t;
            c.subEnd = Math.max(last, e.t);
            c.subDone = !!sub.meta.finished;
            if (!c.subDone) c.subEnd = null; // still running: the branch has not come back yet
          }
        }
        task.ev.push(c);
      }
      task.ev.sort((a, b) => a.t - b.t);
      // tokens this task has used, and the last 15 minutes of replies for a live rate
      const tok = { in: 0, out: 0, cr: 0, cc: 0, total: 0 }, rate = [], since = Date.now() - 15 * 60e3;
      for (const m of s.stream.msgs.values()) {
        tok.in += m.in; tok.out += m.out; tok.cr += m.cr; tok.cc += m.cc;
        const n = m.in + m.out + m.cr + m.cc; tok.total += n;
        if (m.t >= since) rate.push([m.t, n, m.out]);
      }
      task.tok = tok; task.rate = rate;
      out.push({ id: s.id, title: s.stream.title, last: s.stream.last || first.t, task });
    }
    return out.sort((a, b) => b.last - a.last);
  }
}
