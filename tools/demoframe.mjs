// Renders the README screenshot from made-up tasks (no real logs): one Claude task and one Codex task at work,
// two finished ones as small cards, and the usage panel.
// usage: node tools/demoframe.mjs docs/screenshot.png   (needs playwright-core: npm i -D playwright-core; CHROME=path)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || 'docs/screenshot.png');
const NOW = Date.parse('2026-11-19T14:30:00+08:00');
const s = (sec) => NOW - sec * 1000;
const plan = (cur) => ['Read the settings components', 'Add theme tokens', 'Wire up the toggle', 'Update the tests', 'Check it in the browser']
  .map((text, i) => ({ text, status: i < cur ? 'completed' : i === cur ? 'in_progress' : 'pending' }));

const claude = {
  id: 'demo-claude', title: 'Dark mode for settings',
  task: {
    prompt: 'Add a dark mode to the settings page, following the system theme', t0: s(900), mode: 'default',
    tok: { total: 4.2e6 }, rate: [],
    ev: [
      { t: s(880), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(0), tEnd: s(879) },
      { t: s(870), k: 'tool', kind: 'read', op: '读取 SettingsPage.tsx', tEnd: s(869) },
      { t: s(700), k: 'think', dur: 9000 },
      { t: s(690), k: 'tool', kind: 'search', op: '搜索“useTheme”', tEnd: s(688) },
      { t: s(600), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(1), tEnd: s(599) },
      { t: s(520), k: 'tool', kind: 'edit', op: '修改 theme.css', plus: 42, minus: 3, tEnd: s(519) },
      { t: s(300), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(2), tEnd: s(299) },
      { t: s(140), k: 'think', dur: 12000 },
      { t: s(126), k: 'tool', kind: 'edit', op: '写入 ThemeToggle.tsx', plus: 27, minus: 0, tEnd: s(125) },
      { t: s(110), k: 'say', text: 'The toggle is in place; running the theme tests next.' },
      { t: s(23), k: 'tool', kind: 'run', op: '运行：Run the theme tests', shell: true, long: true },
    ],
  },
};
const codex = {
  id: 'cx:demo', title: 'Flaky upload test',
  task: {
    src: 'codex', prompt: 'The upload test in api/ fails one run in five. Find out why and fix it.', t0: s(1500), mode: 'bypassPermissions',
    tok: { total: 1.9e6 }, rate: [],
    ev: [
      { t: s(1450), k: 'tool', kind: 'run', op: '运行：pytest tests/test_upload.py -x', shell: true, long: true, tEnd: s(1420), err: '退出码 1' },
      { t: s(1300), k: 'think', dur: 21000 },
      { t: s(1280), k: 'tool', kind: 'read', op: '读取 upload.py', tEnd: s(1279) },
      { t: s(1100), k: 'think', dur: 16000 },
      { t: s(1080), k: 'tool', kind: 'edit', op: '修改 upload.py', plus: 8, minus: 5, tEnd: s(1078) },
      { t: s(600), k: 'say', text: 'The temp file was closed before the upload finished; now it waits.' },
      { t: s(41), k: 'tool', kind: 'run', op: '运行：pytest tests/test_upload.py --count 20', shell: true, long: true },
    ],
  },
};
const others = [
  { id: 'demo-done', title: 'Release notes', task: { prompt: 'Write the release notes for v0.4', t0: s(5400), ev: [{ t: s(5000), k: 'tool', kind: 'edit', op: '写入 CHANGELOG.md', tEnd: s(4990) }, { t: s(4980), k: 'stop' }] } },
  { id: 'cx:done', title: 'Lint', task: { src: 'codex', prompt: 'Fix the lint warnings in web/', t0: s(7200), ev: [{ t: s(6900), k: 'tool', kind: 'run', op: '运行：npm run lint', tEnd: s(6890) }, { t: s(6880), k: 'stop' }] } },
];
const usage = {
  plan: { fh: 34, sd: 58, fhReset: 2.4 * 3600, sdReset: 3.2 * 86400, src: 'live' },
  today: { tok: 1.82e8, cost: 96 }, week: { days: [0.9, 1.4, 0.6, 2.1, 1.7, 1.2, 1.8].map((x) => x * 1e8) },
  codex: { week: { pct: 41, resetS: 4.6 * 86400 }, short: null, today: { tok: 3.1e7 } },
};

