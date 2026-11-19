// Exact "waiting for your approval", from Claude Code itself (optional, off until turned on in the settings).
// Turning it on adds one Notification hook to ~/.claude/settings.json. When Claude Code shows a permission prompt,
// the hook appends the notification (one JSON line) to ~/.claude/agent-wallpaper/events.jsonl, which the wallpaper
// reads. Turning it off removes exactly that hook. A copy of settings.json is kept next to it before each change.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DIR = path.join(os.homedir(), '.claude', 'agent-wallpaper');
export const EVENTS = path.join(DIR, 'events.jsonl');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARK = 'agent-wallpaper/events.jsonl';
// Claude Code runs hook commands in a POSIX shell (Git Bash on Windows); $HOME is the same folder as os.homedir()
const COMMAND = `mkdir -p "$HOME/.claude/agent-wallpaper" && { cat; echo; } >> "$HOME/.claude/${MARK}"`;

function read() { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8').replace(/^﻿/, '')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } }
function write(s) {
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.agent-wallpaper.bak');
  fs.writeFileSync(SETTINGS + '.tmp', JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(SETTINGS + '.tmp', SETTINGS);
}
const ours = (h) => h && typeof h.command === 'string' && h.command.includes(MARK);

export function installed() {
  try { return (read().hooks?.Notification || []).some((g) => (g.hooks || []).some(ours)); } catch { return false; }
}
export function install() {
  const s = read();
  if ((s.hooks?.Notification || []).some((g) => (g.hooks || []).some(ours))) return true;
  s.hooks = s.hooks || {};
  s.hooks.Notification = [...(s.hooks.Notification || []), { matcher: '', hooks: [{ type: 'command', command: COMMAND }] }];
  write(s);
  fs.mkdirSync(DIR, { recursive: true });
  return true;
}
export function uninstall() {
  const s = read();
  if (!s.hooks?.Notification) return true;
  s.hooks.Notification = s.hooks.Notification.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ours(h)) })).filter((g) => g.hooks.length);
  if (!s.hooks.Notification.length) delete s.hooks.Notification;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  write(s);
  return true;
}

// is this notification a permission prompt? (newer versions say so in notification_type; older ones in the text)
export const isPermission = (n) => n && (n.notification_type === 'permission_prompt' || /permission|approv|批准|权限/i.test(String(n.message || '')));

// Follows the events file from where it ends now (earlier prompts are over). Times are when a line was read.
export class Asks {
  constructor(file = EVENTS) { this.file = file; this.pos = null; this.rest = ''; this.by = new Map(); }
  poll() {
    let st; try { st = fs.statSync(this.file); } catch { return false; }
    if (this.pos === null || st.size < this.pos) { this.pos = st.size; return false; }
    if (st.size === this.pos) return false;
    const fd = fs.openSync(this.file, 'r');
    const buf = Buffer.alloc(st.size - this.pos);
    fs.readSync(fd, buf, 0, buf.length, this.pos); fs.closeSync(fd);
    this.pos = st.size;
    const lines = (this.rest + buf.toString('utf8')).split('\n'); this.rest = lines.pop();
    const now = Date.now();
    let changed = false;
    for (const l of lines) {
      let n; try { n = JSON.parse(l); } catch { continue; }
      if (!n.session_id || !isPermission(n)) continue;
      const list = this.by.get(n.session_id) || [];
      list.push(now); this.by.set(n.session_id, list.slice(-20)); changed = true;
    }
    return changed;
  }
  for(sessionId) { return this.by.get(sessionId) || []; }
}
