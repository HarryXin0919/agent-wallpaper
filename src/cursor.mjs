// Read Cursor's agent conversations (read-only) into the same timeline as Claude Code and Codex.
// Cursor keeps them in its own SQLite database (globalStorage/state.vscdb, table cursorDiskKV): one composerData
// row per conversation with the order of its messages, and one bubbleId row per message or tool call.
// The per-message times in that database are not reliable, so actions are timed by when they are first seen
// (older ones are spread between the conversation's start and its last update).
import fs from 'node:fs';
import path from 'node:path';
import { cmdLabel } from './codex.mjs';

const cut = (v, n) => { v = String(v || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const fname = (p) => String(p || '').replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
const LONG_CMD = /\b(npm|pnpm|yarn|npx|node|python|py|pytest|pip|cargo|go|make|build|test|install|ffmpeg|sleep|docker|git\s+(push|clone|fetch|pull)|curl|wget)\b/i;
const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : s || {}; } catch { return {}; } };

// one tool call, sorted the same way as the other readers
function fromTool(tf) {
  const name = String(tf.name || ''), a = { ...parse(tf.rawArgs), ...parse(tf.params) };
  const file = a.targetFile || a.target_file || a.relativeWorkspacePath || a.path || a.file_path || '';
  if (/^read_file/.test(name)) return { kind: 'read', target: file, op: `读取 ${fname(file)}` };
  if (/ripgrep|grep|codebase_search|semantic_search/.test(name)) return { kind: 'search', target: a.pattern || a.query, op: `搜索“${cut(a.pattern || a.query, 24)}”` };
  if (/glob_file_search|file_search/.test(name)) return { kind: 'search', op: `查找文件 ${cut(a.globPattern || a.query || '', 24)}` };
  if (/list_dir/.test(name)) return { kind: 'search', op: '查看文件夹' };
  if (/^(edit_file|search_replace|apply_patch|write|create_file|delete_file|multi_edit)/.test(name)) return { kind: 'edit', target: file, files: file ? [String(file).replace(/\\/g, '/')] : [], op: `${/create|write/.test(name) ? '写入' : '修改'} ${fname(file)}` };
  if (/run_terminal/.test(name)) { const c = a.command || a.cmd || ''; return { kind: 'run', shell: true, long: LONG_CMD.test(c), op: c ? `运行：${cut(cmdLabel(c), 34)}` : '运行脚本' }; }
  if (name === 'await') return { kind: 'run', shell: true, long: true, op: '运行：等待命令完成' };
  if (/web_search|fetch|browser/.test(name)) return { kind: 'web', op: a.search_term || a.query ? `上网搜索“${cut(a.search_term || a.query, 26)}”` : '上网查资料' };
  if (/todo_write/.test(name)) return { kind: 'plan', op: '更新任务清单' };
  if (/^(task|subagent|spawn)/.test(name)) return { kind: 'agent', op: `派出子代理：${cut(a.description || a.prompt || '', 26)}` };
  if (/ask|question/.test(name)) return { kind: 'ask', op: `问你：${cut(a.question || '', 30)}` };
  return { kind: 'other', op: `调用 ${cut(name.replace(/^mcp-[^-]+-[^-]+-/, ''), 28)}` };
}
const planOf = (todos) => (Array.isArray(todos) && todos.length ? todos.map((t) => ({ text: t.content, status: t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'pending' })) : null);

