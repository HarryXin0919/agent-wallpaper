// Read Codex logs (read-only) into the same timeline the Claude logs give, so both draw the same way.
// A Codex thread is one rollout file under ~/.codex/sessions/YYYY/MM/DD/, one JSON record per line.
// Long-lived threads keep writing to the file of the day they started, so files are found by when they changed.
import fs from 'node:fs';
import path from 'node:path';
import { Tail } from './live.mjs';

const ts = (s) => (s ? Date.parse(s) : NaN);
const cut = (v, n) => { v = String(v || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const fname = (p) => String(p || '').replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
const LONG_CMD = /\b(npm|pnpm|yarn|npx|node|python|py|pytest|pip|cargo|go|make|build|test|install|render|ffmpeg|Start-Sleep|sleep|vercel|deploy|playwright|electron|docker|wsl|git\s+(push|clone|fetch|pull)|curl|wget|Invoke-WebRequest)\b/i;
const FILE_RE = /(?:[A-Za-z]:)?[\w.\-\/\\~]*[\w\-]+\.(?:m?js|cjs|ts|tsx|jsx|py|json|jsonl|md|html|css|txt|ps1|sh|cmd|yml|yaml|toml|svg|png|jpe?g|webp|mp4|csv|xml|ini|docx|pdf|go|rs|c|h|cpp|java|cs|lua|sql)\b/g;
const filesIn = (s) => { const out = []; for (const m of String(s || '').matchAll(FILE_RE)) { const f = m[0].replace(/\\/g, '/'); if (!/^\d|\*\.|node_modules/.test(f) && !out.includes(f)) out.push(f); if (out.length >= 4) break; } return out; };

// a JS string literal right after `key:` in the code Codex runs (its tools are called from a small script)
function strArg(code, key) {
  const m = String(code).match(new RegExp(key + '\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)'));
  if (!m) return null;
  const q = m[1];
  if (q[0] === '"') { try { return JSON.parse(q); } catch {} }
  return q.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
}

// The statement of a script that says what it does: setup lines ($x = 'value') are skipped, an assignment from a
// command keeps the command, and long program paths shrink to the program's name (python, node, pwsh).
function cmdLabel(c) {
  const short = (s) => s
    .replace(/^&\s*/, '')
    .replace(/(["'])([A-Za-z]:[\\/][^"']*?[\\/])?([^\\/"']+?)(\.exe)?\1/g, (m, q, dir, base, exe) => (dir || exe ? base : m))
    .replace(/[A-Za-z]:[\\/](?:[^\\/\s"']+[\\/])+([^\\/\s"']+)/g, '$1');
  const parts = String(c).split(/\r?\n|;\s*/).map((s) => s.trim()).filter((s) => s && !/^(#|\$ErrorActionPreference|Set-StrictMode|\$ProgressPreference|\[Console\]|chcp)/i.test(s));
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    // a here-string (@' … '@ | python -) is a script fed to a program: name the program
    if (/^@['"]$/.test(s)) { const end = parts.slice(i + 1).find((x) => /^['"]@\s*\|/.test(x)); return end ? '脚本 → ' + short(end.replace(/^['"]@\s*\|\s*/, '')) : '一段脚本'; }
    const m = s.match(/^\$[\w:]+\s*=\s*(.*)$/);
    if (!m) return short(s);
    if (/^(&|Get-|Select-|Set-|New-|Remove-|Copy-|Move-|Invoke-|Test-|Start-|git|node|python|npm|rg)\b/i.test(m[1])) return short(m[1]);
  }
  return short(parts[0] || c);
}

// A shell command, sorted the same way as Claude's: what it means on the picture, and a short label
function fromCommand(cmd) {
  const c = String(cmd || '').trim();
  const files = filesIn(c);
  const long = LONG_CMD.test(c);
  const first = cmdLabel(c);
  if (/^(rg|grep|Select-String|findstr|git\s+grep)\b/i.test(first)) return { kind: 'search', files, target: files[0] || null, shell: true, long, op: `搜索：${cut(first.replace(/^\S+\s+/, ''), 30)}` };
  if (/^(Get-Content|cat|type|gc|head|tail|sed\s+-n)\b/i.test(first) && files.length) return { kind: 'read', files, target: files[0], shell: true, long, op: `读取 ${fname(files[0])}` };
  if (/^(Get-ChildItem|ls|dir|gci|tree)\b/i.test(first)) return { kind: 'search', files, shell: true, long, op: '查看文件夹' };
  if (/^git\s+(status|diff|log|show)\b/i.test(first)) return { kind: 'read', files, shell: true, long, op: `运行：${cut(first, 34)}` };
  return { kind: 'run', files, shell: true, long, op: `运行：${cut(first, 34)}` };
}

// What one tool call is, from the call itself (refined later by the finished item, which says what really ran)
function fromCall(name, input, ns) {
  if (name === 'exec') {
    const code = String(input || '');
    if (/tools\.apply_patch/.test(code)) {
      const files = [...code.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\\\n]+)/g)].map((m) => m[1].trim());
      const add = /\*\*\* Add File/.test(code) && !/\*\*\* Update File/.test(code);
      return { kind: 'edit', files, target: files[0], op: `${add ? '写入' : '修改'} ${fname(files[0])}${files.length > 1 ? ` 等 ${files.length} 个文件` : ''}` };
    }
    if (/tools\.exec_command/.test(code)) return fromCommand(strArg(code, 'cmd'));
    if (/tools\.view_image/.test(code)) { const p = strArg(code, 'path'); return { kind: 'read', target: p, op: `查看图片 ${fname(p)}` }; }
    if (/tools\.web__/.test(code)) return { kind: 'web', op: '上网查资料' };
    if (/tools\.write_stdin/.test(code)) return { kind: 'run', shell: true, long: true, op: '运行：给正在运行的命令输入' };
    const m = code.match(/tools\.(?:mcp__)?([a-z0-9_]+?)__([a-z0-9_]+)/i);
    if (m) return { kind: 'other', op: `调用 ${cut(m[2], 28)}` };
    return { kind: 'run', op: '运行脚本' };
  }
  let a = {}; try { a = typeof input === 'string' ? JSON.parse(input) : input || {}; } catch {}
  if (name === 'spawn_agent' || name === 'followup_task') return { kind: 'agent', target: a.agent_name || a.name, op: `派出子代理：${cut(a.agent_name || a.name || a.message || a.task || '', 26)}` };
  if (/^(wait_agent|list_agents|send_message)$/.test(name)) return { kind: 'agent', op: name === 'wait_agent' ? '等子代理做完' : name === 'send_message' ? '给子代理发消息' : '查看子代理' };
  if (/request_user_input/.test(name)) return { kind: 'ask', target: a.question || a.prompt || '', op: `问你：${cut(a.question || a.prompt || '', 30)}` };
  if (name === 'js' && /cua/.test(ns || '')) return { kind: 'other', op: `操作电脑：${cut(a.title || '', 26)}`, long: true };
  if (name === 'update_plan') return { kind: 'plan', op: '更新任务清单' };
  return { kind: 'other', op: `调用 ${cut(name, 28)}` };
}

// Codex's plan tool (update_plan with {plan:[{step,status}]}) in the shape the picture reads
const planOf = (a) => (Array.isArray(a.plan) ? a.plan.map((i) => ({ text: i.step, status: i.status })) : null);

// lines a unified diff adds and removes
function diffCount(d) { let p = 0, m = 0; for (const l of String(d || '').split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) p++; else if (l.startsWith('-') && !l.startsWith('---')) m++; } return [p, m]; }

