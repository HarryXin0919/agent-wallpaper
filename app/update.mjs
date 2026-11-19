// Updates from GitHub Releases (only github.com is contacted, and only to read the release list and download).
// The installed Windows build downloads a new version in the background and installs it when the program quits,
// or at once from the tray. The portable Windows build and the macOS build cannot replace themselves (no installer;
// macOS updates need a signed app), so they only say a new version is out and open the download page.
import { app, shell } from 'electron';
import { createRequire } from 'node:module';
import updater from 'electron-updater';

const { autoUpdater } = updater;
export const PAGE = 'https://github.com/HarryXin0919/agent-wallpaper/releases/latest';
const EVERY = 6 * 3600e3;

export function createUpdater({ log, notify, onChange, text }) {
  // WALL_UPDATE_TEST=<version>: run from source, pretend to be that version, check the real releases, download nothing
  const test = process.env.WALL_UPDATE_TEST;
  const canInstall = !test && process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  const active = app.isPackaged || !!test;
  const state = { status: active ? 'idle' : 'source', version: null, percent: 0, error: null, checkedAt: 0, canInstall };
  const set = (patch) => { Object.assign(state, patch); onChange({ ...state, current: String(autoUpdater.currentVersion || app.getVersion()) }); };
  let manual = false, timer = null;

  autoUpdater.logger = null;
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.allowPrerelease = false;
  // the installed Windows build reads where to look from app-update.yml (written by the installer build); the
  // others only check, so they are told directly (a portable build has no such file)
  if (!canInstall && active) autoUpdater.setFeedURL({ provider: 'github', owner: 'HarryXin0919', repo: 'agent-wallpaper' });
  if (test) {
    autoUpdater.forceDevUpdateConfig = true;
    const req = createRequire(import.meta.url);
    const semver = createRequire(req.resolve('electron-updater'))('semver'); // the copy electron-updater itself uses
    autoUpdater.currentVersion = semver.parse(test);
  }

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => { set({ status: 'latest', checkedAt: Date.now() }); if (manual) notify(text().upLatestTitle, text().upLatest(app.getVersion())); manual = false; });
  autoUpdater.on('update-available', (info) => {
    set({ status: canInstall ? 'downloading' : 'available', version: info.version, percent: 0, checkedAt: Date.now() });
    log('update available', info.version);
    if (!canInstall) notify(text().upAvailTitle(info.version), text().upAvail, openPage);
    manual = false;
  });
  autoUpdater.on('download-progress', (p) => set({ percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version, percent: 100 });
    log('update downloaded', info.version);
    notify(text().upReadyTitle(info.version), text().upReady, install);
  });
  autoUpdater.on('error', (e) => {
    log('update failed', String(e && e.message || e));
    set({ status: 'error', error: String(e && e.message || e).split('\n')[0].slice(0, 160), checkedAt: Date.now() });
    if (manual) notify(text().upErrTitle, text().upErr);
    manual = false;
  });

  function check(byHand = false) {
    if (!active) return;
    if (['checking', 'downloading', 'ready'].includes(state.status)) return;
    manual = byHand;
    autoUpdater.checkForUpdates().catch(() => {}); // failures arrive as the 'error' event
  }
  function install() { if (state.status === 'ready') { log('installing update', state.version); autoUpdater.quitAndInstall(true, true); } }
  function openPage() { shell.openExternal(PAGE).catch(() => {}); }
  // automatic checks: a minute after start, then every 6 hours, while the setting is on
  function schedule(on) {
    clearTimeout(timer); timer = null;
    if (!on || !active) return;
    const next = () => { check(false); timer = setTimeout(next, EVERY); };
    timer = setTimeout(next, test ? 3000 : 60e3);
  }
  return { state: () => ({ ...state, current: String(autoUpdater.currentVersion || app.getVersion()) }), check, install, openPage, schedule };
}
