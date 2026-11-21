// Phone push: the request built for each service, and what is (not) sent. Today's report: numbers only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { kindOf, request, sendPush } from '../src/push.mjs';
import { summarize, cardHTML } from '../src/report.mjs';
import * as S from '../src/settings.mjs';

test('each service gets its own kind of request', () => {
  const bark = request('https://api.day.app/KEY123/', 'Claude 在等你批准', '');
  assert.equal(bark.kind, 'bark'); assert.equal(bark.init.method, 'GET');
  assert.equal(bark.url, 'https://api.day.app/KEY123/' + encodeURIComponent('Claude 在等你批准') + '/%20?group=AgentWallpaper');
  const ntfy = request('https://ntfy.sh/my-topic', 'Claude needs your approval', 'Fix the tests');
  assert.equal(ntfy.url, 'https://ntfy.sh/');
  assert.deepEqual(JSON.parse(ntfy.init.body), { topic: 'my-topic', title: 'Claude needs your approval', message: 'Fix the tests' });
  const wecom = request('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc', 'Codex 在等你批准', '改登录页');
  assert.deepEqual(JSON.parse(wecom.init.body), { msgtype: 'text', text: { content: 'Codex 在等你批准\n改登录页' } });
  const other = request('http://192.168.1.5:8080/hook', 'T', '');
  assert.equal(other.kind, 'json'); assert.deepEqual(JSON.parse(other.init.body), { title: 'T', message: '' });
  assert.equal(request('not an address', 'T', ''), null);
  assert.equal(kindOf('file:///c:/x'), null);
});

test('sending: the answer is reported, and a failure never throws', async () => {
  const calls = [];
  const ok = { fetch: async (url, init) => { calls.push([url, init.method]); return { ok: true, status: 200 }; } };
  assert.deepEqual(await sendPush(ok, 'https://ntfy.sh/t', 'A', 'B'), { ok: true, status: 200, kind: 'ntfy' });
  assert.deepEqual(calls, [['https://ntfy.sh/', 'POST']]);
  const down = { fetch: async () => { throw new Error('offline'); } };
  assert.deepEqual(await sendPush(down, 'https://ntfy.sh/t', 'A', 'B'), { ok: false, status: 'network', kind: 'ntfy' });
  assert.deepEqual(await sendPush(ok, 'nonsense', 'A', 'B'), { ok: false, status: 'address' });
});

test('the push setting: off by default, off without a usable address, off until the address is verified', () => {
  const base = S.load(path.join(os.tmpdir(), 'no-such-settings.json'));
  assert.deepEqual(base.push, { on: false, url: '', verified: '', detail: false, done: false });
  assert.equal(S.apply(base, { push: { on: true, url: 'javascript:alert(1)' } }).push.on, false);
  const on = S.apply(base, { push: { on: true, url: ' https://api.day.app/KEY ' } });
  assert.equal(on.push.url, 'https://api.day.app/KEY');
  assert.equal(on.push.on, false, 'not verified yet: it stays off');
  const ok = S.apply(on, { push: { verified: 'https://api.day.app/KEY', on: true } });
  assert.equal(ok.push.on, true);
  assert.equal(S.apply(ok, { push: { url: 'https://api.day.app/OTHER' } }).push.on, false, 'a changed address needs a new check');
});

test("today's report: counts per assistant, and nothing of the tasks' text", () => {
  const now = new Date(2026, 10, 21, 15, 0, 0).getTime(), h = 3600e3;
  const brand = (name, color) => ({ name, color });
  const list = [
    { last: now - 0.5 * h, task: { t0: now - 2 * h, tok: { total: 300000 }, brand: brand('Claude', '#f4a98c'), prompt: 'SECRET request text' } },
    { last: now - 3 * h, task: { t0: now - 4 * h, tok: { total: 100000 }, brand: brand('Claude', '#f4a98c') } },
    { last: now - 1 * h, task: { t0: now - 1.5 * h, tok: { total: 50000 }, brand: brand('Codex', '#8fc1ff') } },
    { last: now - 20 * h, task: { t0: now - 21 * h, tok: { total: 9 }, brand: brand('Codex', '#8fc1ff') } }, // yesterday
  ];
  const sum = summarize(list, { today: { tok: 2000000 } }, now, (t) => ({ kind: t.t0 < now - 3 * h ? 'done' : 'work' }));
  assert.equal(sum.tasks, 3); assert.equal(sum.done, 1);
  assert.deepEqual(sum.rows.map((r) => [r.name, r.tasks]), [['Claude', 2], ['Codex', 1]]);
  assert.equal(sum.rows[0].ms, 2.5 * h); assert.equal(sum.rows[0].tok, 2000000); // the day's usage figure, where it is larger
  const html = cardHTML(sum, 'zh', '');
  assert.ok(html.includes('今天的 AI 工作') && html.includes('Claude') && !html.includes('SECRET'));
  assert.ok(cardHTML(summarize([], null, now), 'en', '').includes('No tasks yet today'));
});