// the request as the person typed it (pasted blocks keep their text; scheduled runs get a plain name)
function promptOf(text) {
  let t = String(text || '');
  const hb = t.match(/<heartbeat>[\s\S]*?<automation_id>([^<]+)<\/automation_id>/);
  if (hb) return { text: `定时任务：${hb[1].trim()}`, auto: true };
  // attached files come first, then "## My request:" with what was typed
  const req = t.match(/##\s*My request(?: for Codex)?:\s*([\s\S]*)$/);
  if (req) t = req[1];
  t = t.replace(/<\/?pasted_content[^>]*>/g, '\n').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!t || /^<[a-z_-]+[\s>]/i.test(t)) return null; // app notices
  return { text: t.slice(0, 600) };
}

export class CodexStream {
  constructor() { this.ev = []; this.byCall = new Map(); this.open = null; this.title = null; this.mode = null; this.last = 0; this.plan = null; this.msgs = new Map(); this.lastAct = 0; this.rate = null; this.day = new Map(); this.meta = null; this.hidden = false; }
  line(s) { if (!s) return; let d; try { d = JSON.parse(s); } catch { return; } this.feed(d); }
  push(e) { this.ev.push(e); if (e.t > this.last) this.last = e.t; }
  act(t) { if (t > this.lastAct) this.lastAct = t; if (t > this.last) this.last = t; }
  feed(d) {
    const t = ts(d.timestamp), p = d.payload || {};
    if (d.type === 'session_meta') {
      this.meta = { id: p.id, cwd: p.cwd };
      // review helpers and subagents are part of another thread, not tasks of their own
      if (p.source && typeof p.source === 'object' && p.source.subagent) this.hidden = true;
      if (/guardian|subagent/.test(p.thread_source || '')) this.hidden = true;
      return;
    }
    if (d.type === 'turn_context' || (d.type === 'event_msg' && p.type === 'thread_settings_applied')) {
      const s = p.thread_settings || p;
      // reviews by Codex's own reviewer, or no approvals at all: it never stops to ask you
      if (s.approval_policy) this.mode = s.approval_policy === 'never' || s.approvals_reviewer === 'auto_review' ? 'bypassPermissions' : s.approval_policy;
      return;
    }
    if (d.type === 'token_usage_record' && p.usage) {
      const u = p.usage, cr = u.cached_input_tokens || 0, n = { t, in: Math.max(0, (u.input_tokens || 0) - cr), cr, cc: u.cache_write_input_tokens || 0, out: u.output_tokens || 0 };
      this.msgs.set(p.response_id || String(t), n);
      const day = new Date(t).toLocaleDateString('sv');
      const a = this.day.get(day) || { tok: 0, out: 0 };
      a.tok += u.total_tokens || n.in + n.cr + n.out; a.out += n.out; this.day.set(day, a);
      return;
    }
    if (d.type === 'event_msg') {
      if (p.type === 'token_count' && p.rate_limits) { this.rate = { ...p.rate_limits, t }; return; }
      if (String(p.turn_id || '').startsWith('external-import')) return; // a conversation copied in from elsewhere
      if (p.type === 'task_complete') { this.closeOpen(t); this.push({ t, k: 'stop' }); this.act(t); return; }
      if (p.type === 'turn_aborted') { this.closeOpen(t); this.push({ t, k: 'stop', interrupted: p.reason === 'interrupted' }); this.act(t); return; }
      if (p.type !== 'item_completed' || !p.item) return;
      const it = p.item, t0 = p.started_at_ms || t, t1 = p.completed_at_ms || t;
      switch (it.type) {
        case 'UserMessage': {
          const pr = promptOf((it.content || []).map((c) => c.text || '').join('\n'));
          if (!pr) return;
          this.ev = []; this.byCall.clear(); this.open = null; this.msgs = new Map(); this.plan = null;
          this.push({ t: t0, k: 'prompt', text: pr.text, auto: pr.auto });
          this.act(t0);
          return;
        }
        case 'AgentMessage': {
          const text = (it.content || []).map((c) => c.text || '').join(' ').trim();
          if (text && !/^<heartbeat>/.test(text)) this.push({ t: t1, k: 'say', text: text.slice(0, 400) });
          this.act(t1);
          return;
        }
        case 'CommandExecution': {
          const cmd = Array.isArray(it.command) ? it.command[it.command.length - 1] : it.command;
          const c = fromCommand((it.parsed_cmd && it.parsed_cmd[0] && it.parsed_cmd[0].cmd) || cmd);
          const failed = it.status === 'failed' || (it.exit_code != null && it.exit_code !== 0 && !(c.kind === 'search' && it.exit_code === 1));
          this.claim({ ...c, err: failed ? `退出码 ${it.exit_code}` : undefined }, t0, t1);
          return;
        }
        case 'FileChange': {
          const ch = it.changes || {}, files = Object.keys(ch);
          let plus = 0, minus = 0, add = files.length > 0;
          for (const f of files) { const [a, b] = diffCount(ch[f].unified_diff || ch[f].content); plus += a; minus += b; if (ch[f].type !== 'add') add = false; }
          const op = `${add ? '写入' : '修改'} ${fname(files[0])}${files.length > 1 ? ` 等 ${files.length} 个文件` : ''}`;
          this.claim({ kind: 'edit', files: files.map((f) => f.replace(/\\/g, '/')), target: files[0], op, plus, minus, err: it.status === 'failed' ? '没改成' : undefined }, t0, t1);
          return;
        }
        case 'McpToolCall': case 'DynamicToolCall':
          this.claim({ kind: 'other', op: `调用 ${cut(it.tool, 28)}`, err: it.status === 'failed' ? '出错' : undefined }, t0, t1);
          return;
        case 'ImageView':
          this.claim({ kind: 'read', target: it.path, op: `查看图片 ${fname(it.path)}` }, t0, t1);
          return;
      }
      return;
    }
    if (d.type === 'response_item') {
      if (String(p.internal_chat_message_metadata_passthrough?.turn_id || '').startsWith('external-import')) return;
      if (p.type === 'reasoning') {
        // the log keeps no thinking time; the quiet gap before this reasoning is the closest measure
        const dur = this.lastAct ? Math.max(0, Math.min(t - this.lastAct, 15 * 60e3)) : 0;
        this.push({ t: t - dur, k: 'think', dur });
        this.act(t);
        return;
      }
      if (p.type === 'custom_tool_call' || p.type === 'function_call') {
        const c = fromCall(p.name, p.type === 'custom_tool_call' ? p.input : p.arguments, p.namespace);
        const e = { t, k: 'tool', id: p.call_id, name: p.name, ...c };
        if (c.kind === 'plan') { let a = {}; try { a = JSON.parse(p.arguments || '{}'); } catch {} const pl = planOf(a); if (pl) { this.plan = pl; e.plan = pl; } }
        this.byCall.set(p.call_id, e);
        this.open = e;
        this.push(e);
        return;
      }
      if (p.type === 'custom_tool_call_output' || p.type === 'function_call_output') {
        const e = this.byCall.get(p.call_id);
        if (e && !e.tEnd) e.tEnd = t;
        if (this.open === e) this.open = null;
        this.act(t);
      }
    }
  }
  // a finished item fills in the call that ran it (the first item of a call), or stands on its own
  claim(c, t0, t1) {
    const e = this.open;
    if (e && !e.claimed && e.t <= t0 + 1000) {
      Object.assign(e, c, { claimed: true });
      if (e.kind !== 'edit') { delete e.plus; delete e.minus; }
      if (!e.tEnd || e.tEnd < t1) e.tEnd = t1;
    } else this.push({ t: t0, k: 'tool', name: 'item', ...c, tEnd: t1 });
    this.act(t1);
  }
  closeOpen(t) { for (const e of this.byCall.values()) if (!e.tEnd) e.tEnd = t; this.open = null; }
}

