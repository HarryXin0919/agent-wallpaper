// Settings, kept in this program's own folder (.runtime/settings.json). Missing keys fall back to the defaults,
// so an older file keeps working after new settings are added.
import fs from 'node:fs';
import path from 'node:path';
import { SLOT_KEYS } from './fonts.mjs';

export const DEFAULTS = {
  // where the tasks come from; each source can be turned off and given its own color
  sources: {
    claude: { on: true, color: '#f4a98c' },
    codex: { on: true, color: '#8fc1ff' },
    cursor: { on: false, color: '#b9a2ff' },
    gemini: { on: true, color: '#9fe6d2' },
    deepseek: { on: true, color: '#ffd27a' },
  },
  custom: [], // extra log folders: [{ id, name, kind: 'claude' | 'codex', path, color, on }]
  lang: 'auto',        // auto | zh | en
  // a font per language, each: system | name:<an installed font family> | file:<id of an imported font>
  font: { latin: 'system', cjk: 'system', ja: 'system', ko: 'system' },
  fontFaces: {},       // installed fonts in use: family -> its faces [{ n: full name, p: PostScript name, s: style }]
  fonts: [],           // imported fonts: [{ id, name, file }] (the files are kept in the fonts folder next to the settings)
  position: 'auto',    // auto (avoid icons) | left | center | right
  scale: 1,            // 0.8 – 1.4
  screens: 'primary',  // primary | all | <display id>
  maxTasks: 4,         // lanes at once, 1 – 4
  glass: 'auto',       // auto | dark | light
  motion: 'full',      // full | reduced | off
  privacy: false,      // only titles and kinds of action: no request text, file names or commands
  updates: { check: true }, // check GitHub Releases for a new version (the installed Windows build also downloads it)
  exactApproval: false, // a Claude Code hook reports permission prompts (adds one hook to ~/.claude/settings.json)
  usage: { show: true, h5: true, week: true, codex: true, warm: 80, hot: 95 },
  notify: { done: true, approval: true, quota: true, quotaAt: 80 },
  follow: { open: true, close: true }, // open with the Claude desktop app (Startup shortcut) / close with it
  keepDone: 15,        // minutes a finished task stays clear before it fades
  waitDone: 2,         // hours a turn waiting for your reply counts as still open
  // phone push: alerts go to the address the person entered (Bark, ntfy, a WeCom robot, or any JSON webhook)
  push: { on: false, url: '', detail: false, done: false },
  dashboard: 'none',   // a screen (display id) drawn as a dashboard: no icons to avoid, bigger panels
  keys: { show: 'Ctrl+Alt+Shift+W', peek: 'Ctrl+Alt+Shift+Space', jump: 'Ctrl+Alt+Shift+J', pause: 'Ctrl+Alt+Shift+P', text: 'Ctrl+Alt+Shift+H', settings: 'Ctrl+Alt+Shift+S', quit: 'Ctrl+Alt+Shift+Q' },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return structuredClone(base);
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k] !== undefined && typeof over[k] === typeof base[k] ? over[k] : structuredClone(base[k]);
  // sources may hold more than the defaults (none today, but keep what is there)
  if (isObj(over.sources)) for (const k of Object.keys(over.sources)) if (!out.sources[k] && isObj(over.sources[k])) out.sources[k] = over.sources[k];
  if (isObj(over.fontFaces)) out.fontFaces = over.fontFaces; // keyed by font name, not by the defaults
  return out;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || a));
function tidy(s) {
  s.scale = clamp(s.scale, 0.8, 1.4);
  s.push.url = /^https?:\/\/\S+$/i.test(String(s.push.url || '').trim()) ? String(s.push.url).trim().slice(0, 500) : '';
  if (!s.push.url) s.push.on = false;
  s.dashboard = /^(none|\d{1,20})$/.test(String(s.dashboard)) ? String(s.dashboard) : 'none';
  s.maxTasks = Math.round(clamp(s.maxTasks, 1, 4));
  s.keepDone = clamp(s.keepDone, 1, 24 * 60);
  s.waitDone = clamp(s.waitDone, 0.25, 48);
  s.notify.quotaAt = clamp(s.notify.quotaAt, 50, 99);
  s.custom = (Array.isArray(s.custom) ? s.custom : []).filter((c) => c && c.path && /^(claude|codex)$/.test(c.kind)).slice(0, 8)
    .map((c, i) => ({ id: String(c.id || 'c' + (i + 1)).replace(/[^\w-]/g, '').slice(0, 12) || 'c' + (i + 1), name: String(c.name || c.kind).slice(0, 30), kind: c.kind, path: String(c.path), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#9fe6d2', on: c.on !== false }));
  s.fonts = (Array.isArray(s.fonts) ? s.fonts : []).filter((f) => f && /^[\w-]{1,24}$/.test(f.id || '') && /^[\w-]+\.(ttf|otf|woff2?)$/.test(f.file || '')).slice(0, 30)
    .map((f) => ({ id: f.id, name: String(f.name || 'Font').replace(/["'\\;{}<>]/g, '').slice(0, 60) || 'Font', file: f.file }));
  const clean = (v) => String(v || '').replace(/["'\\;{}<>]/g, '').trim();
  for (const k of SLOT_KEYS) {
    let v = clean(s.font[k]).slice(0, 90) || 'system';
    if (!/^(system$|name:.+|file:.+)/.test(v) || (v.startsWith('file:') && !s.fonts.some((f) => 'file:' + f.id === v))) v = 'system';
    s.font[k] = v;
  }
  // keep only the faces of installed fonts that a language uses
  const used = new Set(SLOT_KEYS.map((k) => s.font[k]).filter((v) => v.startsWith('name:')).map((v) => v.slice(5)));
  const faces = {};
  for (const [fam, list] of Object.entries(isObj(s.fontFaces) ? s.fontFaces : {})) {
    if (!used.has(clean(fam)) || !Array.isArray(list)) continue;
    faces[clean(fam)] = list.filter(isObj).slice(0, 24).map((x) => ({ n: clean(x.n).slice(0, 90), p: clean(x.p).slice(0, 90), s: clean(x.s).slice(0, 40) })).filter((x) => x.n || x.p);
  }
  s.fontFaces = faces;
  for (const v of Object.values(s.sources)) if (!/^#[0-9a-f]{6}$/i.test(v.color || '')) v.color = '#ffffff';
  return s;
}

export function load(file) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch {} // a file saved by hand may start with a BOM
  // before 0.5.1 there was one font for everything: it becomes the English and the Chinese font
  if (raw && typeof raw.font === 'string') raw.font = { latin: raw.font, cjk: raw.font };
  return tidy(merge(DEFAULTS, raw || {}));
}
export function save(file, s) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2)); fs.renameSync(file + '.tmp', file); } catch {}
}
// apply a partial change, e.g. { usage: { show: false } } or { custom: [...] }
export function apply(s, patch) {
  const next = structuredClone(s);
  const put = (dst, src) => { for (const [k, v] of Object.entries(src)) { if (isObj(v) && isObj(dst[k])) put(dst[k], v); else dst[k] = v; } };
  put(next, patch || {});
  return tidy(merge(DEFAULTS, next));
}
