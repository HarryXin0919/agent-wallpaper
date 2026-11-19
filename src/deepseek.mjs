// Read DeepSeek Harness sessions (read-only) into the same timeline as the other assistants.
// DeepSeek Harness keeps each session in ~/.dsh/sessions/<workspace>/session-<id>/session.v4.jsonl.zstd: records
// in JSON Lines, compressed as zstd frames that are appended one after another. Every record has a type, a time
// (ms) and data: user/message, assistant/message, tool/call, tool/result, turn/end, session/title, todo/write, and
// approval/asked + approval/decided around a permission prompt (so "waiting for your approval" is exact here).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { cmdLabel } from './codex.mjs';

const cut = (v, n) => { v = String(v || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const fname = (p) => String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
const LONG_CMD = /\b(npm|pnpm|yarn|npx|node|python|pytest|pip|cargo|go|make|build|test|install|ffmpeg|sleep|docker|git\s+(push|clone|fetch|pull)|curl|wget|Invoke-WebRequest)\b/i;
const textOf = (c) => (Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('') : typeof c === 'string' ? c : '');
export const supported = typeof zlib.zstdDecompressSync === 'function'; // Node 22.15+ (Electron 36+)

// one tool call in the shape the picture reads (argument names follow Claude Code's: file_path, old_string, …)
function fromTool(n, a) {
  n = String(n || '');
  const file = a.file_path || a.path || '';
  if (/^(read|read_image)$/.test(n)) return { kind: 'read', target: file, op: `读取 ${fname(file)}` };
  if (n === 'write') return { kind: 'edit', target: file, files: [file], op: `写入 ${fname(file)}`, plus: String(a.content || '').split('\n').length };
  if (n === 'edit') return { kind: 'edit', target: file, files: [file], op: `修改 ${fname(file)}`, plus: String(a.new_string || '').split('\n').length, minus: String(a.old_string || '').split('\n').length };
  if (n === 'apply_patch') { const f = (String(a.input || '').match(/\*\*\* (?:Update|Add) File: (.+)/) || [])[1]; return { kind: 'edit', target: f, files: f ? [f] : [], op: f ? `修改 ${fname(f)}` : '修改文件' }; }
  if (/^(pwsh|bash|shell)$/.test(n)) { const c = a.command || ''; return { kind: 'run', shell: true, long: LONG_CMD.test(c), op: a.description ? `运行：${cut(a.description, 34)}` : `运行：${cut(cmdLabel(c), 34)}` }; }
  if (n === 'glob') return { kind: 'search', op: `查找文件 ${cut(a.pattern, 24)}` };
  if (n === 'grep') return { kind: 'search', target: a.pattern, op: `搜索“${cut(a.pattern, 24)}”` };
  if (n === 'list') return { kind: 'search', op: '查看文件夹' };
  if (n === 'web_search') { const q = Array.isArray(a.queries) ? a.queries[0] : a.query; return { kind: 'web', op: `上网搜索“${cut(q, 26)}”` }; }
  if (n === 'web_fetch') return { kind: 'web', op: '打开网页' };
  if (n === 'todo_write') return { kind: 'plan', op: '更新任务清单' };
  if (/agent|subagent|spawn|delegate/.test(n)) return { kind: 'agent', op: `派出子代理：${cut(a.description || a.name || '', 24)}` };
  return { kind: 'other', op: `调用 ${cut(n, 28)}` };
}
const planOf = (todos) => (Array.isArray(todos) && todos.length ? todos.map((t) => ({ text: t.content || t.text || t.description || t.title, status: /complete|done/i.test(t.status) ? 'completed' : /progress|active/i.test(t.status) ? 'in_progress' : 'pending' })) : null);

export class DeepseekStream {
  constructor() { this.meta = null; this.title = null; this.last = 0; this.cur = null; this.calls = new Map(); this.asked = new Map(); }
  line(s) { if (!s) return; let r; try { r = JSON.parse(s); } catch { return; } this.feed(r); }
  feed(r) {
    const t = Number(r.time) || 0, d = r.data || {};
    if (t > this.last) this.last = t;
    if (r.type === 'session') { this.meta = r; if (r.createdAt > this.last) this.last = r.createdAt; return; }
    if (r.type === 'session/title') { if (d.title) this.title = d.title; return; }
    // a request typed by the person starts a new task (other "user" records carry context: time, skills, workspace)
    if (r.type === 'user/message') {
      if (!d.source || d.source.kind !== 'user') return;
      const text = textOf(d.content).trim();
      if (!text) return;
      this.cur = { prompt: text.slice(0, 600), t0: t, ev: [], tok: { in: 0, out: 0, cr: 0, cc: 0, total: 0 }, rate: [], plan: null, lastAct: t };
      this.calls = new Map(); this.asked = new Map();
      return;
    }
    const c = this.cur; if (!c) return;
    switch (r.type) {
      case 'assistant/message': {
        const parts = (d.message && d.message.content) || [];
        if (parts.some((p) => p.type === 'reasoning')) c.ev.push({ t: c.lastAct, k: 'think', dur: Math.max(0, t - c.lastAct) });
        const say = textOf(parts).trim();
        if (say) c.ev.push({ t, k: 'say', text: say.slice(0, 400) });
        c.lastAct = t;
        const u = d.usage;
        if (u) {
          const n = { in: Math.max(0, (u.inputTokens || 0) - (u.cacheReadTokens || 0)), cr: u.cacheReadTokens || 0, cc: u.cacheWriteTokens || 0, out: u.outputTokens || 0 };
          c.tok.in += n.in; c.tok.cr += n.cr; c.tok.cc += n.cc; c.tok.out += n.out; const tot = u.totalTokens || n.in + n.cr + n.cc + n.out; c.tok.total += tot;
          if (t >= Date.now() - 15 * 60e3) c.rate.push([t, tot, n.out]);
        }
        break;
      }
      case 'tool/call': {
        let a = {}; try { a = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : d.arguments || {}; } catch {}
        const e = { t, k: 'tool', id: d.callId, name: d.name, ...fromTool(d.name, a) };
        if (e.kind === 'plan') { const pl = planOf(a.todos); if (pl) { c.plan = pl; e.plan = pl; } }
        if ([...this.asked.values()].includes(d.callId)) e.awaiting = true;
        this.calls.set(d.callId, e); c.ev.push(e); c.lastAct = t;
        break;
      }
      case 'tool/result': {
        const m = d.message || {}, e = this.calls.get(m.toolCallId);
        if (e) { e.tEnd = Math.max(t, e.t); e.awaiting = false; if (m.isError || d.error) e.err = '出错'; }
        c.lastAct = t;
        break;
      }
      // the checklist as it now stands: on the todo_write step that set it, or as a step of its own
      case 'todo/write': {
        const pl = planOf(d.todos); if (!pl) break;
        c.plan = pl;
        const e = [...this.calls.values()].reverse().find((x) => x.kind === 'plan');
        if (e && !e.plan) e.plan = pl;
        else c.ev.push({ t, tEnd: t, k: 'tool', id: 'todo:' + r.seq, kind: 'plan', op: '更新任务清单', plan: pl });
        break;
      }
      // a permission prompt: the step waits for you until it is decided
      case 'approval/asked': {
        const e = (d.callId && this.calls.get(d.callId)) || [...this.calls.values()].reverse().find((x) => !x.tEnd && (!d.toolName || x.name === d.toolName));
        this.asked.set(d.id, d.callId || (e && e.id));
        if (e) e.awaiting = true;
        break;
      }
      case 'approval/decided': {
        const e = this.calls.get(this.asked.get(d.id)); this.asked.delete(d.id);
        if (e) { e.awaiting = false; if (/deny|denied|reject|cancel/i.test(String(d.outcome && (d.outcome.kind || d.outcome)))) { e.tEnd = t; e.err = '未批准'; } }
        c.lastAct = t;
        break;
      }
      case 'llm/retry': c.ev.push({ t, k: 'retry' }); break;
      case 'turn/end': {
        const kind = d.reason && d.reason.kind;
        for (const e of this.calls.values()) if (!e.tEnd) { e.tEnd = t; e.awaiting = false; }
        c.ev.push({ t, k: 'stop', interrupted: kind === 'interrupted' || undefined });
        c.lastAct = t;
        break;
      }
    }
  }
  task() { if (!this.cur) return null; const { lastAct, ...task } = this.cur; return task; }
}

// Reads the zstd frames appended since last time. A frame still being written is left for the next look. (The 4-byte frame marker can also turn up inside compressed data, so a piece that fails
// is joined with the next one before giving up.)
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
export function unframe(buf) {
  const starts = []; for (let i = buf.indexOf(MAGIC); i >= 0; i = buf.indexOf(MAGIC, i + 1)) starts.push(i);
  if (starts[0] !== 0) return { lines: [], used: 0 };
  const lines = []; let used = 0, k = 0;
  while (k < starts.length) {
    let j = k + 1, text = null;
    for (; j <= starts.length; j++) {
      // a cut-off frame does not throw, it gives nothing or a part; every whole frame ends with a line break
      try { const s = zlib.zstdDecompressSync(buf.subarray(starts[k], j < starts.length ? starts[j] : buf.length)).toString('utf8'); if (s.endsWith('\n')) { text = s; break; } } catch {}
      if (j - k > 8) break;
    }
    if (text === null) break; // incomplete: wait for the rest
    for (const l of text.split('\n')) if (l.trim()) lines.push(l);
    used = j < starts.length ? starts[j] : buf.length; k = j;
  }
  return { lines, used };
}

class ZTail {
  constructor(file, stream) { this.file = file; this.stream = stream; this.pos = 0; this.mtime = 0; }
  read() {
    let st; try { st = fs.statSync(this.file); } catch { return false; }
    if (st.size < this.pos) { this.pos = 0; return 'reset'; }
    if (st.size === this.pos && st.mtimeMs === this.mtime) return false;
    this.mtime = st.mtimeMs;
    if (st.size === this.pos) return false;
    let buf; try { const fd = fs.openSync(this.file, 'r'); buf = Buffer.alloc(st.size - this.pos); fs.readSync(fd, buf, 0, buf.length, this.pos); fs.closeSync(fd); } catch { return false; }
    const { lines, used } = unframe(buf);
    this.pos += used;
    for (const l of lines) this.stream.line(l);
    return lines.length > 0;
  }
}

export class DeepseekLive {
  constructor(home, opts = {}) { this.root = path.join(home, 'sessions'); this.hours = opts.hours || 12; this.files = new Map(); this.lastScan = 0; }
  static home() { return path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh'); }
  scan() {
    if (!supported) { this.lastScan = Date.now(); return; }
    const cutoff = Date.now() - this.hours * 3600e3;
    let spaces = []; try { spaces = fs.readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { this.lastScan = Date.now(); return; }
    for (const w of spaces) {
      let sessions = []; try { sessions = fs.readdirSync(path.join(this.root, w.name), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('session-')); } catch { continue; }
      for (const s of sessions) {
        const file = path.join(this.root, w.name, s.name, 'session.v4.jsonl.zstd');
        if (this.files.has(file)) continue;
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        const stream = new DeepseekStream();
        this.files.set(file, { file, stream, tail: new ZTail(file, stream) });
      }
    }
    for (const [f, x] of this.files) if (x.tail.mtime && x.tail.mtime < cutoff) this.files.delete(f);
    this.lastScan = Date.now();
  }
  poll() {
    let changed = false;
    if (Date.now() - this.lastScan > 10000) this.scan();
    for (const x of this.files.values()) {
      let r = x.tail.read();
      if (r === 'reset') { x.stream = new DeepseekStream(); x.tail.stream = x.stream; r = x.tail.read(); changed = true; } // rewritten: start over
      if (r) changed = true;
    }
    return changed;
  }
  snapshot() {
    const out = [];
    for (const x of this.files.values()) {
      const s = x.stream, task = s.task();
      if (!task || !s.meta || s.meta.delegationDepth > 0) continue; // subagents are part of another session
      const id = 'ds:' + String(s.meta.id || path.basename(path.dirname(x.file))).replace(/^session-/, '');
      const title = s.title ? cut(s.title, 60) : null;
      out.push({ id, src: 'deepseek', title, last: s.last || task.t0, task: { ...task, title, src: 'deepseek' } });
    }
    return out.sort((a, b) => b.last - a.last);
  }
}
