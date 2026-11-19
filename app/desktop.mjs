// Puts a window between the desktop wallpaper and the desktop icons, using plain Win32 calls.
// Nothing is changed in Windows settings; on exit the window is simply taken away again.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const RECT = koffi.struct('RECT', { left: 'int', top: 'int', right: 'int', bottom: 'int' });
const POINT = koffi.struct('POINT', { x: 'int', y: 'int' });
const EnumProc = koffi.proto('bool __stdcall EnumProc(intptr_t hwnd, intptr_t lparam)');
const W = {
  FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)'),
  FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *name)'),
  SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'),
  SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
  GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
  SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
  GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
  SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
  SetLayeredWindowAttributes: user32.func('bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)'),
  IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
  IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
  IsZoomed: user32.func('bool __stdcall IsZoomed(intptr_t hwnd)'),
  GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
  GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
  GetClientRect: user32.func('bool __stdcall GetClientRect(intptr_t hwnd, _Out_ RECT *rect)'),
  ClientToScreen: user32.func('bool __stdcall ClientToScreen(intptr_t hwnd, _Inout_ POINT *pt)'),
  GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
  EnumWindows: user32.func('bool __stdcall EnumWindows(EnumProc *cb, intptr_t lparam)'),
  GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
  RedrawWindow: user32.func('bool __stdcall RedrawWindow(intptr_t hwnd, void *rect, void *rgn, uint32_t flags)'),
};

const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
const WS_EX_APPWINDOW = 0x00040000, WS_EX_TOOLWINDOW = 0x00000080, WS_EX_NOACTIVATE = 0x08000000, WS_EX_LAYERED = 0x00080000;
const SWP_NOSIZE = 1, SWP_NOMOVE = 2, SWP_NOZORDER = 4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40;

export const hwndOf = (buf) => Number(buf.readBigUInt64LE(0));
export function className(h) {
  const buf = Buffer.alloc(512);
  const n = W.GetClassNameW(h, buf, 256);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

// the window Explorer draws the wallpaper in, and where the icons are
function findDesktop() {
  const progman = W.FindWindowW('Progman', null);
  const out = [0];
  // ask Explorer to create the wallpaper layer if it has not yet
  W.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, 0, 1000, out);
  W.SendMessageTimeoutW(progman, 0x052C, 0, 0, 0, 1000, out);
  const defView = W.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  if (defView) {
    // Windows 11 24H2 and later: icons and wallpaper both live inside Progman
    return { mode: 'raised', parent: progman, defView, worker: W.FindWindowExW(progman, 0, 'WorkerW', null) };
  }
  // earlier Windows: the wallpaper is a separate WorkerW behind the one holding the icons
  let worker = 0;
  W.EnumWindows((h) => {
    if (W.FindWindowExW(h, 0, 'SHELLDLL_DefView', null)) worker = W.FindWindowExW(0, h, 'WorkerW', null);
    return true;
  }, 0);
  return { mode: 'classic', parent: worker, defView: 0, worker };
}

