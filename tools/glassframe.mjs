// Render one still frame of the glass view from a real task, over the current wallpaper image.
// usage: node tools/glassframe.mjs <session.jsonl> <task start ISO prefix> <now ISO | "end+SECONDS"> <out.png> [notext]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parseSession, tasks } from '../src/parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [file, startPrefix, nowArg, out, notext] = process.argv.slice(2);
const s = parseSession(file);
const task = tasks(s).find((t) => new Date(t.t0).toISOString().startsWith(startPrefix));
if (!task) throw new Error('task not found');
const now = nowArg.startsWith('end+') ? task.t1 + Number(nowArg.slice(4)) * 1000 : Date.parse(nowArg);
const data = { prompt: task.prompt, title: s.title, t0: task.t0, t1: task.t1, ev: task.ev };
const W = 1707, H = 1067, DPR = 1.5;
// stand-in desktop icons: your real desktop items, auto-arranged in columns from the top-left
const names = ['此电脑', '回收站'];
for (const d of [path.join(process.env.USERPROFILE, 'Desktop'), 'C:/Users/Public/Desktop']) { try { for (const f of fs.readdirSync(d)) if (!/^desktop\.ini$/i.test(f)) names.push(f.replace(/\.lnk$/i, '')); } catch {} }
const CELLW = 80, CELLH = 100, rows = Math.floor((H - 48 - 8) / CELLH);
const icons = names.map((n, i) => ({ n, x: 4 + Math.floor(i / rows) * CELLW, y: 6 + (i % rows) * CELLH, w: CELLW - 6, h: CELLH - 10 }));
const wall = pathToFileURL(path.join(here, '../out/wall-current.jpg')).href;
const html = `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(here, '../src/glass.css'), 'utf8')}</style>
${process.env.BG ? `<div style="position:fixed;inset:0;background:${process.env.BG};background-size:cover;background-position:center"></div>` : `<div class="wp" style="background-image:url('${wall}')"></div>`}<div id="stage"></div>
${process.env.LIVEWP ? '<script>document.body.classList.add("livewp")</script>' : ''}
<style>.di{position:absolute;width:74px;display:flex;flex-direction:column;align-items:center;gap:5px;z-index:9}.di i{width:46px;height:46px;border-radius:10px;background:linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.22));box-shadow:0 2px 6px rgba(0,0,0,.35)}.di span{font:12px "Segoe UI","Microsoft YaHei UI";color:#fff;text-align:center;line-height:1.25;max-height:30px;overflow:hidden;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9);word-break:break-all}</style>
${process.env.ICONS === '0' ? '' : icons.map((i) => `<div class="di" style="left:${i.x}px;top:${i.y}px"><i></i><span>${i.n.replace(/[<&]/g, '')}</span></div>`).join('')}
<script>${fs.readFileSync(path.join(here, '../src/i18n.js'), 'utf8')}</script><script>I18N.set(${JSON.stringify(process.env.LANG_UI || 'zh')})</script>
<script>${fs.readFileSync(path.join(here, '../src/scene.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/flow.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/glass.js'), 'utf8')}</script>
<script>const task=${JSON.stringify(data)}; const icons=${JSON.stringify(process.env.ICONS === '0' ? [] : icons)};
const free=Glass.freeRect(icons,${W},${H});
const r=Glass.render(document.getElementById('stage'),task,${now},{text:${notext ? 'false' : 'true'},free,w:${W},h:${H}}); window.__state={state:r.st.kind,vertical:r.vertical,free:r.free,icons:icons.length};</script>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
const htmlPath = path.resolve(out.replace(/\.png$/, '.html'));
fs.writeFileSync(htmlPath, html);
const r = createRequire(process.env.PW_FROM || import.meta.url);
const { chromium } = r('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(pathToFileURL(htmlPath).href);
await p.waitForTimeout(900);
console.log(new Date(now).toISOString(), JSON.stringify(await p.evaluate(() => window.__state)), errs.join(' | '));
await p.screenshot({ path: out });
await b.close();