// thread names, as shown in the Codex app (the latest name of each thread wins)
function readIndex(file) {
  const m = new Map();
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return m; }
  for (const l of text.split('\n')) { if (!l) continue; try { const j = JSON.parse(l); if (j.id && j.thread_name) m.set(j.id, j.thread_name); } catch {} }
  return m;
}

export class CodexLive {
  constructor(home, opts = {}) {
    this.home = home; this.root = path.join(home, 'sessions');
    this.hours = opts.hours || 12;
    this.threads = new Map(); // file -> { file, stream, tail }
    this.lastScan = 0; this.names = new Map(); this.namesAt = 0;
  }
  scan() {
    const cutoff = Date.now() - this.hours * 3600e3;
    const walk = (d, depth) => {
      let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (depth < 3) walk(f, depth + 1); continue; }
        if (!/^rollout-.*\.jsonl$/.test(e.name) || this.threads.has(f)) continue;
        let st; try { st = fs.statSync(f); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        const stream = new CodexStream();
        // the first record says what kind of thread this is; read it even when only the tail is followed
        try { const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(Math.min(st.size, 256 * 1024)); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); stream.line(b.toString('utf8').split('\n')[0]); } catch {}
        this.threads.set(f, { file: f, stream, tail: new Tail(f, stream) });
      }
    };
    walk(this.root, 0);
    for (const [f, s] of this.threads) if (s.tail.mtime && s.tail.mtime < cutoff) this.threads.delete(f);
    try { const st = fs.statSync(path.join(this.home, 'session_index.jsonl')); if (st.mtimeMs !== this.namesAt) { this.names = readIndex(path.join(this.home, 'session_index.jsonl')); this.namesAt = st.mtimeMs; } } catch {}
    this.lastScan = Date.now();
  }
  poll() {
    let changed = false;
    if (Date.now() - this.lastScan > 10000) this.scan();
    for (const s of this.threads.values()) if (s.tail.read()) changed = true;
    return changed;
  }
  // newest quota reading across all threads (Codex writes it with every reply)
  rate() {
    let best = null;
    for (const s of this.threads.values()) if (s.stream.rate && (!best || s.stream.rate.t > best.t)) best = s.stream.rate;
    return best;
  }
  today() {
    const day = new Date().toLocaleDateString('sv'), r = { tok: 0, out: 0 };
    for (const s of this.threads.values()) { const a = s.stream.day.get(day); if (a) { r.tok += a.tok; r.out += a.out; } }
    return r;
  }
  snapshot() {
    const out = [];
    for (const s of this.threads.values()) {
      const st = s.stream, ev = st.ev;
      if (st.hidden || !ev.length || !st.meta) continue;
      const first = ev[0];
      if (first.k !== 'prompt') continue; // only tasks whose request we saw
      const title = this.names.get(st.meta.id) || null;
      const task = { prompt: first.text, t0: first.t, ev: ev.slice(1).map((e) => ({ ...e })).sort((a, b) => a.t - b.t), title, mode: st.mode, src: 'codex' };
      const tok = { in: 0, out: 0, cr: 0, cc: 0, total: 0 }, rate = [], since = Date.now() - 15 * 60e3;
      for (const m of st.msgs.values()) {
        tok.in += m.in; tok.out += m.out; tok.cr += m.cr; tok.cc += m.cc;
        const n = m.in + m.out + m.cr + m.cc; tok.total += n;
        if (m.t >= since) rate.push([m.t, n, m.out]);
      }
      task.tok = tok; task.rate = rate;
      out.push({ id: 'cx:' + st.meta.id, src: 'codex', title, last: st.last || first.t, task });
    }
    // one thread can be split across files (a continued thread); keep its newest
    const byId = new Map();
    for (const o of out) if (!byId.has(o.id) || byId.get(o.id).last < o.last) byId.set(o.id, o);
    return [...byId.values()].sort((a, b) => b.last - a.last);
  }
}
