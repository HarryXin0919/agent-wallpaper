// When a quota runs out at the current pace, and the readings kept for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pace, forecast, record, SPANS } from '../src/forecast.mjs';
import * as S from '../src/settings.mjs';

const H = 3600e3, NOW = Date.parse('2026-11-19T12:00:00Z');
const min = (m) => NOW - m * 60e3;

test('the pace is the slope since the last reset', () => {
  // 20% → 30% over the last 40 minutes = 15% an hour
  const pts = [[min(40), 20], [min(30), 22.5], [min(20), 25], [min(10), 27.5], [min(0), 30]];
  assert.ok(Math.abs(pace(pts, NOW, SPANS.h5) - 15) < 0.01);
  // a reset 15 minutes ago: only what came after counts, and that is too little to judge
  const reset = [[min(40), 80], [min(30), 90], [min(15), 2], [min(10), 3], [min(5), 4], [min(0), 5]];
  assert.ok(Math.abs(pace(reset, NOW, SPANS.h5) - 12) < 0.01);
  assert.equal(pace([[min(3), 1], [min(2), 2], [min(1), 3]], NOW, SPANS.h5), null); // a few minutes say nothing
});

test('it runs out before the reset, or it does not', () => {
  const pts = [[min(40), 50], [min(30), 55], [min(20), 60], [min(10), 65], [min(0), 70]]; // 30% an hour
  const soon = forecast(pts, NOW, SPANS.h5, 70, NOW + 3 * H);
  assert.ok(Math.abs(soon.outAt - (NOW + H)) < 60e3); // 30% left at 30% an hour: in an hour
  assert.equal(soon.beforeReset, true);
  assert.equal(forecast(pts, NOW, SPANS.h5, 70, NOW + 30 * 60e3).beforeReset, false); // it resets first
  const idle = [[min(40), 50], [min(20), 50], [min(0), 50]];
  assert.equal(forecast(idle, NOW, SPANS.h5, 50, NOW + 3 * H), null); // not being used
});

test('readings: one every 2 minutes, thinned out after 6 hours, gone after 8 days', () => {
  const h = {};
  record(h, 'fh', min(10), 10); record(h, 'fh', min(9), 11); // within 2 minutes: the last one is updated
  assert.deepEqual(h.fh, [[min(10), 11]]);
  const old = {};
  for (let m = 9 * 24 * 60; m >= 0; m -= 5) record(old, 'sd', min(m), 50);
  assert.ok(old.sd[0][0] >= NOW - 8 * 24 * H);
  const early = old.sd.filter(([t]) => t < NOW - 6 * H), late = old.sd.filter(([t]) => t >= NOW - 6 * H);
  assert.ok(early.length < 8 * 48 + 2 && late.length > 60);
});

test('a dashboard screen and the two new shortcuts', () => {
  const base = S.load(path.join(os.tmpdir(), 'no-such-settings.json'));
  assert.equal(base.dashboard, 'none');
  assert.equal(base.keys.peek, 'Ctrl+Alt+Shift+Space'); assert.equal(base.keys.jump, 'Ctrl+Alt+Shift+J');
  assert.equal(S.apply(base, { dashboard: '30817322' }).dashboard, '30817322');
  assert.equal(S.apply(base, { dashboard: 'x; y' }).dashboard, 'none');
});
