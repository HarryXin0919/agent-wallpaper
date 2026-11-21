// Run with: npm test   (node --test; needs Node 22.13+ for node:sqlite)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAll } from './fixtures.mjs';
import { Live } from '../src/live.mjs';
import { CodexLive, cmdLabel } from '../src/codex.mjs';
import { CursorLive } from '../src/cursor.mjs';
import { GeminiLive } from '../src/gemini.mjs';
import { DeepseekLive, unframe } from '../src/deepseek.mjs';
import { deepseekLog, zstdFrames } from './fixtures.mjs';
import { Ledger, estimate, calibrate } from '../src/estimate.mjs';
import * as S from '../src/settings.mjs';
import '../src/scene.js';
import '../src/flow.js';
import '../src/i18n.js';

const { Scene, Flow, I18N } = globalThis;
const NOW = Date.now();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-'));
const P = writeAll(dir, NOW);

test('Claude Code: the latest task, its plan, actions and tokens', () => {
  const L = new Live(P.claude, { hours: 12 }); L.scan(); L.poll();
  const snap = L.snapshot();
  assert.equal(snap.length, 2);
  const s = snap.find((x) => x.title === 'Dark mode');
  assert.ok(s, 'the session with a custom title');
  assert.equal(s.task.prompt, 'Add a dark mode to the settings page');
  const tools = s.task.ev.filter((e) => e.k === 'tool');
  assert.deepEqual(tools.map((e) => e.kind), ['plan', 'read', 'plan', 'edit', 'run']);
  const edit = tools.find((e) => e.kind === 'edit');
  assert.equal(edit.op, '修改 theme.css'); assert.equal(edit.plus, 4); assert.equal(edit.minus, 2);
  const plan = tools.filter((e) => e.plan).pop().plan;
  assert.equal(plan.findIndex((p) => p.status === 'in_progress'), 2);
  assert.ok(s.task.tok.total > 0);
  assert.equal(Scene.stateOf(s.task, NOW).kind, 'work'); // the test command is still running
  const done = snap.find((x) => x !== s);
  assert.equal(Scene.stateOf(done.task, NOW).kind, 'done');
});

test('Codex: request text, actions, quota and title', () => {
  const C = new CodexLive(P.codex, { hours: 12 }); C.scan(); C.poll();
  const [s] = C.snapshot();
  assert.equal(s.id, 'cx:01a1ffff-0000-7000-8000-000000000001');
  assert.equal(s.title, 'Flaky upload test');
  assert.equal(s.task.prompt, 'The upload test fails one run in five. Fix it.'); // attached files left out
  const tools = s.task.ev.filter((e) => e.k === 'tool');
  assert.equal(tools[0].op, '运行：pytest tests/test_upload.py -x');
  assert.equal(tools[0].err, '退出码 1');
  assert.equal(tools[1].kind, 'edit'); assert.equal(tools[1].plus, 2); assert.equal(tools[1].minus, 1);
  assert.equal(tools[2].tEnd, undefined); // still running
  assert.equal(Scene.stateOf(s.task, NOW).kind, 'work');
  assert.equal(C.rate().primary.used_percent, 41);
  assert.ok(C.today().tok >= 50800);
});

test('Codex: command labels skip setup lines and shorten program paths', () => {
  assert.equal(cmdLabel("$ErrorActionPreference='Stop'\n& 'C:\\Program Files\\Python\\python.exe' build.py"), 'python build.py');
  assert.equal(cmdLabel("$x = 'D:\\a'; Get-Content -Raw 'D:\\notes\\a.md'"), "Get-Content -Raw a.md");
  // a script fed to a program: its comment, else the file it works on, else its first statement
  assert.equal(cmdLabel("@'\n# count the open issues\nimport json\nprint(1)\n'@ | python -B -"), 'python · count the open issues');
  assert.equal(cmdLabel("@'\nimport os\ns = open('tools/icon.mjs').read()\n'@ | & 'C:\\Python\\python.exe' -B -"), 'python · icon.mjs');
  assert.equal(cmdLabel("@'\nimport sys\nprint(sys.version)\n'@ | python -"), 'python · print(sys.version)');
});