const W = 1707, H = 1067, DPR = 1.5;
const names = ['This PC', 'Recycle Bin', 'Projects', 'Notes', 'Design', 'Photos', 'Music', 'Downloads', 'Docs', 'Games', 'Terminal', 'Editor', 'Browser', 'Mail', 'Calendar', 'Notes 2026', 'Backup', 'Scans', 'Slides', 'Sheets'];
const rows = Math.floor((H - 56) / 107);
const icons = names.map((n, i) => ({ n, x: 4 + Math.floor(i / rows) * 77, y: 6 + (i % rows) * 107, w: 77, h: 107 }));
const bg = 'radial-gradient(1200px 700px at 78% 18%, #f2b28c 0%, rgba(242,178,140,0) 60%), radial-gradient(900px 600px at 20% 85%, #3c6e8f 0%, rgba(60,110,143,0) 65%), linear-gradient(160deg, #24344d 0%, #47506e 45%, #b77a6a 100%)';
const html = `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(here, '../src/glass.css'), 'utf8')}</style>
<div style="position:fixed;inset:0;background:${bg}"></div><div id="stage"></div>
<style>.di{position:absolute;width:74px;display:flex;flex-direction:column;align-items:center;gap:5px;z-index:9}.di i{width:46px;height:46px;border-radius:10px;background:linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.22));box-shadow:0 2px 6px rgba(0,0,0,.35)}.di span{font:12px "Segoe UI";color:#fff;text-align:center;line-height:1.25;text-shadow:0 1px 3px rgba(0,0,0,.9)}</style>
${icons.map((i) => `<div class="di" style="left:${i.x}px;top:${i.y}px"><i></i><span>${i.n}</span></div>`).join('')}
<script>document.body.classList.add("livewp")</script>
<script>${fs.readFileSync(path.join(here, '../src/i18n.js'), 'utf8')}</script><script>I18N.set(${JSON.stringify(process.env.LANG_UI || 'zh')})</script>
<script>${fs.readFileSync(path.join(here, '../src/scene.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/flow.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(here, '../src/glass.js'), 'utf8')}</script>
<script>const NOW=${NOW}, items=${JSON.stringify([claude, codex])}, others=${JSON.stringify(others)}, usage=${JSON.stringify(usage)};
const f0=Glass.freeRect(${JSON.stringify(icons)},${W},${H}), UH=214, free={x:f0.x,y:f0.y+UH,w:f0.w,h:f0.h-UH};
Glass.renderLanes(document.getElementById('stage'),items.map((o)=>({id:o.id,task:{...o.task,title:o.title}})),NOW,{free,w:${W},h:${H},others});
document.getElementById('stage').insertAdjacentHTML('afterbegin','<div class="ucol" style="left:'+f0.x+'px;top:'+(f0.y+16)+'px;width:'+f0.w+'px">'+Glass.usage(usage,{perMin:2.6e5},NOW)+'</div>');</script>`;
const htmlPath = out.replace(/\.png$/, '.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(htmlPath, html);
const req = createRequire(process.env.PW_FROM || import.meta.url);
const { chromium } = req('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const errs = []; p.on('pageerror', (x) => errs.push(x.message));
await p.goto(pathToFileURL(htmlPath).href);
await p.waitForTimeout(600);
await p.screenshot({ path: out });
await b.close();
fs.unlinkSync(htmlPath);
console.log(errs.join(' | ') || 'ok', out);
