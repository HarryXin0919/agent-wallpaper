// The optional approval hook, tested against a throwaway home folder (the real ~/.claude is never touched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-home-'));
process.env.HOME = home; process.env.USERPROFILE = home;
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
const settings = path.join(home, '.claude', 'settings.json');
fs.writeFileSync(settings, JSON.stringify({ theme: 'dark', hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo done' }] }] } }));
const hooks = await import('../src/hooks.mjs');
await import('../src/scene.js');
const { Scene } = globalThis;

test('turning the hook on and off changes only its own entry', () => {
  assert.equal(hooks.installed(), false);
  hooks.install(); hooks.install(); // twice: still one entry
  let s = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(s.theme, 'dark');
  assert.equal(s.hooks.Stop.length, 1);
  assert.equal(s.hooks.Notification.length, 1);
  assert.ok(hooks.installed());
  assert.ok(fs.existsSync(settings + '.agent-wallpaper.bak'));
  hooks.uninstall();
  s = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(s.hooks.Notification, undefined);
  assert.equal(s.hooks.Stop.length, 1);
  assert.equal(hooks.installed(), false);
});

test('only permission prompts written after start count', () => {
  fs.mkdirSync(hooks.DIR, { recursive: true });
  fs.writeFileSync(hooks.EVENTS, JSON.stringify({ session_id: 's1', notification_type: 'permission_prompt', message: 'old' }) + '\n');
  const a = new hooks.Asks();
  assert.equal(a.poll(), false); // the earlier line is skipped
  fs.appendFileSync(hooks.EVENTS, JSON.stringify({ session_id: 's1', message: 'Claude needs your permission to use Bash' }) + '\n');
  fs.appendFileSync(hooks.EVENTS, JSON.stringify({ session_id: 's1', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' }) + '\n');
  assert.equal(a.poll(), true);
  assert.equal(a.for('s1').length, 1);
});

test('with the hook, a pending step waits for approval only after a prompt', () => {
  const now = Date.now();
  const task = { t0: now - 60e3, exact: true, asks: [], ev: [{ t: now - 120e3, k: 'prompt' }, { t: now - 100e3, k: 'tool', kind: 'read', id: 'r1' }] };
  assert.equal(Scene.stateOf(task, now).kind, 'work'); // 100 s pending, but no prompt was reported
  task.asks = [now - 90e3];
  const st = Scene.stateOf(task, now);
  assert.equal(st.kind, 'wait'); assert.equal(st.approval, true);
  delete task.exact; delete task.asks;
  assert.equal(Scene.stateOf(task, now).approval, true); // without the hook: inferred after 8 s
});
