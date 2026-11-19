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

test('a font per language: only known choices are kept', () => {
  const base = S.load(path.join(os.tmpdir(), 'no-such-settings.json'));
  assert.deepEqual(base.font, { latin: 'system', cjk: 'system', ja: 'system', ko: 'system' });
  assert.equal(S.apply(base, { font: { cjk: 'name:LXGW WenKai' } }).font.cjk, 'name:LXGW WenKai');
  assert.equal(S.apply(base, { font: { latin: 'name:X"; } body { display: none' } }).font.latin, 'name:X  body  display: none');
  assert.equal(S.apply(base, { font: { latin: 'file:gone' } }).font.latin, 'system'); // its file was never imported
  const withFont = S.apply(base, { fonts: [{ id: 'f1', name: 'Mine', file: 'f1.otf' }, { id: 'x', name: 'Bad', file: '../../evil.exe' }] });
  assert.deepEqual(withFont.fonts, [{ id: 'f1', name: 'Mine', file: 'f1.otf' }]);
  assert.equal(S.apply(withFont, { font: { ko: 'file:f1' } }).font.ko, 'file:f1');
  // the faces of an installed font are kept only while a language uses it
  const g = S.apply(base, { font: { latin: 'name:Georgia' }, fontFaces: { Georgia: [{ n: 'Georgia', p: 'Georgia', s: 'Regular' }], Other: [{ n: 'Other' }] } });
  assert.deepEqual(Object.keys(g.fontFaces), ['Georgia']);
  assert.deepEqual(Object.keys(S.apply(g, { font: { latin: 'system' } }).fontFaces), []);
});

test('the one font of 0.5.0 becomes the English and the Chinese font', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wallpaper-cfg-')), 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ font: 'name:Georgia' }));
  assert.deepEqual(S.load(file).font, { latin: 'name:Georgia', cjk: 'name:Georgia', ja: 'system', ko: 'system' });
});

test('each language gets its own font, limited to its characters, one face per weight', () => {
  const cfg = S.apply(S.load(path.join(os.tmpdir(), 'no-such-settings.json')), {
    fonts: [{ id: 'f1', name: 'Kai', file: 'f1.ttf' }],
    font: { latin: 'name:Georgia', cjk: 'file:f1', ko: 'name:Malgun Gothic' },
    fontFaces: { Georgia: [{ n: 'Georgia', p: 'Georgia', s: 'Regular' }, { n: 'Georgia Bold', p: 'Georgia-Bold', s: 'Bold' }, { n: 'Georgia Italic', p: 'Georgia-Italic', s: 'Italic' }] },
  });
  const v = fonts.slotView(cfg, (f) => 'file:///fonts/' + f.file);
  assert.deepEqual(v.map((x) => x.key), ['latin', 'ko', 'cjk']); // Japanese is left to the system
  const latin = v[0];
  assert.equal(latin.alias, 'AW-latin');
  assert.ok(latin.range.startsWith('U+0000') && !latin.range.includes('4E00'));
  assert.deepEqual(latin.faces, [{ src: 'local("Georgia"), local("Georgia")', weight: '400' }, { src: 'local("Georgia Bold"), local("Georgia-Bold")', weight: '700' }]);
  assert.deepEqual(v[1].faces, [{ src: 'local("Malgun Gothic")' }]); // weights unknown: one face
  assert.deepEqual(v[2].faces, [{ src: 'url("file:///fonts/f1.ttf")' }]);
  assert.ok(v[2].range.includes('U+4E00-9FFF'));
  assert.equal(fonts.weightOf('SemiBold'), 600); assert.equal(fonts.weightOf('Extra Light'), 200); assert.equal(fonts.weightOf('Black'), 900);
});
