// Agent Wallpaper: windows behind the desktop icons that draw what Claude Code, Codex and Cursor are doing.
// Reads their local logs (read-only). The page makes no network requests: anything that is not a local file is
// blocked. The only other thing read is an optional usage service on this computer (127.0.0.1:8787).
import { app, BrowserWindow, Tray, Menu, globalShortcut, screen, nativeImage, session, ipcMain, shell, Notification, dialog } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { Live } from '../src/live.mjs';
import { CodexLive } from '../src/codex.mjs';
import { CursorLive } from '../src/cursor.mjs';
import { Ledger, estimate } from '../src/estimate.mjs';
import * as S from '../src/settings.mjs';
import '../src/scene.js';  // Scene.stateOf, for notifications
import '../src/i18n.js';   // I18N
import desk from './platform.mjs'; // Windows or macOS desktop layer

const { Scene, I18N } = globalThis;
const here = path.dirname(fileURLToPath(import.meta.url));
// files other programs must open (PowerShell scripts, icons for notifications) are kept outside the packed archive
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const ROOT = process.env.WALL_ROOT || path.join(os.homedir(), '.claude', 'projects');
const CODEX = process.env.WALL_CODEX || path.join(os.homedir(), '.codex');

// keep Electron's own working files inside this folder, and keep it quiet
app.setName('Agent Wallpaper');
const MAC = process.platform === 'darwin', WIN = process.platform === 'win32';
// run from the source folder: keep Electron's working files there; an installed copy uses the usual per-user folder
if (process.env.WALL_TEST) app.setPath('userData', process.env.WALL_TEST); // test runs: a folder of their own
else if (!app.isPackaged) app.setPath('userData', path.join(here, '..', '.runtime'));
if (WIN) app.setAppUserModelId(app.isPackaged ? 'dev.agentwallpaper.app' : process.execPath); // needed for Windows notifications
// following the Claude app from inside the program (macOS, and installed copies): it starts at login, stays in the
// tray, and shows the wallpaper while Claude is open. A copy run from source on Windows uses app/watch.ps1 instead.
const FOLLOW_IN_APP = MAC || app.isPackaged;
const APPDATA = app.getPath('appData'); // %APPDATA% on Windows, ~/Library/Application Support on macOS
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,MediaRouter,Translate,AutofillServerCommunication');
app.commandLine.appendSwitch('disable-background-networking');
for (const f of (process.env.WALL_FLAGS || '').split(',').filter(Boolean)) app.commandLine.appendSwitch(f); // for testing
if (!process.env.WALL_TEST && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => openSettings()); // starting it again while it runs opens the settings

const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
let cfg = S.load(SETTINGS);
const t = () => I18N.t;
let tray = null, settingsWin = null, quitting = false, paused = false, showText = !process.env.WALL_NOTEXT, shown = true, hiddenByFollow = false;

function log(...a) { if (process.env.WALL_LOG) console.log(new Date().toISOString(), ...a.map((x) => typeof x === 'string' ? x : JSON.stringify(x))); }

