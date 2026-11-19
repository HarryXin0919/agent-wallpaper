// The wallpaper page: frosted-glass panels over your own wallpaper, placed in the empty part of the desktop.
// Rebuilt once a second (and on new data); the DOM is updated in place so animations keep running.
(function () {
  const stage = document.getElementById('stage');
  const wp = document.getElementById('wp');
  let snap = [], st = { paused: false, text: true, covered: false }, icons = null, frames = 0, lastHTML = '', moving = true;

  window.wall.onData((d) => { snap = d; update(); });
  window.wall.onState((s) => { st = s; update(); });
  window.wall.onIcons((list) => { icons = list; update(); });
  let usageData = null;
  window.wall.onUsage((u) => { usageData = u; update(); });
  let hoverId = null, lastTargets = '';
  // tray "clear finished": everything that is not working right now
  window.wall.onClearDone(() => {
    const now = Date.now();
    const ids = snap.filter((s) => { const k = Scene.stateOf(s.task, now); return !(['think', 'work', 'stuck'].includes(k.kind) || (k.kind === 'wait' && k.approval)); }).map((s) => s.id);
    if (ids.length) window.wall.dismiss(ids);
  });
  window.wall.onHover((id) => { hoverId = id; markHover(); });
  function markHover() { for (const el of stage.querySelectorAll('[data-sid]')) el.classList.toggle('hover', el.getAttribute('data-sid') === hoverId); }
  // tell the program where the clickable cards are, so a click on the desktop there can open that session
  function sendTargets() {
    const list = [...stage.querySelectorAll('[data-sid]')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-sid'), x: r.x, y: r.y, w: r.width, h: r.height }; });
    const k = JSON.stringify(list.map((t) => [t.id, Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)]));
    if (k !== lastTargets) { lastTargets = k; window.wall.targets(list); }
  }
  window.wall.onWallpaper(setWallpaper);
  // the settings that change the picture (language, size, position, privacy, …)
  let view = { lang: 'zh', position: 'auto', scale: 1, maxTasks: 4, glass: 'auto', motion: 'full', privacy: false, usage: { show: true }, keepDone: 15, waitDone: 2, brands: {} };
  let liveWall = false;
  function setView(v) {
    if (!v) return;
    view = v; I18N.set(v.lang);
    document.documentElement.lang = v.lang === 'en' ? 'en' : 'zh-CN';
    glassClass();
    document.body.classList.toggle('calm', v.motion !== 'full');
    document.body.classList.toggle('still', v.motion === 'off');
    lastHTML = ''; update();
  }
  // dark glass over a live wallpaper (or when chosen), light glass when chosen
  function glassClass() {
    document.body.classList.toggle('livewp', view.glass === 'dark' || view.glass === 'light' || liveWall);
    document.body.classList.toggle('lightglass', view.glass === 'light');
  }
  window.wall.onView(setView);
  const takeAll = (h) => { if (!h) return; st = h.state; snap = h.data; icons = h.icons; usageData = h.usage || null; if (h.wallpaper) setWallpaper(h.wallpaper); setView(h.view); update(); };
  window.wall.onAll(takeAll);
  window.wall.hello().then(takeAll);

  // the wallpaper, plus a blurred copy made once: the glass panels show it lined up with the real one,
  // which looks like live frosted glass without blurring anything every frame
  let blurURL = null;
  function setWallpaper(w) {
    if (!w) return;
    // the real wallpaper shows through the window; over a moving one (or on macOS) the glass is tinted instead of frosted
    liveWall = !!w.live; glassClass();
    if (w.live || !w.url) return;
    const img = new Image();
    img.onload = () => {
      const W = window.innerWidth, H = window.innerHeight, k = 0.25; // a quarter size is plenty for a blur
      const s = Math.max(W / img.width, H / img.height);              // same framing as "cover"
      const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
      const x = c.getContext('2d');
      x.filter = `blur(${Math.round(30 * k)}px) saturate(165%)`;
      const dw = img.width * s * k, dh = img.height * s * k;
      x.drawImage(img, (c.width - dw) / 2 - 12, (c.height - dh) / 2 - 12, dw + 24, dh + 24);
      c.toBlob((b) => { if (blurURL) URL.revokeObjectURL(blurURL); blurURL = URL.createObjectURL(b); document.documentElement.style.setProperty('--wpblur', `url("${blurURL}")`); }, 'image/jpeg', 0.9);
    };
    img.src = w.url;
  }

  // which session gets the full panels: anything still working first, then the most recent
  const HIDE = 12 * 3600e3;
  function pick(now) {
    const list = [];
    for (const s of snap) {
      let k = Scene.stateOf(s.task, now);
      // finished and waiting for your reply for over 2 hours: treat as done, so it fades out on its own
      if (k.kind === 'wait' && !k.approval && now - k.since > view.waitDone * 3600e3) k = { kind: 'done', since: k.since };
      if (k.kind === 'done' && now - k.since > HIDE) continue;
      list.push({ s, k });
    }
    list.sort((a, b) => ((a.k.kind === 'done') - (b.k.kind === 'done')) || b.s.last - a.s.last);
    return list;
  }
  // a finished task stays clear for a while (15 minutes unless changed), then fades over the next hours
  function fade(k, now) {
    if (k.kind !== 'done') return 1;
    const age = now - k.since, keep = view.keepDone * 60e3, soft = Math.max(keep + 3600e3, 3 * 3600e3);
    if (age < keep) return 1;
    if (age < soft) return 1 - 0.6 * (age - keep) / (soft - keep);
    return Math.max(0, 0.4 * (1 - (age - soft) / Math.max(1, HIDE - soft)));
  }

  function update() {
    const now = Date.now();
    // the page is drawn at the chosen size: everything inside the stage is zoomed, so the space it gets shrinks
    const z = view.scale || 1;
    stage.style.zoom = z === 1 ? '' : String(z);
    const W = window.innerWidth / z, H = window.innerHeight / z;
    const list = pick(now);
    stage.classList.toggle('rest', !!(st.paused || st.covered));
    stage.classList.toggle('notext', st.text === false);
    // usage sits at the top of the empty area; the tasks get the rest
    const free0 = region(W, H);
    const showUsage = usageData && view.usage.show !== false;
    const UH = showUsage ? 214 : 0; // the usage panel is ~196px tall, plus a gap
    // live use: tokens of all replies in the last 5 minutes, per minute
    let sum = 0; for (const s of snap) for (const r of s.task.rate || []) if (now - r[0] < 5 * 60e3) sum += r[1];
    const b = view.brands || {}, u = view.usage || {};
    const uopts = { brands: b, warm: u.warm, hot: u.hot, show: { h5: u.h5 !== false && !(b.claude && b.claude.on === false), week: u.week !== false && !(b.claude && b.claude.on === false), codex: u.codex !== false && !(b.codex && b.codex.on === false) } };
    const usageHTML = showUsage ? `<div class="ucol" data-k="ucol" style="left:${free0.x}px;top:${free0.y + 16}px;width:${free0.w}px">${Glass.usage(usageData, { perMin: sum / 5 }, now, uopts)}</div>` : '';
    if (!list.length) { moving = false; const html = usageHTML; if (html !== lastHTML) { const t = document.createElement('div'); t.innerHTML = html; morphChildren(stage, t); lastHTML = html; } sendTargets(); return; }
    // working right now (thinking, running, stuck, or waiting for an approval mid-task); a finished turn
    // that is waiting for your reply is not "working" and stays a small card
    // which tasks get a lane goes by priority; the lanes themselves stay in the order the tasks began, so a box keeps
    // its place while the tasks run instead of moving whenever another one does something
    const working = list.filter((o) => ['think', 'work', 'stuck'].includes(o.k.kind) || (o.k.kind === 'wait' && o.k.approval)).slice(0, view.maxTasks || 4)
      .sort((a, b) => (a.s.task.t0 || 0) - (b.s.task.t0 || 0));
    moving = working.length > 0; // nothing at work: the animation clock rests
    const free = UH ? { x: free0.x, y: free0.y + UH, w: free0.w, h: free0.h - UH } : free0;
    const tmp = document.createElement('div');
    const small = (skip) => list.filter((o) => !skip.includes(o)).filter((o) => o.k.kind !== 'done' || now - o.k.since < 3 * 3600e3).map((o) => ({ id: o.s.id, title: o.s.title, task: o.s.task }));
    if (working.length >= 2) {
      // several tasks at once: a lane each, so every flow is visible
      Glass.renderLanes(tmp, working.map((o) => ({ id: o.s.id, task: { ...o.s.task, title: o.s.title } })), now, { free, w: W, h: H, text: st.text, others: small(working), privacy: view.privacy });
      tmp.dataset.fade = '1';
    } else {
      const main = working[0] || list[0];
      Glass.render(tmp, { ...main.s.task, title: main.s.title }, now, { free, w: W, h: H, text: st.text, sid: main.s.id, others: small([main]), privacy: view.privacy });
      tmp.dataset.fade = String(fade(main.k, now));
    }
    // only the task panels fade after a task ends; the usage panel stays
    const col = tmp.querySelector('.col'); if (col) col.style.opacity = tmp.dataset.fade;
    tmp.insertAdjacentHTML('afterbegin', usageHTML);
    const html = tmp.innerHTML;
    if (html !== lastHTML) { morphChildren(stage, tmp); lastHTML = html; markHover(); }
    sendTargets();
    frames++;
  }

  // where the panels go: the largest space without icons, or a fixed column on the left, middle or right
  function region(W, H) {
    if (view.position === 'auto' || !view.position) return Glass.freeRect(icons || [], W, H);
    const w = Math.min(W - 48, Math.max(780, W * 0.44)), x = view.position === 'left' ? 24 : view.position === 'right' ? W - w - 24 : (W - w) / 2;
    return { x, y: 24, w, h: H - 94 };
  }

  // --- update the page in place: keep nodes that are the same (by data-k), change only what differs ---
  const key = (n) => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { const c = b.cloneNode(true); a.replaceWith(c); return c; }
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return a; }
    if (a.nodeType !== 1) return a;
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    morphChildren(a, b);
    return a;
  }
  function morphChildren(a, b) {
    const old = [...a.childNodes], byKey = new Map();
    for (const n of old) { const k = key(n); if (k) byKey.set(k, n); }
    const used = new Set(), want = [];
    let i = 0;
    for (const nb of [...b.childNodes]) {
      const k = key(nb);
      let na = k ? byKey.get(k) : null;
      if (!k) { while (i < old.length && (key(old[i]) || used.has(old[i]))) i++; na = old[i++] || null; }
      if (na && !used.has(na)) { used.add(na); want.push(morph(na, nb)); } else want.push(nb.cloneNode(true));
    }
    want.forEach((n, j) => { if (a.childNodes[j] !== n) a.insertBefore(n, a.childNodes[j] || null); });
    while (a.childNodes.length > want.length) a.removeChild(a.lastChild);
  }

  // all motion runs off this clock at 15 frames a second (CSS animations would redraw at the screen's full
  // refresh rate). Each value is a phase from 0 to 1 that glass.css turns into pulses, glows and the moving bead.
  const root = document.documentElement.style;
  const ph = (t, ms) => (t % ms) / ms;
  const ease = (x) => 1 - Math.pow(1 - x, 2);
  setInterval(() => {
    if (st.paused || st.covered || !moving || view.motion !== 'full') return;
    const t = performance.now();
    const a13 = ph(t, 1300);
    root.setProperty('--a18', ease(ph(t, 1800)).toFixed(3));
    root.setProperty('--a20', ease(Math.min(1, ph(t, 2000) / 0.8)).toFixed(3));
    root.setProperty('--s24', (0.5 + 0.5 * Math.sin(ph(t, 2400) * Math.PI * 2)).toFixed(3));
    root.setProperty('--a13', a13.toFixed(3));
    root.setProperty('--f13', Math.min(1, a13 * 5, (1 - a13) * 5).toFixed(3));
    root.setProperty('--sh', Math.min(1, ph(t, 2800) / 0.6).toFixed(3));
    for (const [n, d] of [[1, 0], [2, 200], [3, 400]]) root.setProperty('--b' + n, (0.5 + 0.5 * Math.sin(ph(t + 1200 - d, 1200) * Math.PI * 2)).toFixed(3));
  }, 66);

  // once a second for the timers; nothing at all while paused
  setInterval(() => { if (!st.paused) update(); }, 1000);
  window.addEventListener('resize', update);
  window.__dbg = () => ({ snap: snap.length, icons: icons ? icons.length : null, frames, st, W: innerWidth, H: innerHeight, view, free: region(innerWidth / (view.scale || 1), innerHeight / (view.scale || 1)) });
})();