// one entry per wallpaper window (one per screen)
const wins = new Map();
export function attach(hwnd, rect, opts = {}) {
  const d = findDesktop();
  if (!d.parent) return { ok: false, why: 'desktop window not found' };
  let style = Number(W.GetWindowLongPtrW(hwnd, GWL_STYLE));
  style = (style & ~WS_POPUP) | WS_CHILD; // keep the frame flags: Chromium sizes its frameless client area from them
  W.SetWindowLongPtrW(hwnd, GWL_STYLE, style >>> 0);
  let ex = Number(W.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  ex = (ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
  if (opts.layered) ex |= WS_EX_LAYERED;
  W.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex >>> 0);
  if (opts.layered) W.SetLayeredWindowAttributes(hwnd, 0, 255, 2);
  // newer desktop: sit inside the WorkerW that paints the wallpaper (it is below the icons)
  if (d.mode === 'raised' && d.worker && opts.inWorker) { d.mode = 'raised-worker'; d.parent = d.worker; }
  W.SetParent(hwnd, d.parent);
  const vx = W.GetSystemMetrics(76), vy = W.GetSystemMetrics(77); // the parent spans the whole virtual screen
  const x = rect.x - vx, y = rect.y - vy;
  if (d.mode === 'raised') {
    W.SetWindowPos(hwnd, d.defView, x, y, rect.w, rect.h, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW); // just below the icons
    if (d.worker) W.SetWindowPos(d.worker, hwnd, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);   // wallpaper below us
  } else {
    W.SetWindowPos(hwnd, 0, x, y, rect.w, rect.h, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
  }
  wins.set(Number(hwnd), { hwnd, ...d, rect });
  place(hwnd, rect);
  return { ok: true, mode: d.mode, parent: d.parent, defView: d.defView, worker: d.worker };
}

// Size the window so its drawable area (not counting any border Windows still gives it) covers the screen.
export function place(hwnd, rect) {
  const current = wins.get(Number(hwnd));
  if (!current) return;
  const vx = W.GetSystemMetrics(76), vy = W.GetSystemMetrics(77);
  const after = current.mode === 'raised' ? current.defView : 0, flags = SWP_NOACTIVATE | (current.mode === 'raised' ? 0 : SWP_NOZORDER);
  let x = rect.x - vx, y = rect.y - vy, w = rect.w, h = rect.h;
  W.SetWindowPos(hwnd, after, x, y, w, h, flags);
  const wr = {}, cr = {}, pt = { x: 0, y: 0 };
  if (W.GetWindowRect(hwnd, wr) && W.GetClientRect(hwnd, cr) && W.ClientToScreen(hwnd, pt)) {
    const l = pt.x - wr.left, t = pt.y - wr.top, r = wr.right - (pt.x + cr.right), b = wr.bottom - (pt.y + cr.bottom);
    if (l || t || r || b) W.SetWindowPos(hwnd, after, x - l, y - t, w + l + r, h + t + b, flags);
    current.insets = { l, t, r, b };
  }
  current.rect = rect;
}
export const info = (hwnd) => { const c = hwnd ? wins.get(Number(hwnd)) : [...wins.values()][0]; return c && { mode: c.mode, insets: c.insets }; };

// still sitting where we put it? (Explorer restarts take the desktop windows away)
export function attached(hwnd) {
  const current = wins.get(Number(hwnd));
  return !!current && W.IsWindow(hwnd) && W.IsWindow(current.parent) && Number(W.GetParent(hwnd)) === Number(current.parent);
}

export function detach(hwnd) {
  const current = wins.get(Number(hwnd));
  if (W.IsWindow(hwnd)) W.SetParent(hwnd, 0);
  if (current && W.IsWindow(current.parent)) W.RedrawWindow(current.parent, null, null, 0x1 | 0x4 | 0x80 | 0x100); // invalidate, erase, allchildren, updatenow
  wins.delete(Number(hwnd));
}

// is a full-screen or maximised window covering the desktop? then there is no need to animate
export function covered(screenRect) {
  const fg = W.GetForegroundWindow();
  if (!fg) return false;
  const cls = className(fg);
  if (/^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd|NotifyIconOverflowWindow|TopLevelWindowForOverflowXamlIsland)$/.test(cls)) return false;
  if (W.IsZoomed(fg)) return true;
  const r = {};
  if (!W.GetWindowRect(fg, r)) return false;
  return r.left <= screenRect.x + 2 && r.top <= screenRect.y + 2 && r.right >= screenRect.x + screenRect.w - 2 && r.bottom >= screenRect.y + screenRect.h - 2;
}

// for checking: Progman's children from top to bottom
export function stack() {
  const progman = W.FindWindowW('Progman', null);
  const out = [];
  let h = W.GetWindow(progman, 5); // GW_CHILD
  while (h) { out.push({ hwnd: Number(h), cls: className(h), visible: W.IsWindowVisible(h) }); h = W.GetWindow(h, 2); } // GW_HWNDNEXT
  return { progman: Number(progman), children: out };
}

// the virtual screen's top-left corner, in real pixels (desktop icon positions are relative to it)
export const virtualOrigin = () => ({ x: W.GetSystemMetrics(76), y: W.GetSystemMetrics(77) });

// is a live wallpaper program drawing on the wallpaper layer? (Wallpaper Engine and similar put their windows there)
export function liveWallpaper() {
  const progman = W.FindWindowW('Progman', null);
  let worker = W.FindWindowExW(progman, 0, 'WorkerW', null);
  if (!worker) W.EnumWindows((h) => { if (W.FindWindowExW(h, 0, 'SHELLDLL_DefView', null)) worker = W.FindWindowExW(0, h, 'WorkerW', null); return true; }, 0);
  if (!worker) return false;
  let h = 0;
  while ((h = W.FindWindowExW(worker, h, null, null))) if (W.IsWindowVisible(h) && !wins.has(Number(h))) return true;
  return false;
}


// --- mouse, for clicking the cards (polled, no hook: only the left button state and the cursor position) ---
const kernel32 = koffi.load('kernel32.dll');
const X = {
  GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)'),
  GetCursorPos: user32.func('bool __stdcall GetCursorPos(_Out_ POINT *p)'),
  GetAncestor: user32.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)'),
  WindowFromPoint: user32.func('intptr_t __stdcall WindowFromPoint(POINT p)'),
  OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
  CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
  QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)'),
  CreateToolhelp32Snapshot: kernel32.func('intptr_t __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
  Process32FirstW: kernel32.func('bool __stdcall Process32FirstW(intptr_t snap, _Inout_ uint8_t *entry)'),
  Process32NextW: kernel32.func('bool __stdcall Process32NextW(intptr_t snap, _Inout_ uint8_t *entry)'),
};
export const leftDown = () => (X.GetAsyncKeyState(0x01) & 0x8000) !== 0;
export function cursor() { const p = {}; X.GetCursorPos(p); return { x: p.x, y: p.y }; }
// is the desktop itself under the cursor? (so a click there is meant for the wallpaper, not another app)
export function desktopUnder(p) {
  const h = X.WindowFromPoint({ x: p.x, y: p.y });
  if (!h) return false;
  const top = X.GetAncestor(h, 2); // GA_ROOT
  return /^(Progman|WorkerW)$/.test(className(top));
}