// ---------------------------------------------------------------------------------------------------------------
// Sources: each AI whose logs are read. Readers are kept while the program runs, so turning one off and on again
// does not read everything from scratch.
const readers = new Map();
const reuse = (key, make) => { if (!readers.has(key)) { const r = make(); if (r.scan) r.scan(); readers.set(key, r); } return readers.get(key); };
// a chosen folder may be ~/.claude or its projects folder, ~/.codex or its sessions folder
const claudeRoot = (p) => (fs.existsSync(path.join(p, 'projects')) ? path.join(p, 'projects') : p);
const codexHome = (p) => (path.basename(p) === 'sessions' ? path.dirname(p) : p);
let sources = [];
function buildSources() {
  const s = cfg.sources, list = [];
  if (s.claude.on) list.push({ id: 'claude', name: 'Claude', color: s.claude.color, kind: 'claude', r: reuse('claude', () => new Live(ROOT, { hours: 12 })) });
  if (s.codex.on) list.push({ id: 'codex', name: 'Codex', color: s.codex.color, kind: 'codex', r: reuse('codex', () => new CodexLive(CODEX, { hours: 12 })) });
  const cdb = process.env.WALL_CURSOR || CursorLive.find();
  if ((s.cursor.on || process.env.WALL_CURSOR) && cdb) list.push({ id: 'cursor', name: 'Cursor', color: s.cursor.color, kind: 'cursor', r: reuse('cursor', () => new CursorLive(cdb, { hours: 12 })) });
  for (const c of cfg.custom) if (c.on) list.push({ id: 'x' + c.id, name: c.name, color: c.color, kind: c.kind, r: reuse(`x:${c.kind}:${c.path}`, () => (c.kind === 'claude' ? new Live(claudeRoot(c.path), { hours: 12 }) : new CodexLive(codexHome(c.path), { hours: 12 }))) });
  sources = list;
}
const codexReader = () => (sources.find((x) => x.id === 'codex') || {}).r;
function snapAll() {
  const out = [];
  for (const s of sources) {
    for (const it of s.r.snapshot()) {
      const id = s.id.startsWith('x') && s.kind === 'claude' ? `${s.id}:${it.id}` : it.id; // custom Claude folders get their own prefix
      out.push({ ...it, id, src: s.id, task: { ...it.task, src: s.kind, brand: { name: s.name, color: s.color } } });
    }
  }
  return out.sort((a, b) => b.last - a.last);
}
function pollAll() {
  let changed = false;
  for (const s of sources) { try { if (s.r.poll()) { changed = true; if (s.id === 'codex') codexUsage(); } } catch (e) { log('poll failed', s.id, String(e)); } }
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------
// Three ways to sit behind the icons. Windows versions differ, so if the picture does not show, the tray menu can
// switch to the next one. The choice is remembered in this program's own folder.
const PLACES = [{ layered: true, inWorker: false }, { layered: false, inWorker: false }, { layered: false, inWorker: true }];
const PREFS = path.join(app.getPath('userData'), 'prefs.json');
let place = 0;
try { place = JSON.parse(fs.readFileSync(PREFS, 'utf8')).place || 0; } catch {}
if (process.env.WALL_PLACE) place = Number(process.env.WALL_PLACE);
place = Math.max(0, Math.min(PLACES.length - 1, place));
function nextPlace() {
  place = (place + 1) % PLACES.length;
  try { fs.mkdirSync(path.dirname(PREFS), { recursive: true }); fs.writeFileSync(PREFS, JSON.stringify({ place })); } catch {}
  menu();
  for (const r of [...wins.values()]) closeWin(r); // they are built again by syncWindows
  setTimeout(syncWindows, 800);
}

// ---------------------------------------------------------------------------------------------------------------
// One window per chosen screen.
const wins = new Map(); // display id -> { id, display, rect, win, targets, hover, covered, icons, attach }
function displaysWanted() {
  const all = screen.getAllDisplays();
  if (cfg.screens === 'all') return all;
  if (cfg.screens !== 'primary') { const d = all.find((x) => String(x.id) === String(cfg.screens)); if (d) return [d]; }
  return [screen.getPrimaryDisplay()];
}
// a screen's rectangle in the units the mouse and the desktop layer use: real pixels on Windows, points on macOS
function rectOf(d) {
  if (!WIN) return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height, dip: d.bounds, f: 1 };
  const r = screen.dipToScreenRect(null, d.bounds); return { x: r.x, y: r.y, w: r.width, h: r.height, dip: d.bounds, f: d.scaleFactor };
}
const hwnd = (r) => desk.hwndOf(r.win.getNativeWindowHandle());
const live = (r) => r.win && !r.win.isDestroyed();
function sendTo(r, ch, data) { if (live(r)) r.win.webContents.send(ch, data); }
function send(ch, data) { for (const r of wins.values()) sendTo(r, ch, data); }
const recOf = (wc) => [...wins.values()].find((r) => live(r) && r.win.webContents.id === wc.id);

function createWindow(d) {
  const rec = { id: d.id, display: d, rect: rectOf(d), win: null, targets: [], hover: null, covered: false, icons: null };
  wins.set(d.id, rec);
  const win = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, show: false, skipTaskbar: true, focusable: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, hasShadow: false, transparent: true, backgroundColor: '#00000000', title: 'Agent Wallpaper',
    ...(MAC ? { type: 'desktop', enableLargerThanScreen: true } : {}), // macOS: above the wallpaper, below Finder's icons
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  rec.win = win;
  if (MAC) { win.setVisibleOnAllWorkspaces(true); win.setIgnoreMouseEvents(true); }
  win.setMenu(null);
  win.loadFile(path.join(here, 'index.html'));
  if (process.env.WALL_LOG) win.webContents.on('console-message', (e) => log('page', e.level, e.message, (e.sourceId || '').split('/').pop() + ':' + e.lineNumber));
  win.once('ready-to-show', () => {
    rec.attach = desk.attach(hwnd(rec), rec.rect, PLACES[place]);
    log('attach', d.id, rec.attach);
    win.showInactive();
    // Electron trims its old frame from the size once shown; set the full size again
    for (const ms of [200, 1200]) setTimeout(() => { if (live(rec)) desk.place(hwnd(rec), rec.rect); }, ms);
    sendTo(rec, 'all', helloFor(rec));
  });
  win.on('closed', () => {
    if (wins.get(d.id) === rec) wins.delete(d.id);
    if (!quitting && shown && displaysWanted().some((x) => x.id === d.id)) setTimeout(syncWindows, 800);
  });
}
function closeWin(r) {
  wins.delete(r.id);
  if (live(r)) { try { desk.detach(hwnd(r)); } catch {} r.win.destroy(); }
}
function syncWindows() {
  if (quitting) return;
  const want = shown ? displaysWanted() : [];
  for (const r of [...wins.values()]) if (!want.some((d) => d.id === r.id)) closeWin(r);
  for (const d of want) {
    const r = wins.get(d.id);
    if (!r) createWindow(d);
    else { r.display = d; r.rect = rectOf(d); if (live(r)) { r.win.setBounds(d.bounds); desk.place(hwnd(r), r.rect); } }
  }
  iconsToWindows();
}

