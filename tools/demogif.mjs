// Renders the README animation from made-up tasks: 8 seconds in which a Claude test run finishes, its plan moves
// to the next step and a new edit starts, while Codex stops thinking and starts a command.
// usage: LANG_UI=en node tools/demogif.mjs docs/demo-en.gif   (needs playwright-core and ffmpeg)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || 'docs/demo.gif');
const FPS = 15, SECS = 8, T0 = Date.parse('2026-11-19T14:30:00+08:00');
const at = (sec) => T0 + sec * 1000; // seconds from the start of the clip (negative: before it)
const steps = ['Read the settings components', 'Add theme tokens', 'Wire up the toggle', 'Update the tests', 'Check it in the browser'];
const plan = (cur) => steps.map((text, i) => ({ text, status: i < cur ? 'completed' : i === cur ? 'in_progress' : 'pending' }));

// everything that happens, with when it ends; a frame shows what has started by then
const claudeEv = [
  { t: at(-880), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(0), tEnd: at(-879) },
  { t: at(-870), k: 'tool', kind: 'read', op: '读取 SettingsPage.tsx', tEnd: at(-869) },
  { t: at(-700), k: 'think', dur: 9000 },
  { t: at(-690), k: 'tool', kind: 'search', op: '搜索“useTheme”', tEnd: at(-688) },
  { t: at(-600), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(1), tEnd: at(-599) },
  { t: at(-520), k: 'tool', kind: 'edit', op: '修改 theme.css', plus: 42, minus: 3, tEnd: at(-519) },
  { t: at(-300), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(2), tEnd: at(-299) },
  { t: at(-140), k: 'think', dur: 12000 },
  { t: at(-126), k: 'tool', kind: 'edit', op: '写入 ThemeToggle.tsx', plus: 27, minus: 0, tEnd: at(-125) },
  { t: at(-20), k: 'tool', kind: 'run', op: '运行：Run the theme tests', shell: true, long: true, tEnd: at(2.2) },
  { t: at(2.4), k: 'think', dur: 1600, show: at(4.0) },
  { t: at(4.0), k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(3), tEnd: at(4.1) },
  { t: at(4.6), k: 'tool', kind: 'edit', op: '修改 ThemeToggle.test.tsx', plus: 18, minus: 2, tEnd: at(5.4) },
  { t: at(6.0), k: 'tool', kind: 'run', op: '运行：Run the theme tests', shell: true, long: true },
];
const codexEv = [
  { t: at(-1450), k: 'tool', kind: 'run', op: '运行：pytest tests/test_upload.py -x', shell: true, long: true, tEnd: at(-1420), err: '退出码 1' },
  { t: at(-1300), k: 'think', dur: 21000 },
  { t: at(-1280), k: 'tool', kind: 'read', op: '读取 upload.py', tEnd: at(-1279) },
  { t: at(-1080), k: 'tool', kind: 'edit', op: '修改 upload.py', plus: 8, minus: 5, tEnd: at(-1078) },
  { t: at(-41), k: 'say', text: 'The temp file was closed before the upload finished.' },
  { t: at(-40), k: 'think', dur: 42400, show: at(2.4) },
  { t: at(2.5), k: 'tool', kind: 'run', op: '运行：pytest tests/test_upload.py --count 20', shell: true, long: true },
];
const view = (ev, now) => ev.filter((e) => (e.show || e.t) <= now).map(({ show, ...e }) => e).map((e) => (e.tEnd && e.tEnd > now ? { ...e, tEnd: undefined } : e));
const items = (now) => [
  { id: 'demo-claude', task: { prompt: 'Add a dark mode to the settings page, following the system theme', t0: at(-900), mode: 'default', title: 'Dark mode', tok: { total: 4.2e6 + (now - T0) * 900 }, ev: view(claudeEv, now) } },
  { id: 'cx:demo', task: { src: 'codex', prompt: 'The upload test in api/ fails one run in five. Find out why and fix it.', t0: at(-1500), mode: 'bypassPermissions', title: 'Flaky upload test', tok: { total: 1.9e6 + (now - T0) * 400 }, ev: view(codexEv, now) } },
];
const others = [
  { id: 'demo-done', title: 'Release notes', task: { prompt: 'Write the release notes for v0.4', t0: at(-5400), ev: [{ t: at(-5000), k: 'tool', kind: 'edit', op: '写入 CHANGELOG.md', tEnd: at(-4990) }, { t: at(-4980), k: 'stop' }] } },
  { id: 'cx:done', title: 'Lint', task: { src: 'codex', prompt: 'Fix the lint warnings in web/', t0: at(-7200), ev: [{ t: at(-6900), k: 'tool', kind: 'run', op: '运行：npm run lint', tEnd: at(-6890) }, { t: at(-6880), k: 'stop' }] } },
];
const usage = (now) => ({
  plan: { fh: 34 + (now - T0) / 4000, sd: 58, fhReset: 2.4 * 3600, sdReset: 3.2 * 86400, src: 'live' },
  today: { tok: 1.82e8 + (now - T0) * 4500, cost: 96 }, week: { days: [0.9, 1.4, 0.6, 2.1, 1.7, 1.2, 1.8].map((x) => x * 1e8) },
  codex: { week: { pct: 41, resetS: 4.6 * 86400 }, short: null, today: { tok: 3.1e7 + (now - T0) * 1500 } },
});

