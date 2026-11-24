// Agent Wallpaper: windows behind the desktop icons that draw what AI coding assistants are doing.
// Reads their local logs (read-only). The pages make no network requests: anything that is not a local file is
// blocked. The main process reads an optional usage service on this computer (127.0.0.1:8787) and, for updates,
// GitHub Releases (app/update.mjs).
import { app, BrowserWindow, Tray, Menu, globalShortcut, screen, nativeImage, nativeTheme, session, ipcMain, shell, Notification, dialog } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { Live } from '../src/live.mjs';
import { CodexLive } from '../src/codex.mjs';
import { CursorLive } from '../src/cursor.mjs';
import { GeminiLive } from '../src/gemini.mjs';
import { DeepseekLive, supported as deepseekOk } from '../src/deepseek.mjs';
import { Ledger, estimate } from '../src/estimate.mjs';
import * as S from '../src/settings.mjs';
import * as hooks from '../src/hooks.mjs';
import * as fonts from '../src/fonts.mjs';
import { createUpdater } from './update.mjs';
import { forecast, record, SPANS } from '../src/forecast.mjs';
import '../src/scene.js';  // Scene.stateOf, for notifications
import '../src/flow.js';   // Flow.progress, for the tray icon
import { sendPush } from '../src/push.mjs';
import { makeReport } from './report.mjs';
import '../src/i18n.js';   // I18N
import desk from './platform.mjs'; // Windows or macOS desktop layer