// ---------------------------------------------------------------------------------------------------------------
// The wallpaper image (read from the copy Windows keeps), for the frosted glass when no live wallpaper runs.
const WALL_FILE = path.join(APPDATA, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
let wallpaper = null, wallMtime = 0;
function readWallpaper() {
  // macOS: the window is transparent over the real wallpaper, which shows through
  if (!WIN) { if (wallpaper) return false; wallpaper = { url: null, live: true }; return true; }
  try {
    const st = fs.statSync(WALL_FILE);
    if (st.mtimeMs === wallMtime && wallpaper) return false;
    const buf = fs.readFileSync(WALL_FILE);
    const mime = buf[0] === 0x89 ? 'image/png' : buf[0] === 0x42 && buf[1] === 0x4d ? 'image/bmp' : 'image/jpeg';
    wallpaper = { url: `data:${mime};base64,${buf.toString('base64')}`, size: 'cover', live: desk.liveWallpaper() };
    wallMtime = st.mtimeMs;
    return true;
  } catch { return false; }
}

// Where the desktop icons are, so the panels never sit under them. A small PowerShell helper reads them (read-only).
let iconsRaw = null, iconsReal = false, helper = null, helperBuf = '';
function estimateIcons(d) {
  let n = WIN ? 2 : 0;
  for (const dir of [path.join(os.homedir(), 'Desktop'), ...(WIN ? ['C:/Users/Public/Desktop'] : [])]) { try { n += fs.readdirSync(dir).filter((f) => !/^desktop\.ini$/i.test(f) && !/^~\$/.test(f) && !/^\./.test(f)).length; } catch {} }
  const rows = Math.max(1, Math.floor((d.bounds.height - 56) / 100));
  // Windows fills columns from the left; Finder from the right, below the menu bar
  if (MAC) return Array.from({ length: n }, (_, i) => ({ x: d.bounds.width - 96 - Math.floor(i / rows) * 96, y: 30 + (i % rows) * 100, w: 90, h: 92 }));
  return Array.from({ length: n }, (_, i) => ({ x: 4 + Math.floor(i / rows) * 80, y: 6 + (i % rows) * 100, w: 74, h: 90 }));
}
function startHelper() {
  if (!WIN) return; // macOS: Finder's icon positions are not readable without asking for permission; an estimate is used
  try {
    helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', unpacked(path.join(here, 'icons.ps1'))], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    helper.stdout.on('data', (b) => {
      helperBuf += b.toString('utf8');
      let i;
      while ((i = helperBuf.indexOf(String.fromCharCode(10))) >= 0) { const line = helperBuf.slice(0, i).trim(); helperBuf = helperBuf.slice(i + 1); if (line) gotIcons(line); }
    });
    helper.on('exit', () => { helper = null; if (!quitting) setTimeout(startHelper, 30000); });
  } catch { helper = null; }
}
function gotIcons(line) {
  let j; try { j = JSON.parse(line); } catch { return; }
  if (!j.ok) return;
  // real pixels from the virtual screen's corner
  const v = desk.virtualOrigin();
  iconsRaw = (j.r || '').split(';').filter(Boolean).map((s) => s.split(',').map(Number)).map(([x, y, w, h]) => ({ x: x + v.x, y: y + v.y, w, h }));
  iconsReal = true;
  iconsToWindows();
}
// each window gets the icons on its own screen, in its CSS pixels
function iconsToWindows() {
  for (const r of wins.values()) {
    const R = r.rect;
    const list = iconsRaw ? iconsRaw.filter((i) => i.x + i.w > R.x && i.y + i.h > R.y && i.x < R.x + R.w && i.y < R.y + R.h).map((i) => ({ x: (i.x - R.x) / R.f, y: (i.y - R.y) / R.f, w: i.w / R.f, h: i.h / R.f }))
      : r.display.id === screen.getPrimaryDisplay().id ? estimateIcons(r.display) : [];
    const k = JSON.stringify(list.map((i) => [Math.round(i.x), Math.round(i.y)]));
    if (k !== r.iconsKey) { r.iconsKey = k; r.icons = list; sendTo(r, 'icons', list); log('icons', r.id, { real: iconsReal, n: list.length }); }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cleared tasks stay hidden until they do something new (remembered in this program's own folder).
const DISMISSED = path.join(app.getPath('userData'), 'dismissed.json');
let dismissed = {};
try { dismissed = JSON.parse(fs.readFileSync(DISMISSED, 'utf8')) || {}; } catch {}
function dismiss(ids) {
  const snap = snapAll();
  for (const id of ids) { const s = snap.find((x) => x.id === id); dismissed[id] = s ? s.last : Date.now(); }
  try { fs.mkdirSync(path.dirname(DISMISSED), { recursive: true }); fs.writeFileSync(DISMISSED, JSON.stringify(dismissed)); } catch {}
  log('dismissed', ids); pushData(); menu();
}
ipcMain.on('dismiss', (_e, ids) => { if (Array.isArray(ids) && ids.length) dismiss(ids); });
const visibleSnap = () => snapAll().filter((s) => !(dismissed[s.id] && s.last <= dismissed[s.id]));
function pushData() { const d = visibleSnap(); send('data', d); watchStates(d); }

// ---------------------------------------------------------------------------------------------------------------
// Plan usage and token use (local only).
// Claude quota: a usage service on this computer (127.0.0.1:8787, e.g. the ClaudeOrb proxy) has live figures while
// its sign-in works; otherwise the Claude app's own record, with an estimate between its readings.
const PLAN_FILE = path.join(APPDATA, 'Claude', 'plan-usage-history.json');
const ledger = new Ledger(ROOT, 5);
let usage = null, usageBusy = false;
function getLocal(port, pathname, ms) {
  return new Promise((res) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: ms }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => { b += c; }); r.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } }); });
    req.on('timeout', () => { req.destroy(); res(null); }); req.on('error', () => res(null));
  });
}
async function refreshUsage() {
  if (usageBusy) return; usageBusy = true;
  const u = { at: Date.now() };
  try {
    const d = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
    const s = (d.samples || []).filter((x) => x.u && x.u.fh != null).pop();
    if (s) u.plan = { fh: Date.now() - s.t > 5 * 3600e3 ? 0 : s.u.fh, sd: s.u.sd, t: s.t, src: 'app' };
    await ledger.refresh();
    const e = estimate(d.samples || [], ledger, Date.now());
    if (e) u.plan = { fh: e.fh, sd: e.sd, fhReset: e.fhReset, sdReset: e.sdReset, t: e.t, src: 'est' };
  } catch (err) { log('estimate failed', String(err)); }
  const p = await getLocal(8787, '/usage', 25000);
  if (p) {
    if (p.tok_today != null) u.today = { tok: p.tok_today, out: p.tok_today_out, cost: p.cost_today_usd };
    if (p.week_tok != null) u.week = { tok: p.week_tok, cost: p.cost_7d_usd, days: p.tok_7d };
    if (p.ok && p.session_pct != null && p.limits_source !== 'app') u.plan = { fh: p.session_pct, sd: p.week_pct, fhReset: p.session_reset_s, sdReset: p.week_reset_s, t: (p.ts || Date.now() / 1000) * 1000, src: 'live' };
    else if (!p.ok && p.err) u.serviceErr = 'error';
  } else u.serviceErr = 'down';
  u.codex = codexNow();
  usage = u; usageBusy = false; send('usage', usage); quotaAlerts();
  log('usage', { plan: u.plan && u.plan.src, today: !!u.today, err: u.serviceErr });
}
// Codex quota and today's tokens, straight from its logs (it records its limits with every reply)
function codexNow() {
  const c = codexReader(); const r = c && c.rate(); if (!r) return null;
  const win = (w) => {
    if (!w || w.used_percent == null) return null;
    const reset = w.resets_at ? w.resets_at * 1000 : null, over = reset && reset <= Date.now();
    return { pct: over ? 0 : w.used_percent, resetS: reset && !over ? (reset - Date.now()) / 1000 : null, mins: w.window_minutes };
  };
  const ws = [win(r.primary), win(r.secondary)].filter(Boolean);
  return { week: ws.find((w) => w.mins >= 1440) || null, short: ws.find((w) => w.mins < 1440) || null, t: r.t, today: c.today() };
}
let codexSent = '';
function codexUsage() { if (!usage) return; usage.codex = codexNow(); const k = JSON.stringify(usage.codex && [usage.codex.week, usage.codex.short, usage.codex.today]); if (k !== codexSent) { codexSent = k; send('usage', usage); quotaAlerts(); } }

