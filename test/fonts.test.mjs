// Imported fonts: reading the name from the file, refusing files that are not fonts, and the saved setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fonts from '../src/fonts.mjs';
import * as S from '../src/settings.mjs';

// the smallest file with a "name" table: one Windows record per given [language, nameId, text]
function ttf(records) {
  const strings = records.map(([, , text]) => Buffer.from(text, 'utf16le').swap16());
  const name = Buffer.alloc(6 + records.length * 12);
  name.writeUInt16BE(records.length, 2); name.writeUInt16BE(name.length, 4);
  let off = 0;
  records.forEach(([lang, id], i) => {
    const o = 6 + i * 12;
    name.writeUInt16BE(3, o); name.writeUInt16BE(1, o + 2); name.writeUInt16BE(lang, o + 4); name.writeUInt16BE(id, o + 6); name.writeUInt16BE(strings[i].length, o + 8); name.writeUInt16BE(off, o + 10);
    off += strings[i].length;
  });
  const table = Buffer.concat([name, ...strings]);
  const head = Buffer.alloc(12 + 16);
  head.writeUInt32BE(0x00010000, 0); head.writeUInt16BE(1, 4);
  head.write('name', 12, 'latin1'); head.writeUInt32BE(head.length, 20); head.writeUInt32BE(table.length, 24);
  return Buffer.concat([head, table]);
}

test('the font name comes from the file, Chinese first', () => {
  assert.equal(fonts.familyOf(ttf([[0x409, 1, 'Test Sans']])), 'Test Sans');
  assert.equal(fonts.familyOf(ttf([[0x409, 1, 'STKaiti'], [0x804, 1, '华文楷体']])), '华文楷体');
  assert.equal(fonts.familyOf(Buffer.from('not a font at all')), null);
  assert.equal(fonts.kindOf(Buffer.from('wOF2....')), 'woff2');
  assert.equal(fonts.kindOf(Buffer.from('ttcf....')), null); // font collections are not loadable by the page
});

test('importing copies the file; other files are refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-fonts-'));
  const src = path.join(dir, 'My Font.ttf'), bad = path.join(dir, 'notes.ttf');
  fs.writeFileSync(src, ttf([[0x409, 1, 'My "Font"; {x}']])); fs.writeFileSync(bad, 'hello');
  const r = fonts.importFont(src, path.join(dir, 'kept'));
  assert.equal(r.name, 'My Font x'); // characters that could break out of a style rule are dropped
  assert.ok(/^f[a-z0-9]+\.ttf$/.test(r.file) && fs.existsSync(path.join(dir, 'kept', r.file)));
  assert.equal(fonts.importFont(bad, path.join(dir, 'kept')).error, 'kind');
  assert.equal(fonts.importFont(path.join(dir, 'missing.ttf'), dir).error, 'read');
  fonts.removeFont(r, path.join(dir, 'kept'));
  assert.ok(!fs.existsSync(path.join(dir, 'kept', r.file)));
});

test('the font setting: only a known choice is kept', () => {
  const base = S.load(path.join(os.tmpdir(), 'no-such-settings.json'));
  assert.equal(base.font, 'system');
  assert.equal(S.apply(base, { font: 'name:LXGW WenKai' }).font, 'name:LXGW WenKai');
  assert.equal(S.apply(base, { font: 'name:X"; } body { display: none' }).font, 'name:X  body  display: none');
  assert.equal(S.apply(base, { font: 'file:gone' }).font, 'system'); // its file was never imported
  const withFont = S.apply(base, { fonts: [{ id: 'f1', name: 'Mine', file: 'f1.otf' }, { id: 'x', name: 'Bad', file: '../../evil.exe' }] });
  assert.deepEqual(withFont.fonts, [{ id: 'f1', name: 'Mine', file: 'f1.otf' }]);
  assert.equal(S.apply(withFont, { font: 'file:f1' }).font, 'file:f1');
});