export class CursorLive {
  constructor(dbPath, opts = {}) {
    this.db = dbPath; this.hours = opts.hours || 12;
    this.sql = null; this.key = ''; this.convs = new Map(); // composerId -> { meta, seen: Map(bubbleId -> {t, ev}), first }
    this.ok = null;
  }
  open() {
    if (this.sql) return true;
    try {
      // node:sqlite ships with the Node inside Electron; opened read-only, so Cursor's data is never changed
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      this.sql = new DatabaseSync(this.db, { readOnly: true });
      this.ok = true;
    } catch { this.ok = false; this.sql = null; }
    return !!this.sql;
  }
  close() { try { this.sql && this.sql.close(); } catch {} this.sql = null; }
  // the database changed? (Cursor writes to the main file and its -wal journal)
  changed() {
    let k = '';
    for (const f of [this.db, this.db + '-wal']) { try { const st = fs.statSync(f); k += st.mtimeMs + ':' + st.size + ';'; } catch {} }
    if (k === this.key) return false;
    this.key = k; return true;
  }
  poll() {
    if (!fs.existsSync(this.db) || !this.changed() || !this.open()) return false;
    const since = Date.now() - this.hours * 3600e3;
    let rows;
    try {
      rows = this.sql.prepare(`select substr(key, 14) id, json_extract(value, '$.lastUpdatedAt') u, json_extract(value, '$.createdAt') c, json_extract(value, '$.name') n,
        json_extract(value, '$.status') s, json_extract(value, '$.fullConversationHeadersOnly') h, json_extract(value, '$.todos') td
        from cursorDiskKV where key like 'composerData:%' and coalesce(json_extract(value, '$.lastUpdatedAt'), json_extract(value, '$.createdAt'), 0) > ?`).all(since);
    } catch { this.close(); return false; }
    const now = Date.now();
    let changed = false;
    const getBubble = this.sql.prepare('select value from cursorDiskKV where key = ?');
    for (const r of rows) {
      const heads = parse(r.h);
      if (!Array.isArray(heads) || !heads.length) continue;
      let c = this.convs.get(r.id);
      const first = !c;
      if (!c) { c = { seen: new Map() }; this.convs.set(r.id, c); }
      c.meta = { id: r.id, name: r.n, status: r.s, created: r.c || now, updated: r.u || r.c || now, plan: planOf(parse(r.td)) };
      heads.forEach((h, i) => {
        const prev = c.seen.get(h.bubbleId);
        if (prev && prev.final) return;
        let b; try { b = parse(getBubble.get(`bubbleId:${r.id}:${h.bubbleId}`)?.value); } catch { return; }
        // a new action: now; on first sight, spread the history between the start and the last update
        const t = prev ? prev.t : first ? c.meta.created + (c.meta.updated - c.meta.created) * (i / Math.max(1, heads.length - 1)) : now;
        const e = this.toEvent(b, h, t, now);
        c.seen.set(h.bubbleId, { t, ev: e, final: !e || e.k !== 'tool' || !!e.tEnd, i });
        changed = true;
      });
      c.order = heads.map((h) => h.bubbleId);
    }
    return changed;
  }
  toEvent(b, h, t, now) {
    if (!b || !b.type) return null;
    if (b.type === 1) return b.text ? { t, k: 'prompt', text: String(b.text).slice(0, 600) } : null;
    const tf = b.toolFormerData;
    if (tf && tf.name) {
      const e = { t, k: 'tool', id: tf.toolCallId, name: tf.name, ...fromTool(tf) };
      if (tf.status === 'completed') e.tEnd = t + 500;
      else if (tf.status === 'error' || tf.status === 'cancelled') { e.tEnd = t + 500; e.err = tf.status === 'error' ? '出错' : undefined; }
      if (e.kind === 'plan') { const p = planOf(parse(tf.params).todos || parse(tf.rawArgs).todos); if (p) e.plan = p; }
      return e;
    }
    const dur = (h && h.grouping && h.grouping.thinkingDurationMs) || b.thinkingDurationMs || 0;
    if (b.thinking || dur) return { t: t - dur, k: 'think', dur };
    if (b.text && String(b.text).trim()) return { t, k: 'say', text: String(b.text).trim().slice(0, 400) };
    return null;
  }
  snapshot() {
    const out = [];
    for (const [id, c] of this.convs) {
      const ev = (c.order || []).map((b) => c.seen.get(b)).filter((x) => x && x.ev).map((x) => x.ev);
      let p = -1; ev.forEach((e, i) => { if (e.k === 'prompt') p = i; });
      if (p < 0) continue;
      const task = { prompt: ev[p].text, t0: ev[p].t, ev: ev.slice(p + 1).map((e) => ({ ...e })), title: c.meta.name || null, src: 'cursor' };
      // finished: Cursor marks the conversation done and nothing is still generating
      if (c.meta.status !== 'generating') { const last = task.ev.length ? Math.max(...task.ev.map((e) => e.tEnd || e.t)) : task.t0; task.ev.push({ t: last, k: 'stop' }); }
      out.push({ id: 'cu:' + id, src: 'cursor', title: task.title, last: c.meta.updated, task });
    }
    return out.sort((a, b) => b.last - a.last);
  }
  // for the settings window
  static find() {
    const p = path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    return fs.existsSync(p) ? p : null;
  }
}