// ---------------------------------------------------------------------------------------------------------------
// Notifications: a task finished, one waits for your approval, or a quota passed your limit.
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false, icon: unpacked(path.join(here, '..', 'assets', 'tray-64.png')) });
  if (onClick) n.on('click', onClick);
  n.show();
  log('notify', title, body);
}
let seenStates = null; // id -> 'work' | 'approve' | 'done' | 'wait'
function watchStates(list) {
  const now = Date.now(), next = new Map();
  for (const s of list) {
    let k = Scene.stateOf(s.task, now);
    if (k.kind === 'wait' && !k.approval && now - k.since > cfg.waitDone * 3600e3) k = { kind: 'done', since: k.since };
    const kind = k.kind === 'wait' ? (k.approval ? 'approve' : 'wait') : k.kind === 'done' ? 'done' : 'work';
    next.set(s.id, { kind, abandoned: !!k.abandoned, tool: k.tool && (k.tool.id || k.tool.t) });
    if (!seenStates) continue; // the first look only learns where things stand
    const was = seenStates.get(s.id);
    const name = s.task.brand ? s.task.brand.name : 'Claude';
    const what = cfg.privacy ? s.title || t().task : s.title || String(s.task.prompt || '').split('\n')[0].slice(0, 80);
    if (cfg.notify.done && was && was.kind === 'work' && (kind === 'done' || kind === 'wait') && !k.abandoned && k.why !== 'interrupted') notify(t().nDone(name), what, () => openSession(s.id));
    if (cfg.notify.approval && kind === 'approve' && !(was && was.kind === 'approve' && was.tool === next.get(s.id).tool)) notify(t().nApprove(name), what, () => openSession(s.id));
  }
  seenStates = next;
}
// once per quota window: remembered across restarts in this program's own folder
const ALERTS = path.join(app.getPath('userData'), 'alerts.json');
let alerted = {};
try { alerted = JSON.parse(fs.readFileSync(ALERTS, 'utf8')) || {}; } catch {}
function quotaAlerts() {
  if (!cfg.notify.quota || !usage) return;
  const at = cfg.notify.quotaAt, now = Date.now(), fresh = [];
  const check = (key, name, label, pct, resetS) => {
    if (pct == null || pct < at) return;
    const k = `${key}:${resetS ? Math.round((now + resetS * 1000) / 3600e3) : new Date().toDateString()}`;
    if (alerted[k]) return;
    alerted[k] = now; fresh.push(k);
    notify(t().nQuotaTitle, t().nQuota(name, label, Math.round(pct)));
  };
  const p = usage.plan || {}, c = usage.codex;
  if (cfg.sources.claude.on && p.src !== 'app') { check('claude5h', 'Claude', t().h5, p.fh, p.fhReset); check('claudeWeek', 'Claude', t().week, p.sd, p.sdReset); }
  if (c && cfg.sources.codex.on) { if (c.short) check('codex5h', 'Codex', t().h5, c.short.pct, c.short.resetS); if (c.week) check('codexWeek', 'Codex', t().week, c.week.pct, c.week.resetS); }
  if (fresh.length) { for (const [k, v] of Object.entries(alerted)) if (now - v > 9 * 86400e3) delete alerted[k]; try { fs.writeFileSync(ALERTS, JSON.stringify(alerted)); } catch {} }
}