const { Scene, I18N } = globalThis;
const here = path.dirname(fileURLToPath(import.meta.url));
// files other programs must open (PowerShell scripts, icons for notifications) are kept outside the packed archive
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const ROOT = process.env.WALL_ROOT || path.join(os.homedir(), '.claude', 'projects');
const CODEX = process.env.WALL_CODEX || path.join(os.homedir(), '.codex');
const GEMINI = process.env.WALL_GEMINI || path.join(os.homedir(), '.gemini');
const DSH = process.env.WALL_DEEPSEEK || path.join(os.homedir(), '.dsh');

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
  if (s.gemini.on && fs.existsSync(path.join(GEMINI, 'tmp'))) list.push({ id: 'gemini', name: 'Gemini', color: s.gemini.color, kind: 'gemini', r: reuse('gemini', () => new GeminiLive(GEMINI, { hours: 12 })) });
  if (s.deepseek.on && deepseekOk && fs.existsSync(path.join(DSH, 'sessions'))) list.push({ id: 'deepseek', name: 'DeepSeek', color: s.deepseek.color, kind: 'deepseek', r: reuse('deepseek', () => new DeepseekLive(DSH, { hours: 12 })) });
  for (const c of cfg.custom) if (c.on) list.push({ id: 'x' + c.id, name: c.name, color: c.color, kind: c.kind, r: reuse(`x:${c.kind}:${c.path}`, () => (c.kind === 'claude' ? new Live(claudeRoot(c.path), { hours: 12 }) : new CodexLive(codexHome(c.path), { hours: 12 }))) });
  sources = list;
}
const codexReader = () => (sources.find((x) => x.id === 'codex') || {}).r;
const asks = new hooks.Asks(); // permission prompts reported by the optional Claude Code hook
function snapAll() {
  const out = [];
  for (const s of sources) {
    for (const it of s.r.snapshot()) {
      const id = s.id.startsWith('x') && s.kind === 'claude' ? `${s.id}:${it.id}` : it.id; // custom Claude folders get their own prefix
      const task = { ...it.task, src: s.kind, brand: { name: s.name, color: s.color } };
      if (s.id === 'claude' && cfg.exactApproval) { task.exact = true; task.ask = asks.open(it.id, task.t0, task.ev.length); }
      out.push({ ...it, id, src: s.id, task });
    }
  }
  return out.sort((a, b) => b.last - a.last);
}
function pollAll() {
  let changed = cfg.exactApproval ? asks.poll() : false;
  for (const s of sources) { try { if (s.r.poll()) { changed = true; if (s.id === 'codex') codexUsage(); } } catch (e) { log('poll failed', s.id, String(e)); } }
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------
// Three ways to sit behind the icons. Windows versions differ, so if the picture does not show, the tray menu can
// switch to the next one. The choice is remembered in this program's own folder.
const PLACES = [{ layered: true, inWorker: false }, { layered: false, inWorker: false }, { layered: false, inWorker: true }];
const PREFS = path.join(app.getPath('userData'), 'prefs.json');
let place = 0, prefs = {};
try { prefs = JSON.parse(fs.readFileSync(PREFS, 'utf8')) || {}; place = prefs.place || 0; } catch {}
function savePrefs() { try { fs.mkdirSync(path.dirname(PREFS), { recursive: true }); fs.writeFileSync(PREFS, JSON.stringify({ ...prefs, place })); } catch {} }
if (process.env.WALL_PLACE) place = Number(process.env.WALL_PLACE);
place = Math.max(0, Math.min(PLACES.length - 1, place));
function nextPlace() {
  place = (place + 1) % PLACES.length;
  savePrefs();
  menu();
  for (const r of [...wins.values()]) closeWin(r); // they are built again by syncWindows
  setTimeout(syncWindows, 800);
}

// ---------------------------------------------------------------------------------------------------------------
// One window per chosen screen.
const wins = new Map(); // display id -> { id, display, rect, win, targets, hover, covered, icons, attach }
function displaysWanted() {
  const all = screen.getAllDisplays();
  let want = [screen.getPrimaryDisplay()];
  if (cfg.screens === 'all') want = all;
  else if (cfg.screens !== 'primary') { const d = all.find((x) => String(x.id) === String(cfg.screens)); if (d) want = [d]; }
  // the dashboard screen always shows it, whichever screens are chosen
  const dash = cfg.dashboard !== 'none' && all.find((x) => String(x.id) === String(cfg.dashboard));
  if (dash && !want.some((x) => x.id === dash.id)) want = [...want, dash];
  return want;
}
// a screen's rectangle in the units the mouse and the desktop layer use: real pixels on Windows, points on macOS
function rectOf(d) {
  if (!WIN) return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height, dip: d.bounds, f: 1 };
  const r = screen.dipToScreenRect(null, d.bounds); return { x: r.x, y: r.y, w: r.width, h: r.height, dip: d.bounds, f: d.scaleFactor };
}
const hwnd = (r) => desk.hwndOf(r.win.getNativeWindowHandle());
const live = (r) => r.win && !r.win.isDestroyed();
function sendTo(r, ch, data) { if (live(r)) r.win.webContents.send(ch, data); }
function send(ch, data) {
  for (const r of wins.values()) sendTo(r, ch, data);
  for (const w of [panelWin, peekWin]) if (w && !w.isDestroyed()) w.webContents.send(ch, data); // the pop-up panel and the peek view
}
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
function pushData() {
  const d = visibleSnap(); send('data', d); watchStates(d); trayStatus(d);
  if (!prefs.seenTask && d.length) { prefs.seenTask = true; savePrefs(); send('view', view()); } // the welcome card has done its job
}

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
  // the usage service first: while it has live figures, the slower estimate is not needed
  const p = await getLocal(8787, '/usage', 25000);
  if (p) {
    if (p.tok_today != null) u.today = { tok: p.tok_today, out: p.tok_today_out, cost: p.cost_today_usd };
    if (p.week_tok != null) u.week = { tok: p.week_tok, cost: p.cost_7d_usd, days: p.tok_7d };
    if (p.ok && p.session_pct != null && p.limits_source !== 'app') u.plan = { fh: p.session_pct, sd: p.week_pct, fhReset: p.session_reset_s, sdReset: p.week_reset_s, t: (p.ts || Date.now() / 1000) * 1000, src: 'live' };
    else if (!p.ok && p.err) u.serviceErr = 'error';
  } else u.serviceErr = 'down';
  if (!u.plan) {
    try {
      const d = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
      const s = (d.samples || []).filter((x) => x.u && x.u.fh != null).pop();
      if (s) u.plan = { fh: Date.now() - s.t > 5 * 3600e3 ? 0 : s.u.fh, sd: s.u.sd, t: s.t, src: 'app' };
      // between the app's readings: the last reading plus the tokens used since
      await ledger.refresh();
      const e = estimate(d.samples || [], ledger, Date.now());
      if (e) u.plan = { fh: e.fh, sd: e.sd, fhReset: e.fhReset, sdReset: e.sdReset, t: e.t, src: 'est' };
    } catch (err) { log('estimate failed', String(err)); }
  }
  u.codex = codexNow();
  forecastUsage(u);
  usage = u; usageBusy = false; send('usage', usage); quotaAlerts(); trayStatus();
  log('usage', { plan: u.plan && u.plan.src, today: !!u.today, err: u.serviceErr });
}
// How fast each quota is being used, and whether it runs out before it resets (src/forecast.mjs). The readings are
// kept in this program's own folder, so the weekly pace survives a restart.
const HISTORY = path.join(app.getPath('userData'), 'usage-history.json');
let hist = {}, histSaved = 0;
try { hist = JSON.parse(fs.readFileSync(HISTORY, 'utf8')) || {}; } catch {}
function forecastUsage(u) {
  const now = Date.now(), p = u.plan || {}, cx = u.codex || {}, at = (sec) => (sec != null ? now + sec * 1000 : null);
  const quotas = [['fh', p.fh, SPANS.h5, p.fhReset], ['sd', p.sd, SPANS.week, p.sdReset],
    ['cxs', cx.short && cx.short.pct, SPANS.h5, cx.short && cx.short.resetS], ['cxw', cx.week && cx.week.pct, SPANS.week, cx.week && cx.week.resetS]];
  u.forecast = {};
  for (const [k, v, span, reset] of quotas) {
    if (v == null) continue;
    record(hist, k, now, v);
    const f = forecast(hist[k], now, span, v, at(reset));
    if (f) u.forecast[k] = f;
  }
  if (now - histSaved > 10 * 60e3) { histSaved = now; try { fs.writeFileSync(HISTORY, JSON.stringify(hist)); } catch {} }
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
    if (cfg.notify.done && was && was.kind === 'work' && (kind === 'done' || kind === 'wait') && !k.abandoned && k.why !== 'interrupted') { notify(t().nDone(name), what, () => openSession(s.id)); pushOut('done', t().nDone(name), what); }
    if (cfg.notify.approval && kind === 'approve' && !(was && was.kind === 'approve' && was.tool === next.get(s.id).tool)) { notify(t().nApprove(name), what, () => openSession(s.id)); pushOut('approval', t().nApprove(name), what); }
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
  if (id.startsWith('gm:')) return log('open: Gemini CLI runs in a terminal, nothing to open'); // no app to jump to
  if (id.startsWith('ds:')) return openUrl('dsh://open'); // DeepSeek Harness: its link brings the app up, not one session
  if (id.startsWith('cu:')) {
    if (MAC) { spawn('/usr/bin/open', ['-a', 'Cursor'], { detached: true, stdio: 'ignore' }).unref(); return; }
    // Cursor's links cannot open one particular conversation, so the app itself is brought up
    const exe = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cursor', 'Cursor.exe')].find((p) => fs.existsSync(p));
    if (exe) { spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); return; }
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
// macOS: the page says where its panels are, and the system's material is put under each of them (desktop-mac.mjs)
ipcMain.on('panels', (e, list) => {
  const r = recOf(e.sender), win = r ? r.win : fromPeek(e) ? peekWin : null;
  if (!win || !Array.isArray(list) || !desk.material()) return;
  const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
  const ok = desk.panels(win, list.slice(0, 24).map((p) => ({ x: num(p.x, -1e5, 1e5), y: num(p.y, -1e5, 1e5), w: num(p.w, 0, 1e5), h: num(p.h, 0, 1e5), r: num(p.r, 0, 200), a: num(p.a, 0, 1) })), { light: cfg.glass === 'light' });
  if (!ok && !desk.material()) send('view', view()); // it could not be done: the page paints its own material again
});
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
const FONTS = path.join(app.getPath('userData'), 'fonts'); // copies of imported font files
const fontUrl = (f) => pathToFileURL(path.join(FONTS, f.file)).href;
const fontFiles = () => cfg.fonts.map((f) => ({ ...f, family: 'AW-' + f.id, url: fontUrl(f) }));
const fontView = () => fonts.slotView(cfg, fontUrl); // the fonts chosen per language (src/fonts.mjs)
// the sources found on this computer, for the first-run card and the pop-up panel
function foundNames() {
  const info = sourceInfo();
  return [['claude', 'Claude Code'], ['codex', 'Codex'], ['gemini', 'Gemini CLI'], ['deepseek', 'DeepSeek Harness'], ['cursor', 'Cursor']]
    .filter(([k]) => info[k] && info[k].found && cfg.sources[k] && cfg.sources[k].on).map(([, n]) => n);
}
const view = () => ({
  font: fontView(),
  welcome: prefs.seenTask ? null : { found: foundNames(), peek: cfg.keys.peek },
  lang: I18N.lang, position: cfg.position, scale: cfg.scale, maxTasks: cfg.maxTasks, glass: cfg.glass, motion: cfg.motion, privacy: cfg.privacy,
  usage: cfg.usage, keepDone: cfg.keepDone, waitDone: cfg.waitDone,
  material: desk.material(), // macOS: the system's own material ('glass' or 'frost') goes under the panels, the page paints none
  brands: { claude: { name: 'Claude', color: cfg.sources.claude.color, on: cfg.sources.claude.on }, codex: { name: 'Codex', color: cfg.sources.codex.color, on: cfg.sources.codex.on } },
});
// a screen chosen as the dashboard: no icons to avoid, bigger panels
const stateMsg = (r) => ({ paused, text: showText, covered: r ? r.covered : false, dashboard: !!(r && cfg.dashboard !== 'none' && String(r.id) === String(cfg.dashboard)) });
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
    gemini: { found: fs.existsSync(path.join(GEMINI, 'tmp')), path: short(GEMINI), today: count(get('gemini')) },
    deepseek: { found: deepseekOk && fs.existsSync(path.join(DSH, 'sessions')), path: short(DSH), today: count(get('deepseek')) },
    cursor: { found: !!cdb, path: cdb ? short(path.dirname(path.dirname(path.dirname(cdb)))) : '', today: count(get('cursor')) },
    custom: Object.fromEntries(cfg.custom.map((c) => [c.id, { found: fs.existsSync(c.path), today: count(readers.get(`x:${c.kind}:${c.path}`)) }])),
  };
}
const displayInfo = () => screen.getAllDisplays().map((d, i) => ({ id: String(d.id), primary: d.id === screen.getPrimaryDisplay().id, label: `${i + 1}`, size: `${Math.round(d.bounds.width * d.scaleFactor)}×${Math.round(d.bounds.height * d.scaleFactor)}` }));
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 940, height: 680, minWidth: 820, minHeight: 560, title: 'Agent Wallpaper', backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7', show: false, autoHideMenuBar: true, // the page follows the system's light or dark
    icon: path.join(here, '..', 'assets', 'tray-64.png'),
    // macOS: the traffic lights sit over a sidebar of the system's own material, as in System Settings
    ...(MAC ? { titleBarStyle: 'hiddenInset', vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' } : {}),
    webPreferences: { preload: path.join(here, 'settings-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(here, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}
// the switch shows what is really set up (a login item or a Startup shortcut), not only what was last chosen
const followOpenNow = () => { try { return FOLLOW_IN_APP ? app.getLoginItemSettings().openAtLogin : LINKS.some((n) => fs.existsSync(path.join(STARTUP, n))); } catch { return cfg.follow.open; } };
const cfgView = () => ({ ...cfg, follow: { ...cfg.follow, open: followOpenNow() }, exactApproval: hooks.installed() });
ipcMain.handle('cfg:get', () => ({ cfg: cfgView(), lang: I18N.lang, info: sourceInfo(), fontFiles: fontFiles(), fontView: fontView(), displays: displayInfo(), keysOk, version: app.getVersion(), platform: process.platform }));
ipcMain.handle('cfg:set', (_e, patch) => { const prev = cfg; cfg = S.apply(cfg, patch); if (patch && patch.follow && typeof patch.follow.open === 'boolean') startupShortcut(patch.follow.open);
  // the approval hook: added to or removed from Claude Code's settings only when this switch is changed
  if (patch && typeof patch.exactApproval === 'boolean') { try { patch.exactApproval ? hooks.install() : hooks.uninstall(); } catch (e) { log('hook change failed', String(e)); } cfg = S.apply(cfg, { exactApproval: hooks.installed() }); } S.save(SETTINGS, cfg); applyCfg(prev); return { cfg: cfgView(), lang: I18N.lang, info: sourceInfo(), fontFiles: fontFiles(), fontView: fontView(), displays: displayInfo(), keysOk }; });
// import a font file: a copy goes into this program's folder, and it is chosen for one language
function addFont(file, slot) {
  const r = fonts.importFont(file, FONTS);
  if (r.error) return r;
  const prev = cfg; cfg = S.apply(cfg, { fonts: [...cfg.fonts, r] });
  if (fonts.SLOT_KEYS.includes(slot)) cfg = S.apply(cfg, { font: { [slot]: 'file:' + r.id } });
  S.save(SETTINGS, cfg); applyCfg(prev);
  return r;
}
const cfgState = (extra) => ({ cfg: cfgView(), lang: I18N.lang, info: sourceInfo(), fontFiles: fontFiles(), fontView: fontView(), displays: displayInfo(), keysOk, ...extra });
ipcMain.handle('cfg:importFont', async (_e, slot) => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openFile'], filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const got = addFont(r.filePaths[0], slot);
  return cfgState(got.error ? { fontError: got.error } : {});
});
ipcMain.handle('cfg:removeFont', (_e, id) => {
  const f = cfg.fonts.find((x) => x.id === id); if (!f) return cfgState();
  const prev = cfg, off = Object.fromEntries(fonts.SLOT_KEYS.filter((k) => cfg.font[k] === 'file:' + id).map((k) => [k, 'system']));
  cfg = S.apply(cfg, { font: off }); cfg = S.apply(cfg, { fonts: cfg.fonts.filter((x) => x.id !== id) });
  fonts.removeFont(f, FONTS); S.save(SETTINGS, cfg); applyCfg(prev);
  return cfgState();
});
ipcMain.handle('cfg:pickFolder', async () => {
  const r = await dialog.showOpenDialog(settingsWin, { properties: ['openDirectory', 'showHiddenFiles'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const kind = fs.existsSync(path.join(p, 'projects')) || /[\\/]projects$/.test(p) ? 'claude' : fs.existsSync(path.join(p, 'sessions')) || path.basename(p) === 'sessions' ? 'codex' : null;
  return { path: p, kind };
});
ipcMain.handle('cfg:update', () => (up ? up.state() : null));
ipcMain.handle('cfg:checkUpdate', () => { if (up) up.check(true); return true; });
ipcMain.handle('cfg:installUpdate', () => { if (up) up.install(); return true; });
ipcMain.handle('cfg:openReleases', () => { if (up) up.openPage(); return true; });
// Phone push (off unless turned on in the settings): the alert goes to the address the person entered and nowhere
// else, without the task's title unless that is turned on too. The address holds a key, so it is not logged.
// (sent through a session of its own: the default one lets the pages load local files only, which would stop it)
const pushNet = () => session.fromPartition('agent-wallpaper-push');
function pushOut(kind, title, what) {
  const p = cfg.push;
  if (!p.on || !p.url || (kind === 'done' && !p.done)) return;
  sendPush(pushNet(), p.url, title, p.detail ? what : '').then((r) => log('push', kind, r.ok ? 'sent' : 'failed', r.status));
}
// Before push can be turned on, the address is checked: a 4-digit code is sent to it and the person types in what
// arrived. A service answering "ok" does not show that the right phone got it, and a mistyped address would
// otherwise send the alerts to someone else. Changing the address needs a new check (src/settings.mjs).
let pushCheck = null; // { url, code, at }
ipcMain.handle('cfg:testPush', async () => {
  const url = cfg.push.url;
  if (!url) return { ok: false, status: 'address' };
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const r = await sendPush(pushNet(), url, 'Agent Wallpaper', (I18N.lang === 'en' ? 'Verification code: ' : '验证码：') + code);
  if (r.ok) pushCheck = { url, code, at: Date.now() };
  return r;
});
ipcMain.handle('cfg:verifyPush', (_e, code) => {
  const ok = !!pushCheck && pushCheck.url === cfg.push.url && Date.now() - pushCheck.at < 10 * 60e3 && String(code).trim() === pushCheck.code;
  if (ok) { const prev = cfg; cfg = S.apply(cfg, { push: { verified: cfg.push.url, on: true } }); S.save(SETTINGS, cfg); applyCfg(prev); pushCheck = null; }
  return cfgState({ verified: ok });
});
// today's report as a picture: saved to Pictures, copied, and shown in its folder
async function todayReport(out) {
  const r = await makeReport({ list: snapAll(), usage, lang: I18N.lang, stateOf: Scene.stateOf, iconFile: path.join(here, '..', 'assets', 'tray-64.png'), out: out || undefined, reveal: !out });
  if (!out) notify(t().reportTitle, t().reportSaved);
  return r;
}
ipcMain.handle('cfg:testNotify', () => { notify('Agent Wallpaper', I18N.lang === 'en' ? 'Notifications are working.' : '通知可以正常显示。'); return true; });

function applyCfg(prev) {
  I18N.set(I18N.pick(cfg.lang, app.getLocale()));
  const ch = (k) => JSON.stringify(prev[k]) !== JSON.stringify(cfg[k]);
  if (ch('sources') || ch('custom')) { buildSources(); pollAll(); codexUsage(); }
  if (ch('screens')) syncWindows();
  if (ch('keys')) registerKeys();
  if (ch('dashboard')) { syncWindows(); pushState(); }
  if (ch('updates') && up) up.schedule(cfg.updates.check);
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
// the tray's update item says where things stand: check, checking, downloading, restart to update, or download
function updateItem(l) {
  if (!up) return [];
  const u = up.state();
  if (u.status === 'source') return [];
  if (u.status === 'ready') return [{ label: l.upInstall(u.version), click: () => up.install() }];
  if (u.status === 'available') return [{ label: l.upGet(u.version), click: () => up.openPage() }];
  if (u.status === 'downloading') return [{ label: l.upDownloading(u.version, u.percent), enabled: false }];
  if (u.status === 'checking') return [{ label: l.upChecking, enabled: false }];
  return [{ label: l.upCheck, click: () => up.check(true) }];
}
// ---------------------------------------------------------------------------------------------------------------
// At a glance without the desktop: the tray icon's colour and tooltip, a pop-up panel from the tray, a full view over
// all windows on a shortcut ("peek"), and a shortcut to the task that waits for you.

// where things stand: how many tasks are at work, which wait for an approval, which for a reply
function standing(list = visibleSnap(), now = Date.now()) {
  const s = { work: 0, approve: [], reply: [] };
  for (const x of list) {
    const k = Scene.stateOf(x.task, now);
    if (k.kind === 'done') continue;
    if (k.kind === 'wait' && !k.approval) { if (now - k.since <= cfg.waitDone * 3600e3) s.reply.push({ id: x.id, since: k.since }); continue; }
    if (k.kind === 'wait') s.approve.push({ id: x.id, since: k.since }); else s.work++;
  }
  s.approve.sort((a, b) => a.since - b.since); s.reply.sort((a, b) => a.since - b.since);
  return s;
}
// the tray icon with a dot: green while something is at work, amber when something waits for your approval
const trayImgs = {};
// While tasks run, the icon's rays show how far along they are (k of 7 lit; pictures made by tools/icon.mjs). An
// amber dot is drawn into the corner when one waits for your approval.
function trayImage(kind, k) {
  const key = kind + (k == null ? '' : k);
  if (trayImgs[key]) return trayImgs[key];
  const file = k == null ? (MAC ? 'tray-16.png' : 'tray.png') : MAC ? `tray16-p${k}.png` : `tray-p${k}.png`;
  const base = nativeImage.createFromPath(path.join(here, '..', 'assets', file));
  if (kind !== 'approve' || MAC) return (trayImgs[key] = base); // macOS shows a count next to the icon instead
  const { width: w, height: h } = base.getSize(), px = Buffer.from(base.toBitmap());
  const fill = [0x3c, 0xc9, 0xff]; // BGR of #ffc93c (amber)
  const ring = [0x27, 0x1f, 0x1b], cx = w * 0.79, cy = h * 0.79, r = w * 0.2; // in the corner, clear of the bulb
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), a = Math.max(0, Math.min(1, r + 0.5 - d));
    if (!a) continue;
    const c = d <= r - w * 0.07 ? fill : ring, i = (y * w + x) * 4; // a dark rim keeps the dot visible on a light taskbar
    for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(c[ch] * a + px[i + ch] * (1 - a));
    px[i + 3] = Math.round(255 * a + px[i + 3] * (1 - a));
  }
  return (trayImgs[key] = nativeImage.createFromBitmap(px, { width: w, height: h }));
}
// how many of the tray icon's 7 rays are lit: the average progress of the tasks at work
function litRays(list, now = Date.now()) {
  let sum = 0, n = 0;
  for (const x of list) {
    const st = Scene.stateOf(x.task, now);
    if (st.kind === 'done' || (st.kind === 'wait' && !st.approval)) continue;
    sum += globalThis.Flow.progress(x.task, now).pct; n++;
  }
  return n ? Math.max(0, Math.min(7, Math.round((sum / n / 100) * 7))) : 0;
}
function trayTip(s) {
  const l = t();
  if (!shown) return l.tipHidden;
  const parts = [];
  if (s.approve.length) parts.push(l.tipApprove(s.approve.length));
  if (s.work) parts.push(l.tipRun(s.work));
  if (s.reply.length) parts.push(l.tipReply(s.reply.length));
  const lines = ['Agent Wallpaper' + (paused ? ' · ' + l.tipPausedShort : ''), parts.length ? parts.join(' · ') : l.tipNone];
  const p = usage && usage.plan, f = usage && usage.forecast && usage.forecast.fh;
  if (p && p.fh != null) lines.push(l.tipQuota(Math.round(Math.max(0, 100 - p.fh))) + (f && f.beforeReset ? ' · ' + l.runsOut(I18N.mins(f.outAt - Date.now())) : ''));
  return lines.join('\n').slice(0, 127);
}
let trayKey = 'idle';
function trayStatus(list) {
  if (!tray) return;
  list = list || visibleSnap();
  const s = standing(list), kind = s.approve.length ? 'approve' : s.work ? 'work' : 'idle';
  const k = kind === 'idle' ? null : litRays(list), key = kind + k;
  if (key !== trayKey) { trayKey = key; tray.setImage(trayImage(kind, k)); }
  if (MAC) tray.setTitle(s.approve.length ? ` ${s.approve.length}!` : s.work ? ` ${s.work}` : '');
  tray.setToolTip(trayTip(s));
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('standing', s);
}

// the pop-up panel, next to the tray icon; it hides when it loses the focus
const PANEL_W = 380;
let panelWin = null, panelH = 420, panelHidAt = 0;
function placePanel() {
  const b = tray ? tray.getBounds() : null;
  const pt = b && b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(pt).workArea, H = Math.min(panelH, wa.height - 16);
  const x = Math.round(Math.max(wa.x + 8, Math.min(pt.x - PANEL_W / 2, wa.x + wa.width - PANEL_W - 8)));
  const y = Math.round(pt.y < wa.y + wa.height / 2 ? wa.y + 8 : wa.y + wa.height - H - 8); // under a top menu bar, else above the taskbar
  panelWin.setBounds({ x, y, width: PANEL_W, height: H });
}
const panelHello = () => ({ data: visibleSnap(), usage, view: view(), keys: cfg.keys, found: foundNames(), standing: standing() });
function togglePanel() {
  if (panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) { panelWin.hide(); return; }
  if (Date.now() - panelHidAt < 250) return; // this click is the one that took its focus away
  if (panelWin && !panelWin.isDestroyed()) { panelWin.webContents.send('panel:all', panelHello()); placePanel(); panelWin.show(); panelWin.focus(); return; }
  panelWin = new BrowserWindow({
    width: PANEL_W, height: panelH, show: false, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, transparent: true, backgroundColor: '#00000000', hasShadow: false, title: 'Agent Wallpaper',
    // macOS: a menu bar pop-up of the system's own material, with the system's corners and shadow
    ...(MAC ? { transparent: false, hasShadow: true, vibrancy: 'popover', visualEffectState: 'active' } : {}),
    webPreferences: { preload: path.join(here, 'panel-preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  panelWin.setMenu(null);
  panelWin.loadFile(path.join(here, 'panel.html'));
  panelWin.on('blur', () => { if (!process.env.WALL_PANEL_STAY && panelWin && !panelWin.isDestroyed()) { panelHidAt = Date.now(); panelWin.hide(); } });
  panelWin.once('ready-to-show', () => { placePanel(); panelWin.show(); panelWin.focus(); });
  panelWin.on('closed', () => { panelWin = null; });
}
const fromPanel = (e) => panelWin && !panelWin.isDestroyed() && e.sender === panelWin.webContents;
ipcMain.handle('panel:hello', (e) => (fromPanel(e) ? panelHello() : null));
ipcMain.on('panel:size', (e, h) => { if (!fromPanel(e) || !Number.isFinite(h)) return; panelH = Math.max(160, Math.min(680, Math.ceil(h))); if (panelWin.isVisible()) placePanel(); });
ipcMain.on('panel:open', (e, id) => { if (!fromPanel(e) || typeof id !== 'string') return; panelWin.hide(); openSession(id); });
ipcMain.on('panel:act', (e, what) => {
  if (!fromPanel(e)) return;
  panelWin.hide();
  ({ peek: togglePeek, settings: openSettings, jump, show: () => setShown(!shown) }[what] || (() => {}))();
});

// peek: the full picture over all windows on the screen under the mouse, until Esc, a click outside the panels,
// the shortcut again, or switching to another window
let peekWin = null;
function togglePeek() {
  if (peekWin && !peekWin.isDestroyed()) { peekWin.close(); return; }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  peekWin = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, alwaysOnTop: true, title: 'Agent Wallpaper',
    // macOS: the windows behind are blurred by the system instead of covered by a dark veil
    ...(MAC ? { transparent: false, roundedCorners: false, vibrancy: 'fullscreen-ui', visualEffectState: 'active' } : {}),
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  peekWin.setAlwaysOnTop(true, 'screen-saver');
  if (MAC) peekWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  peekWin.setMenu(null);
  peekWin.loadFile(path.join(here, 'index.html'), { query: { peek: '1' } });
  if (process.env.WALL_LOG) peekWin.webContents.on('console-message', (e) => log('peek page', e.level, e.message));
  peekWin.once('ready-to-show', () => { peekWin.show(); peekWin.focus(); });
  peekWin.on('blur', () => { if (!process.env.WALL_PEEK_STAY && peekWin && !peekWin.isDestroyed()) peekWin.close(); });
  peekWin.on('closed', () => { peekWin = null; });
}
const fromPeek = (e) => peekWin && !peekWin.isDestroyed() && e.sender === peekWin.webContents;
ipcMain.on('peek:close', (e) => { if (fromPeek(e)) peekWin.close(); });
ipcMain.on('peek:open', (e, id) => { if (!fromPeek(e) || typeof id !== 'string') return; peekWin.close(); openSession(id); });

// the task that has waited longest for you: an approval first, then a reply
function jump() {
  const s = standing(), w = s.approve[0] || s.reply[0];
  if (w) openSession(w.id); else notify('Agent Wallpaper', t().jumpNone);
}

let trayMenu = null;
function menu() {
  if (!tray) return;
  const l = t(), k = cfg.keys, s = standing(), waiting = s.approve.length + s.reply.length;
  trayMenu = Menu.buildFromTemplate([
    { label: l.peek, accelerator: k.peek, registerAccelerator: false, click: togglePeek },
    { label: l.report, click: () => todayReport().catch((err) => log('report failed', String(err))) },
    ...(waiting ? [{ label: l.jumpTo(waiting), accelerator: k.jump, registerAccelerator: false, click: jump }] : []),
    { type: 'separator' },
    { label: shown ? l.hide : l.show, accelerator: k.show, registerAccelerator: false, click: () => setShown(!shown) },
    { label: l.settings, accelerator: k.settings, registerAccelerator: false, click: openSettings },
    ...updateItem(l),
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
  ]);
  if (!MAC) tray.setContextMenu(trayMenu); // macOS: the menu is opened by a right click only (a left click opens the panel)
  trayStatus();
}
let keysOk = {};
let up = null; // updates from GitHub Releases (app/update.mjs)
function registerKeys() {
  globalShortcut.unregisterAll();
  const acts = { show: () => setShown(!shown), peek: togglePeek, jump, pause: () => setPaused(!paused), text: () => setText(!showText), settings: openSettings, quit };
  keysOk = {};
  for (const [name, fn] of Object.entries(acts)) { const key = cfg.keys[name]; if (!key) continue; try { keysOk[name] = globalShortcut.register(key, fn); } catch { keysOk[name] = false; } }
  log('shortcuts', keysOk);
}

app.whenReady().then(() => {
  // no network from the pages: only local files may load
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { const block = !/^(file|devtools|data|blob|chrome-extension):/.test(d.url); if (block) log('blocked', d.url); cb({ cancel: block }); });
  // pages get no permissions, except that the settings window may list the installed fonts (for the font menu)
  const fontList = (wc, p) => p === 'local-fonts' && !!settingsWin && !settingsWin.isDestroyed() && wc === settingsWin.webContents;
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(fontList(wc, p)));
  session.defaultSession.setPermissionCheckHandler((wc, p) => fontList(wc, p));
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
  tray.on('click', togglePanel); // left click: the pop-up panel; right click: the menu
  if (MAC) tray.on('right-click', () => trayMenu && tray.popUpContextMenu(trayMenu));
  setInterval(() => trayStatus(), 5000); // waits for an approval are also inferred from time passing
  registerKeys(); menu();
  let lastStatus = null;
  up = createUpdater({ log, notify, text: t, onChange: (u) => {
    if (u.status !== lastStatus || u.status === 'downloading') { lastStatus = u.status; menu(); }
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update', u);
  } });
  up.schedule(cfg.updates.check);
  menu();
  if (process.env.WALL_FONT) log('font import', addFont(process.env.WALL_FONT, process.env.WALL_FONT_SLOT || 'cjk')); // for testing: import this font file for a language
  if (/^(light|dark)$/.test(process.env.WALL_THEME || '')) nativeTheme.themeSource = process.env.WALL_THEME; // for testing: force a theme
  if (process.env.WALL_PANEL) setTimeout(togglePanel, 1500); // for testing: open the pop-up panel
  if (process.env.WALL_PEEK) setTimeout(togglePeek, 1500); // for testing: open the peek view
  if (process.env.WALL_SETTINGS) { // for testing; a page name (ai, look, usage, behave, privacy, keys) opens that page
    openSettings();
    const page = process.env.WALL_SETTINGS;
    if (page === 'look') setTimeout(async () => { try { log('settings fonts', await settingsWin.webContents.executeJavaScript(`[...document.querySelectorAll("select[data-font]")].map((s) => s.dataset.font + " " + [...s.querySelectorAll("optgroup")].map((g) => g.label + ": " + g.children.length).join(" / ")).join(" | ")`)); } catch {} }, 4000);
    if (/^[a-z]+$/.test(page)) settingsWin.webContents.once('did-finish-load', () => setTimeout(() => settingsWin.webContents.executeJavaScript(`document.querySelector('[data-tab=${page}]')?.click(); setTimeout(() => { const m = document.querySelector('main'); if (m && ${!!process.env.WALL_SETTINGS_END}) m.scrollTop = m.scrollHeight; }, 2500)`, true).catch(() => {}), 500));
  }
  if (process.env.WALL_TESTNOTIFY) setTimeout(() => notify('Agent Wallpaper', I18N.lang === 'en' ? 'Notifications are working.' : '通知可以正常显示。'), 3000);

  // follow the logs: react as soon as a log file changes (a slower poll stays as a safety net)
  let soon = null;
  for (const dir of [ROOT, path.join(CODEX, 'sessions'), path.join(GEMINI, 'tmp'), hooks.DIR]) {
    if (!fs.existsSync(dir)) continue;
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
      for (const x of [...wins.values()].slice(1)) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, `-screen-${x.id}.png`), (await x.win.webContents.capturePage()).toPNG());
      if (settingsWin && !settingsWin.isDestroyed()) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, '-settings.png'), (await settingsWin.webContents.capturePage()).toPNG());
      if (panelWin && !panelWin.isDestroyed()) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, '-panel.png'), (await panelWin.webContents.capturePage()).toPNG());
      if (peekWin && !peekWin.isDestroyed()) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, '-peek.png'), (await peekWin.webContents.capturePage()).toPNG());
      for (const [k, n] of [['work', 2], ['work', 5], ['approve', 4]]) fs.writeFileSync(process.env.WALL_CAPTURE.replace(/\.png$/, `-tray-${k}${n}.png`), trayImage(k, n).toPNG());
      if (process.env.WALL_REPORT) log('report', (await todayReport(process.env.WALL_REPORT)).file);
      log('captured', process.env.WALL_CAPTURE);
    } catch (e) { log('capture failed', String(e)); }
    if (process.env.WALL_EXIT) quit();
  }, Number(process.env.WALL_CAPTURE_AFTER || 6000));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (quitting) app.quit(); });
