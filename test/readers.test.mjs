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