// ---------------------------------------------------------------------------------------------------------------
// Clicking a card opens that session in its app.
// The Claude app keeps one small file per session linking the log's id to its own local_… id (read-only here).
const SESS_DIR = path.join(APPDATA, 'Claude', 'claude-code-sessions');
let sessMap = new Map(), sessAt = 0;
function loadSessions() {
  const m = new Map();
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const f = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) walk(f, depth + 1);
      else if (/^local_.*\.json$/.test(e.name)) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j.cliSessionId && j.sessionId) m.set(j.cliSessionId, j.sessionId); } catch {} } } };
  walk(SESS_DIR, 0);
  sessMap = m; sessAt = Date.now(); log('sessions mapped', m.size);
}
function openUrl(url) { log('open', url); shell.openExternal(url).catch((e) => log('open failed', String(e))); }
function openSession(id) {
  if (id.startsWith('cx:')) return openUrl(`codex://threads/${encodeURIComponent(id.slice(3))}`);
  if (id.startsWith('cu:')) {
    if (MAC) { spawn('/usr/bin/open', ['-a', 'Cursor'], { detached: true, stdio: 'ignore' }).unref(); return; }
    const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe');
    if (fs.existsSync(exe)) { spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); return; }
    return openUrl('cursor://');
  }
  const cliId = id.replace(/^x[\w-]+:/, '');
  if (!sessMap.has(cliId) || Date.now() - sessAt > 30000) loadSessions();
  const local = sessMap.get(cliId);
  openUrl(local ? `claude://code/continue?session=${encodeURIComponent(local)}&source=wallpaper` : 'claude://code/needs-input?source=wallpaper');
}
// Clicks are seen by polling the left button and the cursor (no system-wide hook). Only a press and release on a
// card, with the desktop itself under the cursor, counts: clicks in other apps and on icons are ignored.
let pressId = null;
ipcMain.on('targets', (e, list) => { const r = recOf(e.sender); if (r) r.targets = Array.isArray(list) ? list : []; });
function pollMouse() {
  const p = desk.cursor();
  const r = [...wins.values()].find((x) => live(x) && p.x >= x.rect.x && p.x < x.rect.x + x.rect.w && p.y >= x.rect.y && p.y < x.rect.y + x.rect.h);
  let id = null;
  if (r && !r.covered && r.targets.length) {
    const x = (p.x - r.rect.x) / r.rect.f, y = (p.y - r.rect.y) / r.rect.f;
    const hit = r.targets.filter((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]; // the smallest wins (an × sits inside its card)
    if (hit && desk.desktopUnder(p)) id = hit.id;
  }
  for (const w of wins.values()) { const h = w === r ? id : null; if (h !== w.hover) { w.hover = h; sendTo(w, 'hover', h); } }
  const down = desk.leftDown();
  if (down && pressId === null) pressId = id || '';
  if (!down && pressId !== null) { if (pressId && pressId === id) { if (id.startsWith('x|')) dismiss([id.slice(2)]); else openSession(id); } pressId = null; }
}

// ---------------------------------------------------------------------------------------------------------------
// What each wallpaper window needs to draw.
const view = () => ({
  lang: I18N.lang, position: cfg.position, scale: cfg.scale, maxTasks: cfg.maxTasks, glass: cfg.glass, motion: cfg.motion, privacy: cfg.privacy,
  usage: cfg.usage, keepDone: cfg.keepDone, waitDone: cfg.waitDone,
  brands: { claude: { name: 'Claude', color: cfg.sources.claude.color, on: cfg.sources.claude.on }, codex: { name: 'Codex', color: cfg.sources.codex.color, on: cfg.sources.codex.on } },
});
const stateMsg = (r) => ({ paused, text: showText, covered: r ? r.covered : false });
const helloFor = (r) => ({ data: visibleSnap(), state: stateMsg(r), icons: r && r.icons, wallpaper, usage, view: view() });
ipcMain.handle('hello', (e) => helloFor(recOf(e.sender)));
function pushState() { for (const r of wins.values()) sendTo(r, 'state', stateMsg(r)); }

// ---------------------------------------------------------------------------------------------------------------
// Settings window
function sourceInfo() {
  const today = new Date().setHours(0, 0, 0, 0);
  const count = (r, kind) => { if (!r) return null; try { return r.snapshot().filter((x) => x.last >= today).length; } catch { return null; } };
  const get = (id) => (readers.get(id) || null);
  const short = (p) => p.replace(os.homedir(), '~');
  const cdb = CursorLive.find();
  return {
    claude: { found: fs.existsSync(ROOT), path: short(path.dirname(ROOT)), today: count(get('claude')) },
    codex: { found: fs.existsSync(path.join(CODEX, 'sessions')), path: short(CODEX), today: count(get('codex')) },
    cursor: { found: !!cdb, path: cdb ? short(path.dirname(path.dirname(path.dirname(cdb)))) : '', today: count(get('cursor')) },
    custom: Object.fromEntries(cfg.custom.map((c) => [c.id, { found: fs.existsSync(c.path), today: count(readers.get(`x:${c.kind}:${c.path}`)) }])),
  };
}
const displayInfo = () => screen.getAllDisplays().map((d, i) => ({ id: String(d.id), primary: d.id === screen.getPrimaryDisplay().id, label: `${i + 1}`, size: `${Math.round(d.bounds.width * d.scaleFactor)}×${Math.round(d.bounds.height * d.scaleFactor)}` }));
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 940, height: 680, minWidth: 820, minHeight: 560, title: 'Agent Wallpaper', backgroundColor: '#12161d', show: false, autoHideMenuBar: true,
    icon: path.join(here, '..', 'assets', 'tray-64.png'),
    webPreferences: { preload: path.join(here, 'settings-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(here, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}
// the switch shows what is really set up (a login item or a Startup shortcut), not only what was last chosen
const followOpenNow = () => { try { return FOLLOW_IN_APP ? app.getLoginItemSettings().openAtLogin : LINKS.some((n) => fs.existsSync(path.join(STARTUP, n))); } catch { return cfg.follow.open; } };
const cfgView = () => ({ ...cfg, follow: { ...cfg.follow, open: followOpenNow() } });
ipcMain.handle('cfg:get', () => ({ cfg: cfgView(), lang: I18N.lang, info: sourceInfo(), displays: displayInfo(), keysOk, version: app.getVersion() }));
ipcMain.handle('cfg:set', (_e, patch) => { const prev = cfg; cfg = S.apply(cfg, patch); if (patch && patch.follow && typeof patch.follow.open === 'boolean') startupShortcut(patch.follow.open); S.save(SETTINGS, cfg); applyCfg(prev); return { cfg: cfgView(), lang: I18N.lang, info: sourceInfo(), displays: displayInfo(), keysOk }; });
ipcMain.handle('cfg:pickFolder', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openDirectory', 'showHiddenFiles'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const kind = fs.existsSync(path.join(p, 'projects')) || /[\\/]projects$/.test(p) ? 'claude' : fs.existsSync(path.join(p, 'sessions')) || path.basename(p) === 'sessions' ? 'codex' : null;
  return { path: p, kind };
});
ipcMain.handle('cfg:testNotify', () => { notify('Agent Wallpaper', I18N.lang === 'en' ? 'Notifications are working.' : '通知可以正常显示。'); return true; });

function applyCfg(prev) {
  I18N.set(I18N.pick(cfg.lang, app.getLocale()));
  const ch = (k) => JSON.stringify(prev[k]) !== JSON.stringify(cfg[k]);
  if (ch('sources') || ch('custom')) { buildSources(); pollAll(); codexUsage(); }
  if (ch('screens')) syncWindows();
  if (ch('keys')) registerKeys();
  menu();
  send('view', view());
  pushData();
  if (usage) send('usage', usage);
}

// open with the Claude app: a Startup shortcut that runs app/watch.ps1 at sign-in
const STARTUP = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const LINKS = ['Agent Wallpaper (follow Claude).lnk', 'Claude 壁纸（跟随 Claude 打开）.lnk'];
function startupShortcut(on) {
  // macOS and installed copies: a login item; the program then waits in the tray for Claude
  if (FOLLOW_IN_APP) { try { app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, args: ['--at-login'] }); } catch (e) { log('login item failed', String(e)); } return; }
  try {
    if (!on) { for (const n of LINKS) { const f = path.join(STARTUP, n); if (fs.existsSync(f)) fs.unlinkSync(f); } return; }
    if (LINKS.some((n) => fs.existsSync(path.join(STARTUP, n)))) return;
    shell.writeShortcutLink(path.join(STARTUP, LINKS[0]), {
      target: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${path.join(here, 'watch.ps1')}"`, cwd: path.join(here, '..'),
    });
  } catch (e) { log('startup shortcut failed', String(e)); }
}

