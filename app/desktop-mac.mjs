// macOS: the window itself is made a desktop-level window (BrowserWindow type 'desktop'), which sits above the
// wallpaper and below Finder's desktop icons, so nothing has to be re-parented. This module answers the same
// questions as desktop-win.mjs: where the mouse is, whether its button is down, whether a click landed on the
// desktop, and whether the Claude app is running. Nothing in macOS settings is changed.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { screen } from 'electron';

const require = createRequire(import.meta.url);
let CG = null, OBJ = null, MAT = null;
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
    // the calls behind the panels' material (see panels below): one prototype per shape of message
    const msg = (ret, args) => objc.func('objc_msgSend', ret, ['void *', 'void *', ...args]);
    const rect = koffi.struct('AWRect', { x: 'double', y: 'double', w: 'double', h: 'double' });
    MAT = {
      decode: (buf) => koffi.decode(buf, 'void *'),
      long: msg('long', []), flag: msg('bool', []), at: msg('void *', ['long']), is: msg('bool', ['void *']), obj: msg('void *', ['void *']), text: msg('void *', ['str']),
      white: msg('void *', ['double', 'double']), setObj: msg('void', ['void *']), setNum: msg('void', ['long']), setReal: msg('void', ['double']),
      setFlag: msg('void', ['bool']), setRect: msg('void', [rect]), add: msg('void', ['void *', 'long', 'void *']),
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
// -a: macOS pgrep leaves out its own ancestors, so without it Claude is missed when this program was started from
// inside it (e.g. by Claude Code in the desktop app)
export function claudeDesktopRunning() {
  try { execFileSync('/usr/bin/pgrep', ['-a', '-x', 'Claude'], { timeout: 2000, stdio: 'ignore' }); return true; } catch { return false; }
}

// ---- the system's own material under each panel ----
// The page is transparent over the real wallpaper, and a page cannot blur what is behind its window. So the material
// is the system's: under the page, one native view per panel — the glass of the system's own widgets (NSGlassEffectView,
// macOS 26 and later) or the frosted NSVisualEffectView before that. The page says where its panels are (renderer.js)
// and draws only what is on them; the material follows whatever is behind the window, a moving wallpaper included.
const $ = (name) => OBJ.sel(name);
const glassClass = () => (process.env.WALL_NOGLASS ? null : OBJ.cls('NSGlassEffectView')); // WALL_NOGLASS: for testing the older material
let matBroken = false;
// which material the panels get: 'glass', 'frost' (before macOS 26), or '' when the page has to paint its own
export const material = () => (!OBJ || !MAT || matBroken || !OBJ.cls('NSVisualEffectView') ? '' : glassClass() ? 'glass' : 'frost');
const mats = new WeakMap(); // window -> { content, anchor, views }

function matView(light) {
  const dark = MAT.obj(OBJ.cls('NSAppearance'), $('appearanceNamed:'), MAT.text(OBJ.cls('NSString'), $('stringWithUTF8String:'), 'NSAppearanceNameDarkAqua'));
  const G = glassClass();
  const v = OBJ.send(OBJ.send(G || OBJ.cls('NSVisualEffectView'), $('alloc')), $('init'));
  if (G) {
    // clear glass with a dark tint; "light glass" in the settings is the regular glass, barely tinted. The tint only
    // darkens: the picture's colour still comes through, so the page lays a neutral wash over it (glass.css, --wash).
    if (!light) MAT.setNum(v, $('setStyle:'), 1);
    MAT.setObj(v, $('setTintColor:'), MAT.white(OBJ.cls('NSColor'), $('colorWithWhite:alpha:'), 0, light ? 0.2 : 0.55));
  } else {
    MAT.setNum(v, $('setMaterial:'), 13); MAT.setNum(v, $('setBlendingMode:'), 0); MAT.setNum(v, $('setState:'), 1); // HUD material, behind the window, always active
    MAT.setFlag(v, $('setWantsLayer:'), true);
  }
  MAT.setObj(v, $('setAppearance:'), dark);
  return { v, glass: !!G, light, r: -1, k: '' };
}
function setRadius(m, r) {
  if (m.r === r) return;
  m.r = r;
  if (m.glass) return MAT.setReal(m.v, $('setCornerRadius:'), r);
  const layer = OBJ.send(m.v, $('layer'));
  if (layer) { MAT.setReal(layer, $('setCornerRadius:'), r); MAT.setFlag(layer, $('setMasksToBounds:'), true); }
}
// list: [{ x, y, w, h, r, a }] in the window's own points, y from the top; a is the panel's opacity
export function panels(win, list, opts = {}) {
  if (!material() || !win || win.isDestroyed()) return false;
  try {
    let st = mats.get(win);
    if (!st) {
      const content = OBJ.send(OBJ.send(MAT.decode(win.getNativeWindowHandle()), $('window')), $('contentView'));
      if (!content) return false;
      // a window with a material of its own (the peek view) keeps that one at the very back; the panels go just above it
      const subs = OBJ.send(content, $('subviews')), n = MAT.long(subs, $('count')), vev = OBJ.cls('NSVisualEffectView');
      let anchor = null;
      for (let i = 0; i < n; i++) { const s = MAT.at(subs, $('objectAtIndex:'), i); if (MAT.is(s, $('isKindOfClass:'), vev)) anchor = s; }
      st = { content, anchor, views: [], flipped: MAT.flag(content, $('isFlipped')) };
      mats.set(win, st);
      win.once('closed', () => { for (const m of st.views) { try { OBJ.send(m.v, $('release')); } catch {} } st.views = []; });
    }
    const H = win.getContentSize()[1], light = !!opts.light;
    if (st.views.length && st.views[0].light !== light) { for (const m of st.views) { OBJ.send(m.v, $('removeFromSuperview')); OBJ.send(m.v, $('release')); } st.views = []; }
    list.forEach((p, i) => {
      let m = st.views[i];
      if (!m) {
        m = st.views[i] = matView(light);
        MAT.add(st.content, $('addSubview:positioned:relativeTo:'), m.v, st.anchor ? 1 : -1, st.anchor);
      }
      const k = [p.x, p.y, p.w, p.h, p.a, H].join(' ');
      setRadius(m, p.r);
      if (m.k !== k) {
        m.k = k;
        MAT.setRect(m.v, $('setFrame:'), { x: p.x, y: st.flipped ? p.y : H - p.y - p.h, w: p.w, h: p.h });
        MAT.setReal(m.v, $('setAlphaValue:'), p.a);
        MAT.setFlag(m.v, $('setHidden:'), false);
      }
    });
    for (let i = list.length; i < st.views.length; i++) { const m = st.views[i]; if (m.k !== '') { m.k = ''; MAT.setFlag(m.v, $('setHidden:'), true); } }
    return true;
  } catch { matBroken = true; return false; }
}
