// Fonts the person imports (.ttf, .otf, .woff, .woff2). A copy is kept in this program's own folder, so the original
// file may be moved or deleted afterwards. The chosen font is put in front of the usual fonts: characters it does
// not have (often Chinese) still come from the system fonts.
import fs from 'node:fs';
import path from 'node:path';

export const MAX_BYTES = 60 * 1024 * 1024;
const KINDS = { '\x00\x01\x00\x00': 'ttf', OTTO: 'otf', true: 'ttf', wOFF: 'woff', wOF2: 'woff2' };

// which kind of font file this is, from its first bytes (null: not a font the page can load)
export function kindOf(buf) { return KINDS[buf.subarray(0, 4).toString('latin1')] || null; }

// the family name written in a .ttf / .otf file (its "name" table), preferring Chinese, then English
export function familyOf(buf) {
  try {
    if (!['ttf', 'otf'].includes(kindOf(buf))) return null;
    const n = buf.readUInt16BE(4);
    let at = 0, len = 0;
    for (let i = 0; i < n; i++) { const o = 12 + i * 16; if (buf.toString('latin1', o, o + 4) === 'name') { at = buf.readUInt32BE(o + 8); len = buf.readUInt32BE(o + 12); } }
    if (!at || at + len > buf.length) return null;
    const count = buf.readUInt16BE(at + 2), strings = at + buf.readUInt16BE(at + 4);
    let best = null;
    for (let i = 0; i < count; i++) {
      const o = at + 6 + i * 12;
      const platform = buf.readUInt16BE(o), lang = buf.readUInt16BE(o + 4), id = buf.readUInt16BE(o + 6), l = buf.readUInt16BE(o + 8), off = buf.readUInt16BE(o + 10);
      if (platform !== 3 || (id !== 1 && id !== 16)) continue; // Windows records are UTF-16BE; 16 = family for font collections with many weights
      const text = Buffer.from(buf.subarray(strings + off, strings + off + l)).swap16().toString('utf16le').trim();
      if (!text) continue;
      const score = (lang === 0x804 ? 4 : lang === 0x409 ? 2 : 0) + (id === 16 ? 1 : 0);
      if (!best || score > best.score) best = { text, score };
    }
    return best ? best.text : null;
  } catch { return null; }
}

export const cleanName = (s) => String(s || '').replace(/["'\\;{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

// copy a font file into `dir`; returns { id, name, file } or { error: 'kind' | 'size' | 'read' }
export function importFont(src, dir) {
  let buf;
  try { const st = fs.statSync(src); if (st.size > MAX_BYTES) return { error: 'size' }; buf = fs.readFileSync(src); } catch { return { error: 'read' }; }
  const kind = kindOf(buf);
  if (!kind) return { error: 'kind' };
  const id = 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const name = cleanName(familyOf(buf) || path.basename(src).replace(/\.[^.]+$/, '')) || 'Font';
  const file = `${id}.${kind}`;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, file), buf); } catch { return { error: 'read' }; }
  return { id, name, file };
}
export function removeFont(font, dir) { try { fs.unlinkSync(path.join(dir, path.basename(font.file))); } catch {} }

// --- one font per language ------------------------------------------------------------------------
// Each language has its own slot, and each slot's font only covers that language's characters (unicode-range), so
// an English font never takes over Chinese text even if it has Chinese characters, and the other way round.
// Japanese kanji and Chinese hanzi are the same characters in Unicode, so the Japanese slot covers kana only.
export const SLOTS = {
  latin: 'U+0000-036F, U+0370-03FF, U+0400-04FF, U+1E00-1EFF, U+2000-206F, U+2070-20CF, U+2100-218F, U+2190-21FF',
  ja: 'U+3040-30FF, U+31F0-31FF, U+FF65-FF9F',
  ko: 'U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7FF',
  cjk: 'U+2E80-2FDF, U+2FF0-2FFF, U+3000-303F, U+3100-312F, U+31A0-31EF, U+3200-33FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE10-FE1F, U+FE30-FE4F, U+FF00-FFEF, U+20000-2FA1F',
};
export const SLOT_KEYS = Object.keys(SLOTS); // in the order the page tries them (kana before the shared CJK block)

// a weight from a face's style name, as the installed-font list gives it ("Semibold", "Bold Italic", …)
export function weightOf(style) {
  const s = String(style || '').toLowerCase().replace(/[\s_-]/g, '');
  if (/thin|hairline/.test(s)) return 100;
  if (/(extra|ultra)light/.test(s)) return 200;
  if (/semilight|demilight/.test(s)) return 350;
  if (/light/.test(s)) return 300;
  if (/medium/.test(s)) return 500;
  if (/(semi|demi)bold/.test(s)) return 600;
  if (/(extra|ultra)bold/.test(s)) return 800;
  if (/black|heavy/.test(s)) return 900;
  if (/bold/.test(s)) return 700;
  return 400;
}
const q = (s) => String(s || '').replace(/["'\\;{}<>]/g, '').trim();

// What a page needs to set the fonts: for each chosen slot, the faces to load (installed fonts by their full and
// PostScript names, one per weight; imported fonts by their file).
export function slotView(cfg, urlOf) {
  const out = [];
  for (const key of SLOT_KEYS) {
    const v = (cfg.font || {})[key] || 'system';
    let faces = null;
    if (v.startsWith('file:')) {
      const f = (cfg.fonts || []).find((x) => 'file:' + x.id === v);
      if (f) faces = [{ src: `url("${urlOf(f)}")` }];
    } else if (v.startsWith('name:')) {
      const fam = q(v.slice(5)), seen = new Set();
      faces = [];
      for (const x of ((cfg.fontFaces || {})[fam] || [])) {
        const w = weightOf(x.s);
        if (/italic|oblique/i.test(x.s || '') || seen.has(w)) continue;
        seen.add(w);
        faces.push({ src: [x.n, x.p].filter(Boolean).map((n) => `local("${q(n)}")`).join(', '), weight: String(w) });
      }
      if (!faces.length) faces = [{ src: `local("${fam}")` }]; // weights unknown: bold is drawn from the regular face
    }
    if (faces && faces.length) out.push({ key, alias: 'AW-' + key, range: SLOTS[key], faces });
  }
  return out;
}
