// Preview of the multi-task lanes: real tasks, each frozen at a chosen moment and shifted onto one shared clock.
// usage: node tools/lanesframe.mjs <out.png> <session.jsonl>|<task start prefix>|<moment ISO> ...  (BG=css LIVEWP=1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { parseSession, tasks } from '../src/parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [out, ...specs] = process.argv.slice(2);
const NOW = Date.parse('2026-11-18T13:00:00Z');
const shift = (e, d) => { const c = { ...e, t: e.t + d }; if (e.tEnd) c.tEnd = e.tEnd + d; if (e.subEnd) c.subEnd = e.subEnd + d; if (e.sub) c.sub = e.sub.map((x) => shift(x, d)); return c; };
const items = specs.map((sp, i) => {
  const [file, prefix, moment] = sp.split('|');
  const s = parseSession(file);
  const t = tasks(s).find((x) => new Date(x.t0).toISOString().startsWith(prefix));
  const d = NOW - Date.parse(moment);
  const ev = t.ev.filter((e) => e.t <= Date.parse(moment)).map((e) => shift(e, d)).map((e) => (e.tEnd && e.tEnd > NOW ? { ...e, tEnd: undefined } : e));
  return { id: 'p' + i, title: s.title, task: { prompt: t.prompt, title: s.title, t0: t.t0 + d, ev } };
});
const W = 1707, H = 1067, DPR = 1.5;
const names = ['此电脑', '回收站'];
for (const d of [path.join(process.env.USERPROFILE, 'Desktop'), 'C:/Users/Public/Desktop']) { try { for (const f of fs.readdirSync(d)) if (!/^desktop\.ini$/i.test(f) && !/^~\$/.test(f)) names.push(f.replace(/\.lnk$/i, '')); } catch {} }
const rows = Math.floor((H - 56) / 107);
const icons = names.map((n, i) => ({ n, x: 4 + Math.floor(i / rows) * 77, y: 6 + (i % rows) * 107, w: 77, h: 107 }));
const html = `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(here, '../src/glass.css'), 'utf8')}</style>
<div style="position:fixed;inset:0;background:${process.env.BG || '#334'};background-size:cover;background-position:center"></div><div id="stage"></div>
<style>.di{position:absolute;width:74px;display:flex;flex-direction:column;align-items:center;gap:5px;z-index:9}.di i{width:46px;height:46px;border-radius:10px;background:linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.22));box-shadow:0 2px 6px rgba(0,0,0,.35)}.di span{font:12px "Segoe UI","Microsoft YaHei UI";color:#fff;text-align:center;line-height:1.25;max-height:30px;overflow:hidden;text-shadow:0 1px 3px rgba(0,0,0,.9);word-break:break-all}</style>
${icons.map((i) => `<div class="di" style="left:${i.x}px;top:${i.y}px"><i></i><span>${i.n.replace(/[<&]/g, '')}</span></div>`).join('')}
${process.env.LIVEWP ? '<script>document.body.classList.add("livewp")</script>' : ''}
<script>${fs.readFileSync(path.join(here, '../src/i18n.js'), 'utf8')}</script><script>I18N.set(${JSON.stringify(process.env.LANG_UI || 'zh')})</script>
<script>${fs.readFileSync(path.join(here, '../src/scene.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/flow.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/glass.js'), 'utf8')}</script>
<script>const items=${JSON.stringify(items)}; const free=Glass.freeRect(${JSON.stringify(icons)},${W},${H});
const r=Glass.renderLanes(document.getElementById('stage'),items,${NOW},{free,w:${W},h:${H}}); window.__state=r;</script>`;
const htmlPath = path.resolve(out.replace(/\.png$/, '.html'));
fs.writeFileSync(htmlPath, html);
const r = createRequire(process.env.PW_FROM || import.meta.url);
const { chromium } = r('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(pathToFileURL(htmlPath).href);
await p.waitForTimeout(700);
console.log(JSON.stringify(await p.evaluate(() => window.__state)), errs.join(' | '));
await p.screenshot({ path: out });
await b.close();
