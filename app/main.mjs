// Claude wallpaper: a window behind the desktop icons that draws what Claude Code is doing.
// Reads ~/.claude/projects (read-only). No network: every request that is not a local file is blocked.
import { app, BrowserWindow, Tray, Menu, globalShortcut, screen, nativeImage, session, ipcMain, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { Live } from '../src/live.mjs';
import { CodexLive } from '../src/codex.mjs';
import { Ledger, estimate } from '../src/estimate.mjs';
import * as desk from './desktop.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.WALL_ROOT || path.join(os.homedir(), '.claude', 'projects');
const CODEX = process.env.WALL_CODEX || path.join(os.homedir(), '.codex');
const KEYS = { show: 'Ctrl+Alt+Shift+W', pause: 'Ctrl+Alt+Shift+P', text: 'Ctrl+Alt+Shift+H', quit: 'Ctrl+Alt+Shift+Q' };

// keep Electron's own working files inside this folder, and keep it quiet
app.setName('Claude 壁纸');
app.setPath('userData', path.join(here, '..', '.runtime'));
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,MediaRouter,Translate,AutofillServerCommunication');
app.commandLine.appendSwitch('disable-background-networking');
for (const f of (process.env.WALL_FLAGS || '').split(',').filter(Boolean)) app.commandLine.appendSwitch(f); // for testing
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, quitting = false, paused = false, showText = !process.env.WALL_NOTEXT, coveredNow = false, attachInfo = null;
const live = new Live(ROOT, { hours: 12 });
const codex = new CodexLive(CODEX, { hours: 12 }); // Codex threads, drawn the same way in their own color
const ledger = new Ledger(ROOT, 5);                 // Claude replies of the last days, for the quota estimate
const snapAll = () => [...live.snapshot(), ...codex.snapshot()].sort((a, b) => b.last - a.last);
const pollAll = () => { const a = live.poll(), b = codex.poll(); if (b) codexUsage(); return a || b; };

// Three ways to sit behind the icons. Windows versions differ, so if the picture does not show,
// the tray menu can switch to the next one. The choice is remembered in this program's own folder.
const PLACES = [
  { name: '方式一', layered: true, inWorker: false },
  { name: '方式二', layered: false, inWorker: false },
  { name: '方式三', layered: false, inWorker: true },
];
const PREFS = path.join(app.getPath('userData'), 'prefs.json');
let place = 0;
try { place = JSON.parse(fs.readFileSync(PREFS, 'utf8')).place || 0; } catch {}
if (process.env.WALL_PLACE) place = Number(process.env.WALL_PLACE);
place = Math.max(0, Math.min(PLACES.length - 1, place));
function nextPlace() {
  place = (place + 1) % PLACES.length;
  try { fs.mkdirSync(path.dirname(PREFS), { recursive: true }); fs.writeFileSync(PREFS, JSON.stringify({ place })); } catch {}
  menu();
  if (win && !win.isDestroyed()) { try { desk.detach(desk.hwndOf(win.getNativeWindowHandle())); } catch {} win.destroy(); } // 'closed' builds a new one
}

function screenRect() {
  const d = screen.getPrimaryDisplay();
  const f = d.scaleFactor;
  return { x: Math.round(d.bounds.x * f), y: Math.round(d.bounds.y * f), w: Math.round(d.bounds.width * f), h: Math.round(d.bounds.height * f), dip: d.bounds };
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

// --- your own wallpaper, read from the copy Windows keeps (read-only) ---
const WALL_FILE = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
let wallpaper = null, wallMtime = 0;
function readWallpaper() {
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

// --- where the desktop icons are, so the panels never sit under them ---
// A small PowerShell helper reads them through UI Automation; while the PC is locked it cannot, and the
// last known layout (or an estimate from the number of desktop items) is used instead.
let icons = null, iconsKey = '', iconsReal = false, helper = null, helperBuf = '';
function estimateIcons() {
  const d = screen.getPrimaryDisplay().bounds;
  let n = 2;
  for (const dir of [path.join(os.homedir(), 'Desktop'), 'C:/Users/Public/Desktop']) { try { n += fs.readdirSync(dir).filter((f) => !/^desktop\.ini$/i.test(f) && !/^~\$/.test(f)).length; } catch {} }
  const rows = Math.max(1, Math.floor((d.height - 56) / 100));
  return Array.from({ length: n }, (_, i) => ({ x: 4 + Math.floor(i / rows) * 80, y: 6 + (i % rows) * 100, w: 74, h: 90 }));
}
function startHelper() {
  try {
    helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'icons.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
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
  let list = null;
  if (j.ok) {
    // positions are real pixels from the virtual screen's corner; the page works in CSS pixels of the main screen
    const f = screen.getPrimaryDisplay().scaleFactor, pr = screenRect(), v = desk.virtualOrigin();
    list = (j.r || '').split(';').filter(Boolean).map((t) => t.split(',').map(Number))
      .map(([x, y, w, h]) => ({ x: (x + v.x - pr.x) / f, y: (y + v.y - pr.y) / f, w: w / f, h: h / f }))
      .filter((r) => r.x + r.w > 0 && r.y + r.h > 0 && r.x < pr.dip.width && r.y < pr.dip.height);
    iconsReal = true;
  } else if (!iconsReal) list = estimateIcons();
  if (!list) return;
  const k = JSON.stringify(list.map((r) => [Math.round(r.x), Math.round(r.y)]));
  if (k !== iconsKey) { iconsKey = k; icons = list; send('icons', icons); log('icons', { real: iconsReal, n: list.length }); }
}
// cleared sessions stay hidden until they do something new (remembered in this program's own folder)
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
function pushData() { send('data', visibleSnap()); }

// --- plan usage and token use (local only) ---
// Quota: a usage service on this computer (127.0.0.1:8787, e.g. the ClaudeOrb proxy) has live percentages and reset
// times while its sign-in works; otherwise the Claude app's own record (plan-usage-history.json) is used.
// Today's and this week's tokens come from the same service, which counts them from the logs.
const PLAN_FILE = path.join(process.env.APPDATA || '', 'Claude', 'plan-usage-history.json');
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
    // a 5-hour figure older than 5 hours is stale: that window has reset since
    if (s) u.plan = { fh: Date.now() - s.t > 5 * 3600e3 ? 0 : s.u.fh, sd: s.u.sd, t: s.t, src: 'app' };
    // between the app's readings: the last reading plus the tokens used since, converted with what one percent
    // has been worth in the app's own past readings
    await ledger.refresh();
    const e = estimate(d.samples || [], ledger, Date.now());
    if (e) u.plan = { fh: e.fh, sd: e.sd, fhReset: e.fhReset, sdReset: e.sdReset, t: e.t, src: 'est' };
  } catch (err) { log('estimate failed', String(err)); }
  const p = await getLocal(8787, '/usage', 25000);
  if (p) {
    if (p.tok_today != null) u.today = { tok: p.tok_today, out: p.tok_today_out, cost: p.cost_today_usd };
    if (p.week_tok != null) u.week = { tok: p.week_tok, cost: p.cost_7d_usd, days: p.tok_7d };
    if (p.ok && p.session_pct != null && p.limits_source !== 'app') u.plan = { fh: p.session_pct, sd: p.week_pct, fhReset: p.session_reset_s, sdReset: p.week_reset_s, sonnet: p.sonnet_pct, opus: p.opus_pct, t: (p.ts || Date.now() / 1000) * 1000, src: 'live' };
    else if (!p.ok && p.err) u.serviceErr = 'error';
  } else u.serviceErr = 'down';
  u.codex = codexNow();
  usage = u; usageBusy = false; send('usage', usage); log('usage', { plan: u.plan && u.plan.src, today: !!u.today, err: u.serviceErr });
}

// Codex quota and today's tokens, straight from its logs (it records its limits with every reply)
function codexNow() {
  const r = codex.rate(); if (!r) return null;
  const win = (w) => {
    if (!w || w.used_percent == null) return null;
    const reset = w.resets_at ? w.resets_at * 1000 : null, over = reset && reset <= Date.now();
    return { pct: over ? 0 : w.used_percent, resetS: reset && !over ? (reset - Date.now()) / 1000 : null, mins: w.window_minutes };
  };
  const ws = [win(r.primary), win(r.secondary)].filter(Boolean);
  return { week: ws.find((w) => w.mins >= 1440) || null, short: ws.find((w) => w.mins < 1440) || null, t: r.t, today: codex.today() };
}
let codexSent = '';
function codexUsage() { if (!usage) return; usage.codex = codexNow(); const k = JSON.stringify(usage.codex && [usage.codex.week, usage.codex.short, usage.codex.today]); if (k !== codexSent) { codexSent = k; send('usage', usage); } }

// --- clicking a card opens that session in the Claude desktop app ---
// The app keeps one small file per session linking the log's id to its own local_… id (read-only here).
const SESS_DIR = path.join(process.env.APPDATA || '', 'Claude', 'claude-code-sessions');
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
function openSession(cliId) {
  if (cliId.startsWith('cx:')) { const url = `codex://threads/${encodeURIComponent(cliId.slice(3))}`; log('open', { url }); shell.openExternal(url).catch((e) => log('open failed', String(e))); return; }
  if (!sessMap.has(cliId) || Date.now() - sessAt > 30000) loadSessions();
  const local = sessMap.get(cliId);
  const url = local ? `claude://code/continue?session=${encodeURIComponent(local)}&source=wallpaper` : 'claude://code/needs-input?source=wallpaper';
  log('open', { cliId, local, url });
  shell.openExternal(url).catch((e) => log('open failed', String(e)));
}
// Clicks are seen by polling the left button and the cursor (no system-wide hook). Only a press and release on a
// card, with the desktop itself under the cursor, counts — clicks in other apps and on icons are ignored.
let targets = [], hoverId = null, pressId = null;
ipcMain.on('targets', (_e, list) => { targets = Array.isArray(list) ? list : []; log('targets', targets.map((t) => [t.id.slice(0, 8), Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)])); });
function targetAt(p) {
  const f = screen.getPrimaryDisplay().scaleFactor, pr = screenRect();
  const x = (p.x - pr.x) / f, y = (p.y - pr.y) / f;
  // the smallest target under the cursor wins (an × sits inside its card)
  return targets.filter((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h).sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
}
function pollMouse() {
  if (!win || win.isDestroyed() || !shown || coveredNow || !targets.length) { if (hoverId) { hoverId = null; send('hover', null); } return; }
  const p = desk.cursor(), t = targetAt(p), onDesk = t ? desk.desktopUnder(p) : false;
  const id = t && onDesk ? t.id : null;
  if (id !== hoverId) { hoverId = id; send('hover', id); }
  const down = desk.leftDown();
  if (down && pressId === null) pressId = id || '';
  if (!down && pressId !== null) { if (pressId && pressId === id) { if (id.startsWith('x|')) dismiss([id.slice(2)]); else openSession(id); } pressId = null; }
}
function pushState() { send('state', { paused, text: showText, covered: coveredNow }); }

function createWindow() {
  const r = screenRect();
  win = new BrowserWindow({
    x: r.dip.x, y: r.dip.y, width: r.dip.width, height: r.dip.height,
    frame: false, show: false, skipTaskbar: true, focusable: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, hasShadow: false, transparent: true, backgroundColor: '#00000000', title: 'Claude 壁纸',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.setMenu(null);
  win.loadFile(path.join(here, 'index.html'));
  if (process.env.WALL_LOG) win.webContents.on('console-message', (e) => log('page', e.level, e.message, (e.sourceId || '').split('/').pop() + ':' + e.lineNumber));
  win.once('ready-to-show', () => {
    attachInfo = desk.attach(desk.hwndOf(win.getNativeWindowHandle()), screenRect(), PLACES[place]);
    log('attach', attachInfo);
    win.showInactive();
    // Electron trims its old frame from the size once shown; set the full size again
    for (const ms of [200, 1200]) setTimeout(() => { if (win && !win.isDestroyed()) desk.place(desk.hwndOf(win.getNativeWindowHandle()), screenRect()); }, ms);
    pushState(); pushData();
    if (wallpaper) send('wallpaper', wallpaper);
    if (icons) send('icons', icons);
    if (usage) send('usage', usage);
  });
  win.on('closed', () => { win = null; targets = []; if (!quitting && shown) setTimeout(createWindow, 800); });
}

function log(...a) { if (process.env.WALL_LOG) console.log(new Date().toISOString(), ...a.map((x) => typeof x === 'string' ? x : JSON.stringify(x))); }

function setPaused(v) { paused = v; pushState(); menu(); if (!paused && pollAll()) pushData(); }
// show / hide: hiding closes the drawing window entirely (frees its memory); the program keeps running in the tray
let shown = true;
function setShown(v) {
  shown = v; menu();
  if (shown) { if (!win) createWindow(); }
  else if (win && !win.isDestroyed()) { try { desk.detach(desk.hwndOf(win.getNativeWindowHandle())); } catch {} win.destroy(); }
}
function setText(v) { showText = v; pushState(); menu(); }
function quit() {
  quitting = true;
  try { if (helper) helper.kill(); } catch {}
  try { if (win && !win.isDestroyed()) desk.detach(desk.hwndOf(win.getNativeWindowHandle())); } catch {}
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
}

function menu() {
  if (!tray) return;
  tray.setToolTip(!shown ? 'Claude 壁纸（已隐藏，单击显示）' : paused ? 'Claude 壁纸（已暂停）' : 'Claude 壁纸（单击隐藏）');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: shown ? '隐藏壁纸' : '显示壁纸', accelerator: KEYS.show, registerAccelerator: false, click: () => setShown(!shown) },
    { label: '清除已完成的会话', click: () => send('clearDone') },
    { label: '恢复已清除的会话', enabled: Object.keys(dismissed).length > 0, click: () => { dismissed = {}; try { fs.writeFileSync(DISMISSED, '{}'); } catch {} pushData(); menu(); } },
    { type: 'separator' },
    { label: paused ? '继续' : '暂停', accelerator: KEYS.pause, registerAccelerator: false, click: () => setPaused(!paused) },
    { label: showText ? '隐藏文字' : '显示文字', accelerator: KEYS.text, registerAccelerator: false, click: () => setText(!showText) },
    { type: 'separator' },
    { label: `看不到画面？换一种显示方式（现在：${PLACES[place].name}）`, click: nextPlace },
    { type: 'separator' },
    { label: '退出', accelerator: KEYS.quit, registerAccelerator: false, click: quit },
  ]));
}