test('Cursor: conversation read from its database, read-only', () => {
  const before = fs.statSync(P.cursor).mtimeMs;
  const L = new CursorLive(P.cursor, { hours: 12 });
  assert.equal(L.poll(), true);
  const [s] = L.snapshot();
  L.close();
  assert.equal(s.title, 'CI build');
  assert.equal(s.task.prompt, 'Why does the build fail on CI?');
  const tools = s.task.ev.filter((e) => e.k === 'tool');
  assert.deepEqual(tools.map((e) => e.kind), ['read', 'plan', 'run']);
  assert.equal(tools[2].op, '运行：npm run build');
  assert.ok(!s.task.ev.some((e) => e.k === 'stop'), 'still generating');
  assert.equal(fs.statSync(P.cursor).mtimeMs, before, 'the database is not written');
});

test('Gemini CLI: request, actions, a patched result, and a step waiting for approval', () => {
  const G = new GeminiLive(P.gemini, { hours: 12 }); G.scan(); G.poll();
  const [s] = G.snapshot();
  assert.equal(s.id, 'gm:g-0001');
  assert.equal(s.task.prompt, 'Add a dark theme to the docs site');
  const tools = s.task.ev.filter((e) => e.k === 'tool');
  assert.deepEqual(tools.map((e) => e.kind), ['read', 'edit', 'run']);
  assert.ok(tools[1].tEnd, 'the $patch filled in the result');
  assert.equal(tools[2].op, '运行：Build the site');
  const st = Scene.stateOf(s.task, NOW);
  assert.equal(st.kind, 'wait'); assert.equal(st.approval, true);
  assert.ok(s.task.tok.total >= 9420);
});

test('DeepSeek Harness: zstd frames, the request, the plan, and an exact approval wait', () => {
  const D = new DeepseekLive(P.deepseek, { hours: 12 }); D.scan(); D.poll();
  const [s] = D.snapshot();
  assert.equal(s.id, 'ds:d5000000-0000-4000-8000-000000000001');
  assert.equal(s.title, 'Login rate limit');
  assert.equal(s.task.prompt, 'Add rate limiting to the login endpoint'); // the time-context record is not a request
  const tools = s.task.ev.filter((e) => e.k === 'tool');
  assert.deepEqual(tools.map((e) => e.kind), ['read', 'plan', 'edit', 'run']);
  assert.ok(tools[0].tEnd && tools[2].tEnd);
  assert.equal(tools[3].op, '运行：Run the tests');
  assert.equal(s.task.plan.length, 3);
  const m = Flow.model(s.task, NOW);
  assert.deepEqual(m.plan.map((p) => p.text), ['Read the login handler', 'Add a limiter', 'Run the tests']); // the checklist shows as the steps
  assert.ok(m.steps.some((x) => x.title === 'Add a limiter'));
  assert.equal(s.task.tok.total, 12400);
  const st = Scene.stateOf(s.task, NOW);
  assert.equal(st.kind, 'wait'); assert.equal(st.approval, true);
});

test('DeepSeek Harness: a frame still being written is read on the next look', () => {
  const all = zstdFrames(deepseekLog(NOW));
  const first = unframe(all.subarray(0, all.length - 7)); // the last frame is cut short
  assert.ok(first.used > 0 && first.used < all.length);
  const rest = unframe(all.subarray(first.used));
  assert.equal(rest.used, all.length - first.used);
  assert.equal(first.lines.length + rest.lines.length, deepseekLog(NOW).flat().length);
});

