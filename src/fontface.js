// Loads the fonts chosen per language (see slotView in src/fonts.mjs) into a page. Used by the wallpaper and by the
// settings window's sample. Returns the font-family names to put in front of the usual fonts.
(function (root) {
  let added = [], key = null, prefix = '';
  function apply(doc, list, onLoad) {
    const k = JSON.stringify(list || []);
    if (k === key) return prefix;
    key = k;
    for (const f of added) { try { doc.fonts.delete(f); } catch {} }
    added = [];
    const loads = [];
    for (const slot of list || []) {
      for (const face of slot.faces) {
        try {
          const f = new FontFace(slot.alias, face.src, { unicodeRange: slot.range, ...(face.weight ? { weight: face.weight } : {}) });
          doc.fonts.add(f); added.push(f); loads.push(f.load().catch(() => null));
        } catch {}
      }
    }
    if (loads.length && onLoad) Promise.all(loads).then(onLoad);
    prefix = (list || []).map((s) => `"${s.alias}", `).join('');
    return prefix;
  }
  root.FontSlots = { apply };
})(typeof window !== 'undefined' ? window : globalThis);