// --- is the Claude desktop app running? (not the claude.exe command-line sessions) ---
export function claudeDesktopRunning() {
  const snap = X.CreateToolhelp32Snapshot(0x2, 0);
  if (!snap || snap === -1) return true; // cannot tell: assume yes
  const SZ = 568, entry = Buffer.alloc(SZ); entry.writeUInt32LE(SZ, 0);
  let found = false;
  try {
    let ok = X.Process32FirstW(snap, entry);
    while (ok && !found) {
      const name = entry.toString('utf16le', 44, 44 + 520).replace(/\0[\s\S]*$/, '');
      if (name.toLowerCase() === 'claude.exe') {
        const pid = entry.readUInt32LE(8);
        const h = X.OpenProcess(0x1000, false, pid);
        if (h) {
          const buf = Buffer.alloc(2048), size = [1024];
          if (X.QueryFullProcessImageNameW(h, 0, buf, size)) { const path = buf.toString('utf16le', 0, size[0] * 2); if (/[\\/]WindowsApps[\\/]Claude_|[\\/]AnthropicClaude[\\/]|[\\/]Programs[\\/]Claude[\\/]/i.test(path)) found = true; }
          X.CloseHandle(h);
        }
      }
      ok = X.Process32NextW(snap, entry);
    }
  } finally { X.CloseHandle(snap); }
  return found;
}
