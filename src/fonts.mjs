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