app.whenReady().then(() => {
  // no network at all: only local files may load
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { const block = !/^(file|devtools|data|blob|chrome-extension):/.test(d.url); if (block) log('blocked', d.url); cb({ cancel: block }); });
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));

  live.scan(); codex.scan(); pollAll();
  readWallpaper();
  icons = estimateIcons();
  ipcMain.handle('hello', () => ({ data: visibleSnap(), state: { paused, text: showText, covered: coveredNow }, icons, wallpaper, usage }));
  refreshUsage(); setInterval(() => { if (!paused) refreshUsage(); }, 60000);
  startHelper();
  setInterval(() => { if (helper && !paused) helper.stdin.write('scan' + String.fromCharCode(10)); }, 30000);
  // a live wallpaper program (e.g. Wallpaper Engine) may start or stop; the glass style follows it
  setInterval(() => { const live = desk.liveWallpaper(); if (readWallpaper() || (wallpaper && wallpaper.live !== live)) { wallpaper.live = live; send('wallpaper', wallpaper); } }, 20000);
  createWindow();

  tray = new Tray(nativeImage.createFromPath(path.join(here, '..', 'assets', 'tray.png')));
  tray.on('click', () => setShown(!shown)); // left click: on / off; right click: the menu
  menu();
  const keys = [globalShortcut.register(KEYS.show, () => setShown(!shown)), globalShortcut.register(KEYS.pause, () => setPaused(!paused)), globalShortcut.register(KEYS.text, () => setText(!showText)), globalShortcut.register(KEYS.quit, quit)];
  log('shortcuts registered', keys);

  // follow the logs: react as soon as a log file changes (a slower poll stays as a safety net)
  let soon = null;
  for (const dir of [ROOT, path.join(CODEX, 'sessions')]) {
    try { fs.watch(dir, { recursive: true }, (_ev, f) => { if (!f || !/\.jsonl$/.test(f) || paused || soon) return; soon = setTimeout(() => { soon = null; if (pollAll()) pushData(); }, 120); }); } catch (e) { log('watch failed', dir, String(e)); }
  }
  setInterval(() => { if (!paused && pollAll()) pushData(); }, 2000);
  setInterval(pollMouse, 50);
  loadSessions();
  // close together with the Claude desktop app (once it has been seen running)
  let seenClaude = false, missing = 0;
  if (!process.env.WALL_NOFOLLOW) setInterval(() => {
    if (desk.claudeDesktopRunning()) { seenClaude = true; missing = 0; return; }
    if (seenClaude && ++missing >= 2) { log('Claude closed: quitting'); quit(); }
  }, 4000);
  setInterval(() => { if (!paused) pushData(); }, 20000); // safety net
  // stay behind the icons (Explorer restarts), and rest while a full-screen window hides the desktop
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const h = desk.hwndOf(win.getNativeWindowHandle());
    if (!desk.attached(h)) { attachInfo = desk.attach(h, screenRect(), PLACES[place]); log('reattach', attachInfo); }
    const c = process.env.WALL_UNCOVERED ? false : desk.covered(screenRect());
    if (c !== coveredNow) { coveredNow = c; pushState(); }
  }, 2500);
  screen.on('display-metrics-changed', () => { if (win && !win.isDestroyed()) { const r = screenRect(); win.setBounds(r.dip); desk.place(desk.hwndOf(win.getNativeWindowHandle()), r); } });

  // test hook: save what the window shows after a few seconds
  if (process.env.WALL_CAPTURE) setTimeout(async () => {
    try {
      log('desk', desk.info());
      log('page state', await win.webContents.executeJavaScript('JSON.stringify(window.__dbg && window.__dbg())'));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.WALL_CAPTURE, img.toPNG());
      log('captured', { file: process.env.WALL_CAPTURE, stack: desk.stack(), attach: attachInfo, mine: desk.hwndOf(win.getNativeWindowHandle()) });
    } catch (e) { log('capture failed', String(e)); }
    if (process.env.WALL_EXIT) quit();
  }, Number(process.env.WALL_CAPTURE_AFTER || 6000));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (quitting) app.quit(); });