test('Progress: continuous with a task list, inferred stages without one', () => {
  const t0 = NOW - 600e3;
  const plan = (s) => s.map((x, i) => ({ text: 'step ' + (i + 1), status: x }));
  const tool = (t, kind, extra) => ({ t, tEnd: t + 1000, k: 'tool', kind, op: kind === 'edit' ? '修改 a.js' : kind === 'run' ? '运行：npm test' : '读取 a.js', id: 'x' + t, ...extra });
  // 4 steps, 1 done (took 2 minutes), the second has run 1 minute: between 25% and 50%, and it grows with time
  const ev = [{ t: t0, k: 'prompt' }, { t: t0 + 1000, k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(['in_progress', 'pending', 'pending', 'pending']), id: 'p1', tEnd: t0 + 1000 },
    tool(t0 + 20e3, 'read'), tool(t0 + 100e3, 'edit'),
    { t: t0 + 121e3, k: 'tool', kind: 'plan', op: '更新任务清单', plan: plan(['completed', 'in_progress', 'pending', 'pending']), id: 'p2', tEnd: t0 + 121e3 },
    { t: t0 + 150e3, k: 'tool', kind: 'read', op: '读取 b.js', id: 'r2' }];
  const task = { t0, ev };
  const a = Flow.progress(task, t0 + 181e3).pct, b = Flow.progress(task, t0 + 400e3).pct;
  assert.ok(a > 25 && a < 50, `in step 2: ${a}`);
  assert.ok(b > a && b < 50, 'grows with time but stays inside the step');
  // no task list: look around → change files → run checks, only forward; done = 100
  const plain = { t0, ev: [{ t: t0, k: 'prompt' }, tool(t0 + 10e3, 'read'), tool(t0 + 20e3, 'read')] };
  const p0 = Flow.progress(plain, t0 + 30e3);
  assert.equal(p0.stage, 0); assert.ok(p0.pct > 0 && p0.pct < 35);
  plain.ev.push(tool(t0 + 40e3, 'edit'), tool(t0 + 50e3, 'read'));
  const p1 = Flow.progress(plain, t0 + 60e3);
  assert.equal(p1.stage, 1, 'reading after an edit does not go back'); assert.ok(p1.pct >= 35 && p1.pct < 75);
  plain.ev.push({ t: t0 + 70e3, k: 'tool', kind: 'run', op: '运行：npm test', id: 'run1' });
  const p2 = Flow.progress(plain, t0 + 80e3);
  assert.equal(p2.stage, 2); assert.ok(p2.pct >= 75 && p2.pct < 95);
  plain.ev[plain.ev.length - 1].tEnd = t0 + 90e3; plain.ev.push({ t: t0 + 95e3, k: 'stop' });
  assert.equal(Flow.progress(plain, t0 + 100e3).pct, 100);
});

test('Flow groups actions under the plan steps', () => {
  const L = new Live(P.claude, { hours: 12 }); L.scan(); L.poll();
  const s = L.snapshot().find((x) => x.title === 'Dark mode');
  const m = Flow.model(s.task, NOW);
  assert.equal(m.plan.length, 4);
  assert.ok(m.steps.some((st) => st.ops.some((o) => o.live)));
});

test('Claude quota estimate: a reading plus the tokens used since', async () => {
  const led = new Ledger(P.claude, 5); await led.refresh();
  assert.ok(led.msgs.size >= 9);
  const samples = [{ t: NOW - 3600e3, u: { fh: 10, sd: 40 } }];
  const e = estimate(samples, led, NOW);
  assert.ok(e.fh > 10 && e.fh < 100, `5-hour estimate ${e.fh}`);
  assert.ok(e.sd >= 40);
  assert.deepEqual(Object.keys(calibrate(samples, led)), ['fh', 'sd', 'nf', 'ns']);
});

test('Settings: defaults, partial changes, a hand-saved file with a BOM', () => {
  const f = path.join(dir, 'settings.json');
  fs.writeFileSync(f, '\uFEFF{"lang":"en","scale":9,"usage":{"show":false}}');
  const c = S.load(f);
  assert.equal(c.lang, 'en');
  assert.equal(c.scale, 1.4); // kept within range
  assert.equal(c.usage.show, false); assert.equal(c.usage.h5, true);
  const d = S.apply(c, { sources: { cursor: { on: true } } });
  assert.equal(d.sources.cursor.on, true); assert.equal(d.sources.cursor.color, '#b9a2ff');
});

test('English labels for the Chinese action names', () => {
  I18N.set('en');
  assert.equal(I18N.op('修改 upload.py 等 3 个文件'), 'Edit upload.py (3 files)');
  assert.equal(I18N.op('运行：npm test'), 'Run: npm test');
  assert.equal(I18N.op('上网搜索“electron”'), 'Web search "electron"');
  assert.equal(I18N.dur(125000), '2 min 5 s');
  assert.equal(I18N.tok(3.4e7), '34M');
  I18N.set('zh');
  assert.equal(I18N.tok(3.4e7), '3400 万');
});
