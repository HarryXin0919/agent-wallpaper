// Read Claude Code session logs (read-only) and turn them into a timeline the wallpaper can draw.
// A session file is one JSON record per line; subagents live in <session>/subagents/agent-*.jsonl.
import fs from 'node:fs';
import path from 'node:path';

const ts = (s) => (s ? Date.parse(s) : NaN);

// Is this user record a real request typed by the person (not a tool result or an app notice)?
export function promptText(rec) {
  if (rec.type !== 'user' || rec.isMeta || rec.isSidechain) return null;
  const c = rec.message?.content;
  let t;
  if (typeof c === 'string') t = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b.type === 'tool_result')) return null;
    t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  } else return null;
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!t || t.startsWith('<')) return null; // app events (<side-sessions-event>, <task-notification>, ...)
  if (/^This session is being continued from a previous conversation/.test(t)) return null;
  if (/^\[Request interrupted/.test(t)) return null;
  return t;
}
const interrupted = (rec) => rec.type === 'user' && JSON.stringify(rec.message?.content || '').includes('[Request interrupted');

const FILE_RE = /(?:[A-Za-z]:)?[\w.\-\/\\~]*[\w\-]+\.(?:m?js|cjs|ts|tsx|jsx|py|json|jsonl|md|html|css|txt|ps1|sh|cmd|yml|yaml|toml|svg|png|jpe?g|webp|mp4|csv|xml|ini|conf|service|go|rs|c|h|cpp|java|cs|lua|sql)\b/g;
function filesIn(cmd) {
  const out = [];
  for (const m of String(cmd || '').matchAll(FILE_RE)) {
    const f = m[0].replace(/\\/g, '/');
    if (/^\d|\*\.|node_modules/.test(f)) continue;
    if (!out.includes(f)) out.push(f);
    if (out.length >= 4) break;
  }
  return out;
}
// first URL in a command that is not the local proxy
const urlIn = (s) => (String(s || '').match(/https?:\/\/[^\s'"`)]+/g) || []).find((u) => !/^https?:\/\/127\.0\.0\.1:78\d\d/.test(u));
const LONG_CMD = /\b(npm|pnpm|yarn|npx|node|python|py|pytest|pip|cargo|go|make|cmake|msbuild|dotnet|gradle|mvn|build|test|install|render|ffmpeg|sleep|vercel|deploy|playwright|electron|docker|wsl|git\s+(push|clone|fetch|pull)|curl|wget|until|while)\b/i;

// Sort a tool call into what it means on the picture.
export function classify(name, input = {}) {
  const n = name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
  if (/^(Read|NotebookRead)$/.test(name)) return { kind: 'read', target: input.file_path || input.notebook_path };
  if (/^(Grep|Glob)$/.test(name)) return { kind: 'search', target: input.pattern, scope: input.path };
  if (/^(WebSearch)$/.test(name)) return { kind: 'web', target: input.query };
  if (/^(WebFetch)$/.test(name)) return { kind: 'web', target: input.url };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) return { kind: 'edit', target: input.file_path || input.notebook_path };
  if (/^(Agent|Task)$/.test(name)) return { kind: 'agent', target: input.description || input.subagent_type };
  if (/^(AskUserQuestion|ExitPlanMode)$/.test(name)) return { kind: 'ask', target: input.questions?.[0]?.question };
  if (/update_plan$|^TodoWrite$/.test(name)) return { kind: 'plan' };
  if (/wrap_up$/.test(name)) return { kind: 'wrap', ask: !!input.ask, target: input.ask || null };
  if (/start_session$|hand_off_to_session$/.test(name)) return { kind: 'session', target: input.title };
  if (/Claude_Browser__|claude-in-chrome__/.test(name)) {
    const u = input.url || (input.actions || []).map((a) => a.input?.url).find(Boolean);
    return { kind: 'web', target: u || null, browser: true };
  }
  if (/^(Bash|PowerShell)$/.test(name)) {
    const cmd = input.command || '';
    const desc = input.description || '';
    const files = filesIn(cmd);
    const url = urlIn(cmd);
    const long = !!input.run_in_background || LONG_CMD.test(cmd);
    if (url && /curl|wget|Invoke-WebRequest|fetch/.test(cmd)) return { kind: 'web', target: url, label: desc, shell: true, long };
    if (/^(read|show|inspect|view|print|dump|open|cat|check|review|diff|compare|trace|count|survey|look at)\b/i.test(desc)) return { kind: 'read', target: files[0] || null, files, label: desc, shell: true, long };
    if (/^(search|find|grep|locate|list|scan|look for|rank)\b/i.test(desc)) return { kind: 'search', target: files[0] || null, files, label: desc, shell: true, long };
    return { kind: 'run', label: desc, files, shell: true, long };
  }
  return { kind: 'other', target: n };
}

// What the step is, in a few plain words (for the activity list). Built only from the call itself.
const cut = (v, n) => { v = String(v || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
const fname = (p) => String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
const nlines = (v) => (v ? String(v).split('\n').length : 0);
const host = (u) => (String(u || '').match(/^https?:\/\/([^/?#]+)/) || [])[1] || cut(u, 30);
export function opOf(name, input = {}) {
  const tool = name.replace(/^mcp__.*?__/, '');
  switch (name) {
    case 'Read': case 'NotebookRead': return { op: `读取 ${fname(input.file_path || input.notebook_path)}` };
    case 'Grep': return { op: `搜索“${cut(input.pattern, 24)}”` };
    case 'Glob': return { op: `查找文件 ${cut(input.pattern, 24)}` };
    case 'WebSearch': return { op: `上网搜索“${cut(input.query, 26)}”` };
    case 'WebFetch': return { op: `打开网页 ${host(input.url)}` };
    case 'Edit': return { op: `修改 ${fname(input.file_path)}`, plus: nlines(input.new_string), minus: nlines(input.old_string) };
    case 'MultiEdit': {
      const es = input.edits || [];
      return { op: `修改 ${fname(input.file_path)}`, plus: es.reduce((a, e) => a + nlines(e.new_string), 0), minus: es.reduce((a, e) => a + nlines(e.old_string), 0) };
    }
    case 'Write': return { op: `写入 ${fname(input.file_path)}`, plus: nlines(input.content) };
    case 'NotebookEdit': return { op: `修改 ${fname(input.notebook_path)}` };
    case 'Bash': case 'PowerShell':
      return { op: input.description ? `运行：${cut(input.description, 34)}` : `运行 ${cut(input.command, 30)}` };
    case 'Agent': case 'Task': return { op: `派出子代理：${cut(input.description || input.subagent_type, 26)}` };
    case 'AskUserQuestion': return { op: `问你：${cut(input.questions?.[0]?.question, 30)}` };
    case 'ExitPlanMode': return { op: '把计划交给你确认' };
    case 'TodoWrite': return { op: '更新任务清单' };
    case 'Skill': return { op: `使用技能 ${cut(input.skill, 24)}` };
    case 'ToolSearch': return { op: '加载工具' };
    case 'SendMessage': return { op: '给另一个会话发消息' };
    case 'Artifact': return { op: input.action && input.action !== 'publish' ? `页面：${input.action}` : '发布页面' };
  }
  if (/update_plan$/.test(name)) return { op: '更新任务清单' };
  if (/wrap_up$/.test(name)) return { op: '收尾总结' };
  if (/start_session$/.test(name)) return { op: `开新会话：${cut(input.title, 24)}` };
  if (/Claude_Browser__|claude-in-chrome__/.test(name)) {
    if (/navigate|preview_start/.test(tool)) return { op: `浏览器打开 ${host(input.url) || cut(input.name, 20)}` };
    if (/screenshot/.test(tool) || input.action === 'screenshot') return { op: '浏览器截图' };
    if (/read_page|get_page_text|find/.test(tool)) return { op: '读网页内容' };
    if (/javascript/.test(tool)) return { op: '在网页里运行脚本' };
    return { op: '操作网页' };
  }
  return { op: `调用 ${cut(tool, 28)}` };
}

// Claude's own task list, followed through every update (full lists, "advance", "done", "start").
function nextPlan(plan, name, input) {
  let p = plan ? plan.map((i) => ({ ...i })) : [];
  if (name === 'TodoWrite') return (input.todos || []).map((i) => ({ text: i.content, active: i.activeForm, status: i.status }));
  if (/wrap_up$/.test(name)) { p.forEach((i) => { if (i.status === 'in_progress') i.status = 'completed'; }); return p; }
  if (Array.isArray(input.items)) p = input.items.map((i) => ({ text: i.content, status: i.status }));
  if (input.advance) {
    const i = p.findIndex((x) => x.status === 'in_progress');
    if (i >= 0) p[i].status = 'completed';
    const j = p.findIndex((x, k) => k > i && x.status === 'pending');
    if (j >= 0) p[j].status = 'in_progress';
  }
  for (const n of input.done || []) if (p[n - 1]) p[n - 1].status = 'completed';
  if (input.start && p[input.start - 1]) p[input.start - 1].status = 'in_progress';
  return p;
}

function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b) => b.text || '').join(' ');
  return '';
}

// Feeds on log records one at a time and keeps only the latest task (bounded memory for live use).
export class Stream {
  constructor(keepAll = false) { this.keepAll = keepAll; this.ev = []; this.byTool = new Map(); this.title = null; this.mode = null; this.last = 0; this.plan = null; this.msgs = new Map(); }
  line(s) { if (!s) return; let d; try { d = JSON.parse(s); } catch { return; } this.feed(d); }
  push(e) { this.ev.push(e); if (e.t > this.last) this.last = e.t; }
  feed(d) {
    if (d.type === 'custom-title' || d.type === 'agent-name') { this.title = d.customTitle || d.agentName || this.title; return; }
    const t = ts(d.timestamp);
    if (d.permissionMode) this.mode = d.permissionMode;
    if (d.type === 'user') {
      const p = promptText(d);
      if (p) {
        if (!this.keepAll) { this.ev = []; this.byTool.clear(); this.msgs = new Map(); }
        this.push({ t, k: 'prompt', text: p.slice(0, 600) });
        return;
      }
      if (interrupted(d)) { this.push({ t, k: 'stop', interrupted: true }); }
      const c = d.message?.content;
      if (Array.isArray(c)) for (const b of c) {
        if (b.type !== 'tool_result') continue;
        const call = this.byTool.get(b.tool_use_id);
        if (call) { call.tEnd = t; if (b.is_error) call.err = textOf(b.content).slice(0, 160); }
        if (t > this.last) this.last = t;
      }
      return;
    }
    if (d.type === 'assistant') {
      // token use: every block of one reply repeats the same counts, so keep one entry per reply (latest wins)
      const u = d.message?.usage;
      if (u && d.message.id) this.msgs.set(d.message.id, { t, in: u.input_tokens || 0, cc: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0 });
      for (const b of d.message?.content || []) {
        if (b.type === 'thinking') {
          const dur = d.thinkingDurationMs || 0;
          this.push({ t: t - dur, k: 'think', dur });
          if (t > this.last) this.last = t;
        } else if (b.type === 'text' && b.text.trim()) {
          this.push({ t, k: 'say', text: b.text.trim().slice(0, 400) });
        } else if (b.type === 'tool_use') {
          const c = classify(b.name, b.input || {});
          const e = { t, k: 'tool', id: b.id, name: b.name, ...c, ...opOf(b.name, b.input || {}) };
          if (c.kind === 'plan' || (c.kind === 'wrap' && this.plan)) { this.plan = nextPlan(this.plan, b.name, b.input || {}); e.plan = this.plan; }
          this.byTool.set(b.id, e);
          this.push(e);
        }
      }
      if (d.message?.stop_reason === 'end_turn') this.push({ t, k: 'stop' });
      return;
    }
    if (d.type === 'system') {
      if (d.subtype === 'stop_hook_summary') this.push({ t, k: 'stop' });
      else if (d.subtype === 'api_error') this.push({ t, k: 'retry' });
    }
  }
}

// Whole-file helpers (used by the still-frame tool).
export function parseFile(file) {
  const s = new Stream(true);
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return { ev: [], title: null }; }
  for (const l of text.split('\n')) s.line(l);
  s.ev.sort((a, b) => a.t - b.t);
  return { ev: s.ev, title: s.title };
}

export function attachSubagents(dir, ev, read = (f) => parseFile(f)) {
  const subDir = path.join(dir, 'subagents');
  if (!fs.existsSync(subDir)) return;
  const calls = new Map(ev.filter((e) => e.k === 'tool' && e.kind === 'agent').map((e) => [e.id, e]));
  if (!calls.size) return;
  for (const f of fs.readdirSync(subDir)) {
    if (!f.endsWith('.meta.json')) continue;
    let meta; try { meta = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf8')); } catch { continue; }
    const call = calls.get(meta.toolUseId);
    if (!call) continue;
    const sub = read(path.join(subDir, f.replace('.meta.json', '.jsonl')));
    call.sub = sub.ev.filter((e) => e.k !== 'prompt');
    const last = sub.ev.length ? Math.max(...sub.ev.map((e) => e.tEnd || e.t)) : call.t;
    call.subEnd = Math.max(last, call.t);
    call.subDone = !!meta.finished;
  }
}

export function parseSession(file) {
  const { ev, title } = parseFile(file);
  attachSubagents(file.replace(/\.jsonl$/, ''), ev);
  return { id: path.basename(file, '.jsonl'), file, title, ev };
}

// Split a session into tasks: each begins with a request typed by the person.
export function tasks(session) {
  const out = [];
  let cur = null;
  for (const e of session.ev) {
    if (e.k === 'prompt') { cur = { prompt: e.text, t0: e.t, ev: [] }; out.push(cur); continue; }
    if (cur) cur.ev.push(e);
  }
  for (const k of out) k.t1 = k.ev.length ? Math.max(...k.ev.map((e) => e.subEnd || e.tEnd || e.t)) : k.t0;
  return out;
}
