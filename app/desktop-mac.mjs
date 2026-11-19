// macOS: the window itself is made a desktop-level window (BrowserWindow type 'desktop'), which sits above the
// wallpaper and below Finder's desktop icons, so nothing has to be re-parented. This module answers the same
// questions as desktop-win.mjs: where the mouse is, whether its button is down, whether a click landed on the
// desktop, and whether the Claude app is running. Nothing in macOS settings is changed.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { screen } from 'electron';

const require = createRequire(import.meta.url);
let CG = null, OBJ = null;
try {
  const koffi = require('koffi');
  try {
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    // the left button's state, read from the combined session (no Accessibility permission needed)
    CG = { buttonState: cg.func('bool CGEventSourceButtonState(int32_t state, uint32_t button)') };
  } catch {}
  try {
    const objc = koffi.load('/usr/lib/libobjc.A.dylib');
    OBJ = {
      cls: objc.func('void *objc_getClass(const char *name)'),
      sel: objc.func('void *sel_registerName(const char *name)'),
      send: objc.func('objc_msgSend', 'void *', ['void *', 'void *']),
      str: objc.func('objc_msgSend', 'const char *', ['void *', 'void *']),
    };
  } catch {}
} catch {}

// nothing to attach: the window is created at desktop level
export const hwndOf = () => 0;
export const attach = () => ({ ok: true, mode: 'mac-desktop' });
export const place = () => {};
export const attached = () => true;
export const detach = () => {};
export const info = () => ({ mode: 'mac-desktop' });
export const stack = () => null;
export const covered = () => false;
export const virtualOrigin = () => ({ x: 0, y: 0 });
// the window is transparent over the real wallpaper, so the glass is always the tinted kind
export const liveWallpaper = () => true;

export const leftDown = () => { try { return !!(CG && CG.buttonState(0, 0)); } catch { return false; } };
// in points, the same units the windows are laid out in on macOS
export function cursor() { const p = screen.getCursorScreenPoint(); return { x: p.x, y: p.y }; }

// the desktop belongs to Finder: a click counts for the wallpaper only while Finder is the frontmost app
function frontmost() {
  if (!OBJ) return '';
  try {
    const ws = OBJ.send(OBJ.cls('NSWorkspace'), OBJ.sel('sharedWorkspace'));
    const app = ws && OBJ.send(ws, OBJ.sel('frontmostApplication'));
    const id = app && OBJ.send(app, OBJ.sel('bundleIdentifier'));
    return id ? OBJ.str(id, OBJ.sel('UTF8String')) || '' : '';
  } catch { return ''; }
}
export const desktopUnder = () => frontmost() === 'com.apple.finder';

// is the Claude desktop app running? (not the `claude` command-line tool)
export function claudeDesktopRunning() {
  try { execFileSync('/usr/bin/pgrep', ['-x', 'Claude'], { timeout: 2000, stdio: 'ignore' }); return true; } catch { return false; }
}
