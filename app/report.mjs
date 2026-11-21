// Makes the picture of today's report (src/report.mjs): drawn in a window that is never shown, saved into the
// Pictures folder, copied to the clipboard and shown in its folder.
import { app, BrowserWindow, clipboard, nativeImage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { summarize, cardHTML } from '../src/report.mjs';

export async function makeReport({ list, usage, lang, stateOf, iconFile, out, reveal = true }) {
  const now = Date.now(), sum = summarize(list, usage, now, stateOf);
  let icon = ''; try { icon = 'data:image/png;base64,' + fs.readFileSync(iconFile).toString('base64'); } catch {}
  const win = new BrowserWindow({ width: 1200, height: 630, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(cardHTML(sum, lang, icon)));
    await new Promise((r) => setTimeout(r, 350)); // fonts and the first paint
    const img = await win.webContents.capturePage();
    const d = new Date(sum.day), name = `agent-wallpaper-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.png`;
    const file = out || path.join(app.getPath('pictures'), 'Agent Wallpaper', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, img.toPNG());
    if (reveal) { clipboard.writeImage(nativeImage.createFromBuffer(img.toPNG())); shell.showItemInFolder(file); }
    return { file, sum };
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