const W = 1707, H = 1067;
const names = ['This PC', 'Recycle Bin', 'Projects', 'Notes', 'Design', 'Photos', 'Music', 'Downloads', 'Docs', 'Games', 'Terminal', 'Editor', 'Browser', 'Mail', 'Calendar', 'Notes 2026', 'Backup', 'Scans', 'Slides', 'Sheets'];
const rows = Math.floor((H - 56) / 107);
const icons = names.map((n, i) => ({ n, x: 4 + Math.floor(i / rows) * 77, y: 6 + (i % rows) * 107, w: 77, h: 107 }));
const bg = 'radial-gradient(1200px 700px at 78% 18%, #f2b28c 0%, rgba(242,178,140,0) 60%), radial-gradient(900px 600px at 20% 85%, #3c6e8f 0%, rgba(60,110,143,0) 65%), linear-gradient(160deg, #24344d 0%, #47506e 45%, #b77a6a 100%)';
const src = (f) => fs.readFileSync(path.join(here, '..', 'src', f), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>${src('glass.css')}</style>
<div style="position:fixed;inset:0;background:${bg}"></div><div id="stage"></div>
<style>.di{position:absolute;width:74px;display:flex;flex-direction:column;align-items:center;gap:5px;z-index:9}.di i{width:46px;height:46px;border-radius:10px;background:linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.22));box-shadow:0 2px 6px rgba(0,0,0,.35)}.di span{font:12px "Segoe UI";color:#fff;text-align:center;line-height:1.25;text-shadow:0 1px 3px rgba(0,0,0,.9)}*{transition:none!important}</style>
${icons.map((i) => `<div class="di" style="left:${i.x}px;top:${i.y}px"><i></i><span>${i.n}</span></div>`).join('')}
<script>document.body.classList.add("livewp")</script>
<script>${src('i18n.js')}</script><script>I18N.set(${JSON.stringify(process.env.LANG_UI || 'zh')})</script>
<script>${src('scene.js')}</script><script>${src('flow.js')}</script><script>${src('glass.js')}</script>
<script>
const f0 = Glass.freeRect(${JSON.stringify(icons)}, ${W}, ${H}), free = { x: f0.x, y: f0.y + 214, w: f0.w, h: f0.h - 214 };
const ph = (t, ms) => (t % ms) / ms, ease = (x) => 1 - Math.pow(1 - x, 2), R = document.documentElement.style;
// the same motion clock as the wallpaper page, driven by the frame time
window.frame = (now, items, others, usage, t) => {
  const st = document.getElementById('stage');
  Glass.renderLanes(st, items, now, { free, w: ${W}, h: ${H}, others });
  st.insertAdjacentHTML('afterbegin', '<div class="ucol" style="left:' + f0.x + 'px;top:' + (f0.y + 16) + 'px;width:' + f0.w + 'px">' + Glass.usage(usage, { perMin: 2.6e5 }, now) + '</div>');
  const a13 = ph(t, 1300);
  R.setProperty('--a18', ease(ph(t, 1800))); R.setProperty('--a20', ease(Math.min(1, ph(t, 2000) / 0.8)));
  R.setProperty('--s24', 0.5 + 0.5 * Math.sin(ph(t, 2400) * Math.PI * 2)); R.setProperty('--a13', a13);
  R.setProperty('--f13', Math.min(1, a13 * 5, (1 - a13) * 5)); R.setProperty('--sh', Math.min(1, ph(t, 2800) / 0.6));
  [[1, 0], [2, 200], [3, 400]].forEach(([n, d]) => R.setProperty('--b' + n, 0.5 + 0.5 * Math.sin(ph(t + 1200 - d, 1200) * Math.PI * 2)));
};
</script>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-gif-'));
const page = path.join(tmp, 'page.html');
fs.writeFileSync(page, html);
const { chromium } = createRequire(process.env.PW_FROM || import.meta.url)('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(page).href);
for (let f = 0; f < FPS * SECS; f++) {
  const t = (f * 1000) / FPS, now = T0 + t;
  await p.evaluate(([now, it, ot, u, t]) => window.frame(now, it, ot, u, t), [now, items(now), others, usage(now), t]);
  await p.screenshot({ path: path.join(tmp, `f${String(f).padStart(4, '0')}.png`) });
}
await b.close();
// crop to the panels, scale down, and make a palette tuned to these frames
const crop = 'crop=1400:960:290:20,scale=920:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'), '-vf', `${crop},palettegen=max_colors=192:stats_mode=diff`, path.join(tmp, 'pal.png')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'), '-i', path.join(tmp, 'pal.png'), '-lavfi', `${crop}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok', out, Math.round(fs.statSync(out).size / 1024), 'KB');
