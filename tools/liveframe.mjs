// Preview with today's real logs: Claude and Codex together, plus the usage panel.
// A Codex task can be frozen at a moment (CODEX="<title part>|<ISO moment>") so it shows as working.
// usage: node tools/liveframe.mjs <out.png>   (BG=css LIVEWP=1 ONE=1 for a single task)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Live } from '../src/live.mjs';
import { CodexLive } from '../src/codex.mjs';
import { Ledger, estimate } from '../src/estimate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const NOW = Date.now();
const live = new Live(path.join(os.homedir(), '.claude', 'projects'), { hours: 12 }); live.scan(); live.poll();
const cx = new CodexLive(path.join(os.homedir(), '.codex'), { hours: Number(process.env.CXH || 72) }); cx.scan(); cx.poll();
const shift = (e, d) => { const c = { ...e, t: e.t + d }; if (e.tEnd) c.tEnd = e.tEnd + d; return c; };
const items = [];
const claude = live.snapshot()[0]; if (claude) items.push({ id: claude.id, title: claude.title, task: claude.task });
if (process.env.CODEX) {
  const [part, moment] = process.env.CODEX.split('|'), M = Date.parse(moment), d = NOW - M;
  const c = cx.snapshot().find((s) => (s.title || '').includes(part));
  if (c) items.push({ id: c.id, title: c.title, task: { ...c.task, t0: c.task.t0 + d, ev: c.task.ev.filter((e) => e.t <= M).map((e) => shift(e, d)).map((e) => (e.tEnd && e.tEnd > NOW ? { ...e, tEnd: undefined } : e)) } });
}
const others = cx.snapshot().filter((s) => !items.some((i) => i.id === s.id)).slice(0, 2).map((s) => ({ id: s.id, title: s.title, task: s.task }));
// usage, as the program builds it
const led = new Ledger(path.join(os.homedir(), '.claude', 'projects'), 5); await led.refresh();
const hist = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Claude', 'plan-usage-history.json'), 'utf8')).samples;
const e = estimate(hist, led, NOW);
const proxy = await new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: 8787, path: '/usage', timeout: 25000 }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } }); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
const r = cx.rate(), win = (w) => w && { pct: w.used_percent, resetS: w.resets_at ? w.resets_at - NOW / 1000 : null, mins: w.window_minutes };
const ws = r ? [win(r.primary), win(r.secondary)].filter(Boolean) : [];
const usage = { plan: e && { fh: e.fh, sd: e.sd, fhReset: e.fhReset, sdReset: e.sdReset, t: e.t, src: 'est' },
  today: proxy && proxy.tok_today != null ? { tok: proxy.tok_today, out: proxy.tok_today_out, cost: proxy.cost_today_usd } : null,
  week: proxy && proxy.week_tok != null ? { days: proxy.tok_7d } : null,
  codex: r ? { week: ws.find((w) => w.mins >= 1440) || null, short: ws.find((w) => w.mins < 1440) || null, today: cx.today() } : null };
console.log('items', items.map((i) => [i.id.slice(0, 12), i.task.src || 'claude', i.task.ev.length]), 'usage', JSON.stringify(usage.plan), JSON.stringify(usage.codex));

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
<script>const items=${JSON.stringify(items)}, others=${JSON.stringify(others)}, usage=${JSON.stringify(usage)}, NOW=${NOW};
const stage=document.getElementById('stage'); const f0=Glass.freeRect(${JSON.stringify(icons)},${W},${H}); const UH=214;
const free={x:f0.x,y:f0.y+UH,w:f0.w,h:f0.h-UH};
if (items.length>1 && !${!!process.env.ONE}) Glass.renderLanes(stage,items,NOW,{free,w:${W},h:${H},others});
else { const m=items[items.length-1]; Glass.render(stage,{...m.task,title:m.title},NOW,{free,w:${W},h:${H},sid:m.id,others}); }
stage.insertAdjacentHTML('afterbegin','<div class="ucol" style="left:'+f0.x+'px;top:'+(f0.y+16)+'px;width:'+f0.w+'px">'+Glass.usage(usage,{perMin:0},NOW)+'</div>');</script>`;
const htmlPath = path.resolve(out.replace(/\.png$/, '.html'));
fs.writeFileSync(htmlPath, html);
const req = createRequire(process.env.PW_FROM || import.meta.url);
const { chromium } = req('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errs = []; p.on('pageerror', (x) => errs.push(x.message));
await p.goto(pathToFileURL(htmlPath).href);
await p.waitForTimeout(700);
console.log(errs.join(' | ') || 'no page errors');
await p.screenshot({ path: out });
await b.close();