// ---------------------------------------------------------------------------------------------------------------
function setPaused(v) { paused = v; pushState(); menu(); if (!paused && pollAll()) pushData(); }
// show / hide: hiding closes the drawing windows entirely (frees their memory); the program keeps running in the tray
function setShown(v) { shown = v; menu(); syncWindows(); }
function setText(v) { showText = v; pushState(); menu(); }
function quit() {
  quitting = true;
  try { if (helper) helper.kill(); } catch {}
  for (const r of [...wins.values()]) closeWin(r);
  for (const r of readers.values()) { try { r.close && r.close(); } catch {} }
  app.quit();
}
function menu() {
  if (!tray) return;
  const l = t();
  tray.setToolTip(!shown ? l.tipHidden : paused ? l.tipPaused : l.tipOn);
  const k = cfg.keys;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: shown ? l.hide : l.show, accelerator: k.show, registerAccelerator: false, click: () => setShown(!shown) },
    { label: l.settings, accelerator: k.settings, registerAccelerator: false, click: openSettings },
    { type: 'separator' },
    { label: l.clearDone, click: () => send('clearDone') },
    { label: l.restore, enabled: Object.keys(dismissed).length > 0, click: () => { dismissed = {}; try { fs.writeFileSync(DISMISSED, '{}'); } catch {} pushData(); menu(); } },
    { type: 'separator' },
    { label: paused ? l.resume : l.pause, accelerator: k.pause, registerAccelerator: false, click: () => setPaused(!paused) },
    { label: showText ? l.hideText : l.showText, accelerator: k.text, registerAccelerator: false, click: () => setText(!showText) },
    { type: 'separator' },
    { label: l.place(l.places[place]), click: nextPlace },
    { type: 'separator' },
    { label: l.quit, accelerator: k.quit, registerAccelerator: false, click: quit },
  ]));
}
let keysOk = {};
function registerKeys() {
  globalShortcut.unregisterAll();
  const acts = { show: () => setShown(!shown), pause: () => setPaused(!paused), text: () => setText(!showText), settings: openSettings, quit };
  keysOk = {};
  for (const [name, fn] of Object.entries(acts)) { const key = cfg.keys[name]; if (!key) continue; try { keysOk[name] = globalShortcut.register(key, fn); } catch { keysOk[name] = false; } }
  log('shortcuts', keysOk);
}

