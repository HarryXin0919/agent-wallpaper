// Read Gemini CLI sessions (read-only) into the same timeline as the other assistants.
// Gemini CLI records each session as JSON Lines under ~/.gemini/tmp/<project>/chats/session-*.jsonl: a metadata
// line, one line per message (a message written again replaces the earlier one), and change records:
// {"$set": …} for metadata, {"$patch": …} to fill in tool results, {"$rewindTo": id} to drop later messages.
import fs from 'node:fs';
import path from 'node:path';
import { Tail } from './live.mjs';
import { cmdLabel } from './codex.mjs';

const ts = (s) => (s ? Date.parse(s) : NaN);
const cut = (v, n) => { v = String(v || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const fname = (p) => String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
const LONG_CMD = /\b(npm|pnpm|yarn|npx|node|python|pytest|pip|cargo|go|make|build|test|install|ffmpeg|sleep|docker|git\s+(push|clone|fetch|pull)|curl|wget)\b/i;
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('') : c && c.text) || '';

// one tool call in the shape the picture reads
function fromTool(tc) {
  const n = String(tc.name || ''), a = tc.args || {};
  const file = a.file_path || a.absolute_path || a.path || '';
  if (/^read_file$/.test(n)) return { kind: 'read', target: file, op: `读取 ${fname(file)}` };
  if (/^read_many_files$/.test(n)) return { kind: 'read', op: `读取 ${cut((a.paths || [])[0] || '', 20)} 等文件` };
  if (/^(write_file)$/.test(n)) return { kind: 'edit', target: file, files: [file], op: `写入 ${fname(file)}`, plus: String(a.content || '').split('\n').length };
  if (/^(replace|edit)$/.test(n)) return { kind: 'edit', target: file, files: [file], op: `修改 ${fname(file)}`, plus: String(a.new_string || '').split('\n').length, minus: String(a.old_string || '').split('\n').length };
  if (/shell/.test(n)) { const c = a.command || ''; return { kind: 'run', shell: true, long: LONG_CMD.test(c), op: a.description ? `运行：${cut(a.description, 34)}` : `运行：${cut(cmdLabel(c), 34)}` }; }
  if (/^(glob)$/.test(n)) return { kind: 'search', op: `查找文件 ${cut(a.pattern, 24)}` };
  if (/grep|search_file_content/.test(n)) return { kind: 'search', target: a.pattern, op: `搜索“${cut(a.pattern, 24)}”` };
  if (/list_directory|^ls$/.test(n)) return { kind: 'search', op: '查看文件夹' };
  if (/web_search/.test(n)) return { kind: 'web', op: `上网搜索“${cut(a.query, 26)}”` };
  if (/web_fetch/.test(n)) return { kind: 'web', op: '打开网页' };
  if (/todo/.test(n)) return { kind: 'plan', op: '更新任务清单' };
  return { kind: 'other', op: `调用 ${cut(tc.displayName || n, 28)}` };
}
const DONE = /^(success|error|cancelled|canceled|completed)$/i;
const planOf = (todos) => (Array.isArray(todos) && todos.length ? todos.map((t) => ({ text: t.description || t.content || t.text, status: /complete|done/i.test(t.status) ? 'completed' : /progress/i.test(t.status) ? 'in_progress' : 'pending' })) : null);

export class GeminiStream {
  constructor() { this.meta = null; this.msgs = new Map(); this.order = []; this.last = 0; }
  line(s) { if (!s) return; let d; try { d = JSON.parse(s); } catch { return; } this.feed(d); }
  feed(d) {
    if (d.$set) { this.meta = { ...(this.meta || {}), ...d.$set }; return; }
    if (d.$rewindTo) { const i = this.order.indexOf(d.$rewindTo); if (i >= 0) { for (const id of this.order.slice(i)) this.msgs.delete(id); this.order = this.order.slice(0, i); } return; }
    if (d.$patch) {
      const p = d.$patch;
      for (const id of p.removeIds || []) { this.msgs.delete(id); this.order = this.order.filter((x) => x !== id); }
      for (const u of [p, ...(p.updates || [])]) {
        const m = u && u.id && this.msgs.get(u.id);
        if (!m) continue;
        if (u.content !== undefined) m.content = u.content;
        for (const tp of u.toolCalls || []) { const tc = (m.toolCalls || []).find((x) => x.id === tp.id); if (tc) Object.assign(tc, tp); }
      }
      if (Array.isArray(p.orderIds)) this.order = p.orderIds.filter((id) => this.msgs.has(id));
      return;
    }
    if (d.sessionId && !d.type) { this.meta = { ...(this.meta || {}), ...d }; return; }
    if (d.id && d.type) {
      if (!this.msgs.has(d.id)) this.order.push(d.id);
      this.msgs.set(d.id, d);
      const t = ts(d.timestamp); if (t > this.last) this.last = t;
    }
  }
  // the latest request and everything after it, as timeline events
  task() {
    const list = this.order.map((id) => this.msgs.get(id)).filter(Boolean);
    let p = -1; list.forEach((m, i) => { if (m.type === 'user' && textOf(m.content).trim() && !textOf(m.content).trim().startsWith('/')) p = i; });
    if (p < 0) return null;
    const ev = [], tok = { in: 0, out: 0, cr: 0, cc: 0, total: 0 }, rate = [], since = Date.now() - 15 * 60e3;
    let lastAct = ts(list[p].timestamp), plan = null;
    for (const m of list.slice(p + 1)) {
      const t = ts(m.timestamp);
      if (m.type !== 'gemini') { if (m.type === 'error') ev.push({ t, k: 'retry' }); continue; }
      for (const th of m.thoughts || []) { const tt = ts(th.timestamp) || t; ev.push({ t: lastAct, k: 'think', dur: Math.max(0, tt - lastAct) }); lastAct = tt; }
      for (const tc of m.toolCalls || []) {
        const t0 = ts(tc.timestamp) || t;
        const e = { t: t0, k: 'tool', id: tc.id, name: tc.name, ...fromTool(tc) };
        if (DONE.test(tc.status || '')) { e.tEnd = t0 + 500; if (/error/i.test(tc.status)) e.err = '出错'; }
        else if (/approval|confirm/i.test(tc.status || '')) e.awaiting = true; // Gemini CLI asks before running this one
        if (e.kind === 'plan') { const pl = planOf(tc.args && tc.args.todos); if (pl) { plan = pl; e.plan = pl; } }
        ev.push(e); lastAct = Math.max(lastAct, t0);
      }
      const say = textOf(m.content).trim();
      if (say) { ev.push({ t, k: 'say', text: say.slice(0, 400) }); lastAct = t; }
      if (m.tokens) {
        const n = { in: Math.max(0, (m.tokens.input || 0) - (m.tokens.cached || 0)), cr: m.tokens.cached || 0, cc: 0, out: (m.tokens.output || 0) + (m.tokens.thoughts || 0) };
        tok.in += n.in; tok.cr += n.cr; tok.out += n.out; const tot = m.tokens.total || n.in + n.cr + n.out; tok.total += tot;
        if (t >= since) rate.push([t, tot, n.out]);
      }
    }
    // no record marks the end of a turn: a reply with nothing left running counts as the end
    const lastMsg = list[list.length - 1];
    const pending = ev.some((e) => e.k === 'tool' && !e.tEnd);
    if (lastMsg && lastMsg.type === 'gemini' && textOf(lastMsg.content).trim() && !pending) ev.push({ t: ts(lastMsg.timestamp), k: 'stop' });
    return { prompt: textOf(list[p].content).trim().slice(0, 600), t0: ts(list[p].timestamp), ev, tok, rate, plan };
  }
}

export class GeminiLive {
  constructor(home, opts = {}) { this.root = path.join(home, 'tmp'); this.hours = opts.hours || 12; this.files = new Map(); this.lastScan = 0; }
  scan() {
    const cutoff = Date.now() - this.hours * 3600e3;
    let projects = []; try { projects = fs.readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { this.lastScan = Date.now(); return; }
    for (const p of projects) {
      const dir = path.join(this.root, p.name, 'chats');
      let names = []; try { names = fs.readdirSync(dir).filter((f) => /^session-.*\.jsonl$/.test(f)); } catch { continue; }
      for (const f of names) {
        const file = path.join(dir, f);
        if (this.files.has(file)) continue;
        let st; try { st = fs.statSync(file); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        const x = { file, stream: new GeminiStream() };
        // a session file is small; it is read whole, and again if Gemini rewrites it
        x.tail = new Tail(file, x.stream);
        x.tail.window = 64 * 1024 * 1024;
        this.files.set(file, x);
      }
    }
    for (const [f, x] of this.files) if (x.tail.mtime && x.tail.mtime < cutoff) this.files.delete(f);
    this.lastScan = Date.now();
  }
  poll() {
    let changed = false;
    if (Date.now() - this.lastScan > 10000) this.scan();
    for (const x of this.files.values()) {
      const before = x.tail.pos, size = (() => { try { return fs.statSync(x.file).size; } catch { return -1; } })();
      if (size >= 0 && size < before) { x.stream = new GeminiStream(); x.tail.stream = x.stream; } // rewritten: start over
      if (x.tail.read()) changed = true;
    }
    return changed;
  }
  snapshot() {
    const out = [];
    for (const x of this.files.values()) {
      const s = x.stream, task = s.task();
      if (!task || !s.meta || s.meta.kind === 'subagent') continue;
      const id = 'gm:' + (s.meta.sessionId || path.basename(x.file));
      const title = s.meta.summary ? cut(s.meta.summary, 60) : null;
      out.push({ id, src: 'gemini', title, last: s.last || task.t0, task: { ...task, title, src: 'gemini' } });
    }
    return out.sort((a, b) => b.last - a.last);
  }
}