app.whenReady().then(() => {
  // no network from the pages: only local files may load
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { const block = !/^(file|devtools|data|blob|chrome-extension):/.test(d.url); if (block) log('blocked', d.url); cb({ cancel: block }); });
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  I18N.set(I18N.pick(cfg.lang, app.getLocale()));

  // started at login while Claude is not open yet: wait in the tray
  const atLogin = process.argv.includes('--at-login') || (MAC && app.getLoginItemSettings().wasOpenedAtLogin);
  if (FOLLOW_IN_APP && atLogin && !desk.claudeDesktopRunning()) { shown = false; hiddenByFollow = true; }
  buildSources(); pollAll();
  readWallpaper();
  refreshUsage(); setInterval(() => { if (!paused) refreshUsage(); }, 60000);
  startHelper();
  setInterval(() => { if (helper && !paused) helper.stdin.write('scan' + String.fromCharCode(10)); }, 30000);
  // a live wallpaper program (e.g. Wallpaper Engine) may start or stop; the glass style follows it
  setInterval(() => { const lw = desk.liveWallpaper(); if (readWallpaper() || (wallpaper && wallpaper.live !== lw)) { wallpaper.live = lw; send('wallpaper', wallpaper); } }, 20000);
  syncWindows();

  if (MAC && app.dock) app.dock.hide(); // a menu-bar program, no Dock icon
  tray = new Tray(nativeImage.createFromPath(path.join(here, '..', 'assets', MAC ? 'tray-16.png' : 'tray.png')));
  tray.on('click', () => setShown(!shown)); // left click: on / off; right click: the menu
  registerKeys(); menu();
  if (process.env.WALL_SETTINGS) openSettings();
  if (process.env.WALL_TESTNOTIFY) setTimeout(() => notify('Agent Wallpaper', I18N.lang === 'en' ? 'Notifications are working.' : '通知可以正常显示。'), 3000);

  // follow the logs: react as soon as a log file changes (a slower poll stays as a safety net)
  let soon = null;
  for (const dir of [ROOT, path.join(CODEX, 'sessions')]) {
    try { fs.watch(dir, { recursive: true }, (_ev, f) => { if (!f || !/\.jsonl$/.test(f) || paused || soon) return; soon = setTimeout(() => { soon = null; if (pollAll()) pushData(); }, 120); }); } catch (e) { log('watch failed', dir, String(e)); }
  }
  setInterval(() => { if (!paused && pollAll()) pushData(); }, 2000);
  setInterval(pollMouse, 50);
  loadSessions();
  // follow the Claude desktop app: close with it (once it has been seen running); with FOLLOW_IN_APP, hide instead and
  // show again when Claude opens
  let seenClaude = false, missing = 0;
  if (!process.env.WALL_NOFOLLOW) setInterval(() => {
    if (desk.claudeDesktopRunning()) {
      seenClaude = true; missing = 0;
      if (FOLLOW_IN_APP && hiddenByFollow && cfg.follow.open) { hiddenByFollow = false; log('Claude opened: showing'); setShown(true); }
      return;
    }
    if (cfg.follow.close && seenClaude && ++missing >= 2) {
      seenClaude = false;
      if (FOLLOW_IN_APP) { if (shown) { hiddenByFollow = true; log('Claude closed: hiding'); setShown(false); } }
      else { log('Claude closed: quitting'); quit(); }
    }
  }, 4000);
  setInterval(() => { if (!paused) pushData(); }, 20000); // safety net, and keeps notifications timely
  // stay behind the icons (Explorer restarts), and rest while a full-screen window hides a screen
  setInterval(() => {
    for (const r of wins.values()) {
      if (!live(r)) continue;
      if (!desk.attached(hwnd(r))) { r.attach = desk.attach(hwnd(r), r.rect, PLACES[place]); log('reattach', r.id, r.attach); }
      const c = process.env.WALL_UNCOVERED ? false : desk.covered(r.rect);
      if (c !== r.covered) { r.covered = c; sendTo(r, 'state', stateMsg(r)); }
    }
  }, 2500);
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => setTimeout(syncWindows, 300));

  // test hook: save what the first window shows after a few seconds
  if (process.env.WALL_CAPTURE) setTimeout(async () => {
    const r = [...wins.values()][0];
    try {
      log('desk', desk.info(), 'windows', wins.size);
      log('page state', await r.win.webContents.executeJavaScript('JSON.stringify(window.__dbg && window.__dbg())'));
      const img = await r.win.webContents.capturePage();
      fs.writeFileSync(process.env.WALL_CAPTURE, img.toPNG());
      if (settingsWin && !settingsWin.isDestroyed()) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, '-settings.png'), (await settingsWin.webContents.capturePage()).toPNG());
      log('captured', process.env.WALL_CAPTURE);
    } catch (e) { log('capture failed', String(e)); }
    if (process.env.WALL_EXIT) quit();
  }, Number(process.env.WALL_CAPTURE_AFTER || 6000));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (quitting) app.quit(); });
