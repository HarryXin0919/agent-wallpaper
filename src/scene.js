// Draws one task as a calm ink path. Pure canvas, no dependencies; used by the preview and the wallpaper.
// layout(task, now, box) -> geometry for everything that has happened by `now`
// draw(ctx, geo, now, opts) -> paints it (opts.text=false hides all words)
(function (root) {
  const TAU = Math.PI * 2;
  const PAL = {
    line: [236, 229, 216], ripple: [186, 202, 224], node: [176, 186, 198], web: [128, 168, 204],
    edit: [222, 122, 88], wait: [228, 184, 96], stuck: [196, 150, 176], sub: [140, 196, 182], text: [222, 216, 206],
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

  // --- beats: the ordered steps along the main line --------------------------------------------
  function beats(events, now) {
    const out = [];
    let done = 0;
    for (const e of events) {
      if (e.t > now) break;
      if (e.k === 'think') out.push({ type: 'think', t: e.t, dur: Math.min(e.dur, now - e.t), w: 3 + 2.4 * Math.min(Math.sqrt(e.dur / 1000), 7) });
      else if (e.k === 'say') out.push({ type: 'say', t: e.t, text: e.text, w: 5 });
      else if (e.k === 'tool') {
        if (e.kind === 'plan') {
          const c = (e.plan || []).filter((i) => i.status === 'completed').length;
          if (c > done) out.push({ type: 'mile', t: e.t, w: 8, n: c });
          done = c;
          continue;
        }
        if (e.kind === 'wrap' || e.kind === 'other') continue;
        out.push({ type: 'tool', t: e.t, e, w: e.kind === 'agent' ? 12 : e.kind === 'edit' ? 9 : e.kind === 'run' ? 6 : 7 });
      }
    }
    return out;
  }

  // --- the line itself: a slow meander that bends where thinking ran long ----------------------
  // Fixed scale and field, so the part already drawn never changes as the task grows.
  function grow(bs, seed, aspect) {
    const k = 2.2;
    const Bw = 1700, Bh = Bw * aspect;
    const p1 = hash(seed + 'a') * TAU, p2 = hash(seed + 'b') * TAU;
    let x = Bw * 0.08, y = Bh * (0.42 + hash(seed + 'y') * 0.16), th = (hash(seed + 'h') - 0.5) * 0.6;
    const pts = [{ x, y, s: 0 }];
    let s = 0, curlSign = hash(seed + 'c') < 0.5 ? 1 : -1;
    const ds = 2;
    for (const b of bs) {
      b.s0 = s;
      const len = b.w * k;
      const curl = b.type === 'think' ? curlSign * 0.95 * Math.min(1, Math.sqrt(b.dur / 1000) / 5) : 0;
      if (b.type === 'think' && b.dur > 4000) curlSign = -curlSign;
      for (let u = 0; u < len; u += ds) {
        s += ds;
        let dth = 0.62 * Math.cos(s / 230 + p1) / 230 * ds + 0.34 * Math.cos(s / 83 + p2) / 83 * ds;
        dth += curl * ds / Math.max(len, 1);
        const mx = Math.min(x, Bw - x) / (Bw * 0.2), my = Math.min(y, Bh - y) / (Bh * 0.22);
        const edge = 1 - clamp(Math.min(mx, my), 0, 1);
        if (edge > 0) dth += -angDiff(th, Math.atan2(Bh / 2 - y, Bw / 2 - x)) * 0.03 * edge * edge * ds;
        th += dth;
        x += Math.cos(th) * ds; y += Math.sin(th) * ds;
        pts.push({ x, y, s });
      }
      b.s1 = s;
    }
    return pts;
  }

  function sampler(pts) {
    return function at(s) {
      if (!pts.length) return { x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: 1 };
      const step = pts.length > 1 ? pts[1].s - pts[0].s || 2 : 2;
      const i = clamp(Math.round(s / step), 0, pts.length - 1);
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
      let tx = b.x - a.x, ty = b.y - a.y; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
      return { x: pts[i].x, y: pts[i].y, tx, ty, nx: -ty, ny: tx };
    };
  }

  const base = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop();
  const dirOf = (p) => String(p || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/').toLowerCase();
  function keyOf(e) {
    if (e.kind === 'web') { const u = String(e.target || ''); return 'w:' + u.replace(/[?#].*$/, '').toLowerCase(); }
    if (e.kind === 'search' && !(e.files && e.files.length) && e.target) return 'q:' + e.target;
    const f = (e.files && e.files[0]) || e.target;
    return f ? 'f:' + base(f).toLowerCase() + '|' + dirOf(f).split('/').slice(-1)[0] : null;
  }
  function labelOf(e) {
    if (e.kind === 'web') {
      const u = String(e.target || '');
      const m = u.match(/^https?:\/\/([^/]+)(\/[^?#]*)?/);
      return m ? (m[1] + (m[2] && m[2] !== '/' ? m[2].replace(/\/$/, '') : '')).slice(0, 38) : u.slice(0, 38);
    }
    if (e.kind === 'search' && !(e.files && e.files.length)) return String(e.target || '').slice(0, 30);
    return base((e.files && e.files[0]) || e.target);
  }

  // --- everything placed on screen ------------------------------------------------------------
  // Layout in its own fixed coordinates; project() maps it onto a box on screen.
  function layout(task, now, aspect) {
    const seed = String(task.t0);
    const bs = beats(task.ev, now);
    const pts = grow(bs, seed, aspect || 0.62);
    const at = sampler(pts);
    const end = pts.length ? pts[pts.length - 1].s : 0;

    const nodes = new Map(), links = [], ticks = [], rings = [], dots = [], miles = [], branches = [];
    let curS = 0;
    // nudge a new stone off the stones and line drawn so far; older stones never move
    const step = pts.length > 1 ? pts[1].s - pts[0].s || 2 : 2;
    function settle(a, upTo) {
      const last = Math.min(pts.length - 1, Math.round(upTo / step));
      for (let it = 0; it < 30; it++) {
        let fx = (a.ax - a.x) * 0.05, fy = (a.ay - a.y) * 0.05;
        for (const b of nodes.values()) {
          const dx = a.x - b.x, dy = a.y - b.y; if (Math.abs(dx) > 24 || Math.abs(dy) > 24) continue;
          const d = Math.hypot(dx, dy) || 0.01, m = a.kind === 'web' || b.kind === 'web' ? 22 : 15;
          if (d < m) { fx += dx / d * (m - d) * 0.6; fy += dy / d * (m - d) * 0.6; }
        }
        for (let i = 0; i <= last; i += 3) {
          const p = pts[i]; const dx = a.x - p.x, dy = a.y - p.y; if (Math.abs(dx) > 16 || Math.abs(dy) > 16) continue;
          const d = Math.hypot(dx, dy) || 0.01; if (d < 16) { fx += dx / d * (16 - d) * 0.5; fy += dy / d * (16 - d) * 0.5; }
        }
        a.x += fx; a.y += fy;
      }
    }
    function node(e, p, b, extraOut) {
      const key = keyOf(e);
      if (!key) return null;
      let n = nodes.get(key);
      if (!n) {
        const h = hash(key), hd = hash(dirOf(e.files?.[0] || e.target) || key);
        const side = hd < 0.5 ? 1 : -1;
        const web = e.kind === 'web';
        const dist = (web ? 92 + 46 * h : e.kind === 'search' && key.startsWith('q:') ? 20 + 10 * h : 30 + 44 * h) + (extraOut || 0);
        const along = (hash(key + 's') - 0.5) * 26;
        n = { key, kind: e.kind === 'edit' ? 'read' : e.kind, query: key.startsWith('q:'), label: labelOf(e), t: e.t,
          x: p.x + p.nx * side * dist + p.tx * along, y: p.y + p.ny * side * dist + p.ty * along, ax: 0, ay: 0, edits: [] };
        n.ax = n.x; n.ay = n.y;
        settle(n, curS);
        nodes.set(key, n);
      }
      if (e.kind === 'edit') n.edits.push(e.t);
      if (e.kind === 'web') n.kind = 'web';
      links.push({ n, x: p.x, y: p.y, t: e.t, kind: e.kind, sub: !!extraOut });
      return n;
    }

    for (const b of bs) {
      curS = b.s1;
      const p = at(b.type === 'think' ? (b.s0 + b.s1) / 2 : b.s0);
      if (b.type === 'think') { if (b.dur >= 400) rings.push({ x: p.x, y: p.y, dur: b.dur, t: b.t, seed: hash(seed + b.t) }); continue; }
      if (b.type === 'say') { dots.push({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, t: b.t, text: b.text }); continue; }
      if (b.type === 'mile') { miles.push({ x: p.x, y: p.y, t: b.t, n: b.n }); continue; }
      const e = b.e;
      if (e.kind === 'agent') { branches.push({ e, s: b.s0, p }); continue; }
      const err = e.err && (e.tEnd || 0) <= now;
      if (e.kind === 'run' || e.kind === 'session' || e.kind === 'ask' || (e.kind !== 'web' && !keyOf(e))) {
        ticks.push({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, t: e.t, err, ask: e.kind === 'ask' });
        continue;
      }
      node(e, p, b);
      if (err) ticks.push({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, t: e.t, err: true });
    }

    // subagent branches: leave the line, run beside it, rejoin where the result came back
    for (const br of branches) {
      const e = br.e;
      const finished = e.subEnd && e.subEnd <= now;
      const back = finished ? bs.find((b) => b.t >= e.subEnd) : null;
      let sB = back ? Math.max(back.s0, br.s + 70) : null;
      if (sB !== null && sB > end) sB = null;
      const P0 = at(br.s);
      let near = 0; for (const n of nodes.values()) if (Math.hypot(n.x - P0.x, n.y - P0.y) < 160) near += Math.sign((n.x - P0.x) * P0.nx + (n.y - P0.y) * P0.ny);
      const side = near > 0 ? -1 : 1;
      let P3, bulge;
      if (sB !== null) { P3 = at(sB); bulge = clamp(48 + (sB - br.s) * 0.12, 48, 110); }
      else { const len = 120 + 6 * (e.sub || []).filter((x) => x.t <= now).length; bulge = 58; P3 = { x: P0.x + P0.tx * len + P0.nx * side * bulge * 0.9, y: P0.y + P0.ty * len + P0.ny * side * bulge * 0.9, nx: P0.nx, ny: P0.ny, tx: P0.tx, ty: P0.ty }; }
      const c1 = { x: P0.x + P0.nx * side * bulge + P0.tx * 24, y: P0.y + P0.ny * side * bulge + P0.ty * 24 };
      const c2 = sB !== null ? { x: P3.x + P3.nx * side * bulge - P3.tx * 24, y: P3.y + P3.ny * side * bulge - P3.ty * 24 } : { x: P3.x - P0.tx * 40, y: P3.y - P0.ty * 40 };
      const bz = (u) => { const v = 1 - u; return { x: v * v * v * P0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * P3.x, y: v * v * v * P0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * P3.y }; };
      const sub = (e.sub || []).filter((x) => x.t <= now);
      const t0 = e.t, t1 = finished ? e.subEnd : now;
      curS = sB !== null ? sB : end;
      const subBits = [];
      for (const x of sub) {
        const u = clamp((x.t - t0) / Math.max(t1 - t0, 1), 0.08, finished ? 0.88 : 0.96);
        const a = bz(u), b2 = bz(Math.min(1, u + 0.01));
        let tx = b2.x - a.x, ty = b2.y - a.y; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
        const p = { x: a.x, y: a.y, tx, ty, nx: -ty * side, ny: tx * side };
        if (x.k === 'think') { if (x.dur >= 400) rings.push({ x: p.x, y: p.y, dur: x.dur, t: x.t, seed: hash(seed + x.t), sub: true }); }
        else if (x.k === 'tool' && x.kind !== 'plan' && x.kind !== 'other') {
          if (x.kind === 'run' || !keyOf(x)) subBits.push({ x: p.x, y: p.y, t: x.t });
          else node(x, { ...p, nx: p.nx * side, ny: p.ny * side }, null, 6);
        }
      }
      br.geo = { bz, P0, P3, joined: sB !== null, live: !finished, bits: subBits, label: e.target };
    }

    const list = [...nodes.values()];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow2 = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    for (const p of pts) grow2(p.x, p.y, 8);
    for (const n of list) grow2(n.x, n.y, 10);
    for (const br of branches) if (br.geo) for (let u = 0; u <= 1; u += 0.1) { const p = br.geo.bz(u); grow2(p.x, p.y, 10); }
    return { task, pts, end, at, nodes: list, links, ticks, rings, dots, miles, branches, bs, now, bbox: { x0, y0, x1, y1 } };
  }

  // the view (scale + offset) that fits a layout into a box on screen
  function fit(g, box, pad) {
    const b = g.bbox; pad = pad == null ? 70 : pad;
    const w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1);
    const s = Math.min(1.2, (box.w - pad * 2) / w, (box.h - pad * 2) / h);
    return { s, x: box.x + (box.w - w * s) / 2 - b.x0 * s, y: box.y + (box.h - h * s) / 2 - b.y0 * s };
  }
  // a screen-space copy of a layout under a view
  function project(g, v) {
    const M = (p) => ({ ...p, x: p.x * v.s + v.x, y: p.y * v.s + v.y });
    const rk = clamp(Math.pow(v.s, 0.7), 0.55, 1.15);
    const nodes = g.nodes.map(M), byKey = new Map(g.nodes.map((n, i) => [n, nodes[i]]));
    return {
      ...g, view: v,
      pts: g.pts.map(M), nodes,
      links: g.links.map((l) => ({ ...M(l), n: byKey.get(l.n) })),
      ticks: g.ticks.map(M), dots: g.dots.map(M), miles: g.miles.map(M),
      rings: g.rings.map((r) => ({ ...M(r), k: rk })),
      branches: g.branches.map((br) => br.geo ? { ...br, geo: { ...br.geo, bz: (u) => M(br.geo.bz(u)), P0: M(br.geo.P0), P3: M(br.geo.P3), bits: br.geo.bits.map(M) } } : br),
    };
  }

  // --- state at `now`: thinking, working, waiting on you, stuck, or done ------------------------
  // The logs do not record permission prompts, so a step that normally returns at once but has not
  // is read as "waiting for you". Commands get longer, and clearly long ones (builds, tests) never count.
  function stateOf(task, now) {
    const ev = task.ev.filter((e) => e.t <= now);
    if (!ev.length) return { kind: 'think', since: task.t0 };
    const lastAct = Math.max(task.t0, ...ev.map((e) => Math.max(e.t + (e.dur || 0), e.tEnd && e.tEnd <= now ? e.tEnd : 0)));
    // a turn can stop and later continue (an app event wakes it); only the last stop with nothing after it counts
    let lastStop = -1;
    ev.forEach((e, i) => { if (e.k === 'stop') lastStop = i; });
    const stopped = lastStop >= 0 && ev.slice(lastStop + 1).every((e) => e.k === 'stop' || e.k === 'retry');
    let turnStart = 0, i = lastStop - 1;
    while (i >= 0 && (ev[i].k === 'stop' || ev[i].k === 'retry')) i--; // stops arrive in pairs (end of turn + hook summary)
    for (; i >= 0; i--) if (ev[i].k === 'stop') { turnStart = i + 1; break; }
    const tools = ev.filter((e) => e.k === 'tool');
    if (stopped) {
      const turn = ev.slice(turnStart, lastStop + 1);
      const q = ev[lastStop].interrupted ? null : turn.filter((e) => e.k === 'tool' && ((e.kind === 'wrap' && e.ask) || (e.kind === 'ask' && !(e.tEnd <= now)))).pop();
      return { kind: q ? 'wait' : 'done', since: ev[lastStop].t, tool: q, why: q ? 'answer' : ev[lastStop].interrupted ? 'interrupted' : null };
    }
    if (now - lastAct > 2 * 3600e3) return { kind: 'done', since: lastAct, abandoned: true, why: 'abandoned' };
    const pending = tools.filter((e) => !(e.tEnd <= now) && e.kind !== 'agent');
    const done = tools.filter((e) => e.tEnd && e.tEnd <= now);
    const recent = done.slice(-4);
    const errs = recent.filter((e) => e.err).length;
    const retries = ev.filter((e) => e.k === 'retry' && now - e.t < 120000).length;
    const askP = pending.find((e) => e.kind === 'ask' || e.kind === 'session');
    if (askP) return { kind: 'wait', since: askP.t, tool: askP, why: 'answer' };
    if (retries >= 3) return { kind: 'stuck', since: lastAct, why: 'retry' };
    if (errs >= 2 && done.length && done[done.length - 1].err && !pending.length) return { kind: 'stuck', since: lastAct, why: 'errors', n: errs };
    if (pending.length) {
      const p = pending[pending.length - 1], el = now - p.t;
      const slow = p.long || /Claude_Browser__|claude-in-chrome__|computer-use__/.test(p.name || '');
      const limit = p.shell ? 40000 : slow ? 90000 : 8000;
      if (task.mode !== 'bypassPermissions' && !(p.shell && p.long) && el > limit) return { kind: 'wait', since: p.t + limit, approval: true, tool: p, why: 'approve' };
      if (el > 20 * 60000) return { kind: 'stuck', since: p.t, tool: p, why: 'slow' };
      return { kind: 'work', since: p.t, tool: p };
    }
    if (now - lastAct > 8 * 60000) return { kind: 'stuck', since: lastAct, why: 'idle' };
    return { kind: 'think', since: lastAct };
  }

  // --- painting --------------------------------------------------------------------------------
  function ringPath(ctx, x, y, r, seed) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * TAU;
      const rr = r * (1 + 0.05 * Math.sin(3 * a + seed * 9) + 0.035 * Math.sin(5 * a + seed * 17) + 0.02 * Math.sin(7 * a + seed * 29));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function ripple(ctx, r, fade, sub) {
    const d = r.dur / 1000;
    const n = clamp(Math.floor(1 + 1.6 * Math.log2(1 + d / 1.5)), 1, 7);
    const gap = 4.2 + Math.sqrt(d) * 0.95;
    for (let j = 0; j < n; j++) {
      const rad = (5 + j * gap) * (r.k || 1);
      ctx.strokeStyle = rgba(sub ? PAL.sub : PAL.ripple, (0.19 - j * 0.022) * fade);
      ctx.lineWidth = 1;
      ringPath(ctx, r.x, r.y, rad, r.seed + j * 0.13);
      ctx.stroke();
    }
  }
  function measure(ctx, s, size) { ctx.font = `${size}px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif`; return ctx.measureText(s).width; }
  function text(ctx, s, x, y, size, alpha, maxW, align) {
    ctx.font = `${size}px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif`;
    ctx.fillStyle = rgba(PAL.text, alpha);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    // wrap by characters (works for Chinese and English)
    const lines = []; let cur = '';
    for (const ch of String(s).replace(/\s+/g, ' ')) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ''; if (lines.length === 2) break; }
      cur += ch;
    }
    if (lines.length < 2 && cur) lines.push(cur); else if (cur && lines.length === 2) lines[1] = lines[1].replace(/.$/, '…');
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * 1.35));
  }
  const clean = (s) => String(s).replace(/<\/?[a-zA-Z_][^>]*>/g, '\n').replace(/[*`#>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').split('\n').map((l) => l.trim()).find((l) => l && !/^(Task|Background) \(from the session/.test(l) && !/[:：]$/.test(l)) || '';

  function draw(ctx, g, now, opts) {
    opts = opts || {};
    const st = stateOf(g.task, now);
    const live = st.kind !== 'done';
    const age = st.kind === 'done' ? (now - st.since) / 1000 : 0;
    const settle = st.kind === 'done' ? clamp(1 - age / 150, 0, 1) : 1;          // calms over ~2.5 min
    const fadeH = st.kind === 'done' ? clamp(1 - Math.max(0, age - 3600) / (11 * 3600), 0.08, 1) : 1; // fades over hours
    const A = (live ? 1 : 0.62 + 0.38 * settle) * fadeH * (opts.alpha || 1);
    const T = opts.anim || now; // animation clock (ms)
    const recent = (t, span) => clamp(1 - (now - t) / span, 0, 1);
    // layer 'static' = what stays still (cached by the wallpaper), 'anim' = what moves every frame
    const S = opts.layer !== 'anim', An = opts.layer !== 'static';

    // ripples first, under everything
    if (S) for (const r of g.rings) ripple(ctx, r, A * (0.7 + 0.3 * recent(r.t, 90000)), r.sub);

    // threads to files and sources
    if (S) for (const l of g.links) {
      const n = l.n, ed = l.kind === 'edit';
      const mx = (l.x + n.x) / 2 + (n.y - l.y) * 0.18, my = (l.y + n.y) / 2 - (n.x - l.x) * 0.18;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.quadraticCurveTo(mx, my, n.x, n.y);
      const c = ed ? PAL.edit : n.kind === 'web' ? PAL.web : l.sub ? PAL.sub : PAL.node;
      const far = clamp(90 / Math.max(Math.hypot(n.x - l.x, n.y - l.y), 1), 0.3, 1); // long threads back to old files stay faint
      ctx.strokeStyle = rgba(c, ((ed ? 0.22 + 0.28 * recent(l.t, 120000) : 0.2) * A + 0.35 * recent(l.t, 20000)) * far);
      ctx.lineWidth = ed ? 0.9 : 0.7;
      ctx.setLineDash(n.kind === 'web' ? [2, 3] : []);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // subagent branches
    for (const br of g.branches) {
      const geo = br.geo; if (!geo) continue;
      if (S) {
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) { const p = geo.bz(i / 80); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.strokeStyle = rgba(PAL.sub, 0.6 * A); ctx.lineWidth = 1.1; ctx.stroke();
      for (const b of geo.bits) { ctx.fillStyle = rgba(PAL.sub, 0.7 * A); ctx.beginPath(); ctx.arc(b.x, b.y, 1.4, 0, TAU); ctx.fill(); }
      const P0 = geo.P0; ctx.fillStyle = rgba(PAL.sub, 0.9 * A); ctx.beginPath(); ctx.arc(P0.x, P0.y, 2.4, 0, TAU); ctx.fill();
      if (geo.joined) { const P3 = geo.P3; ctx.strokeStyle = rgba(PAL.sub, 0.85 * A); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(P3.x, P3.y, 3.6, 0, TAU); ctx.stroke(); }
      }
      if (geo.live && An) {
        const p = geo.bz(1), pulse = 0.5 + 0.5 * Math.sin(T / 900);
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18); gr.addColorStop(0, rgba(PAL.sub, 0.35 + 0.15 * pulse)); gr.addColorStop(1, rgba(PAL.sub, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(PAL.sub, 0.95); ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill();
      }
    }

    // the main line: dim at the start, brighter toward the present
    const P = g.pts;
    if (S) for (let i = 1; i < P.length; i += 12) {
      const j = Math.min(P.length - 1, i + 12);
      const f = i / Math.max(P.length - 1, 1);
      ctx.beginPath(); ctx.moveTo(P[i - 1].x, P[i - 1].y);
      for (let k = i; k <= j; k++) ctx.lineTo(P[k].x, P[k].y);
      ctx.strokeStyle = rgba(PAL.line, (0.3 + 0.5 * f) * A); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }

    // attempts (commands): short marks across the line; failures leave a small loop
    if (S) for (const t of g.ticks) {
      if (t.err) {
        ctx.strokeStyle = rgba(PAL.stuck, 0.75 * A); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(t.x + t.nx * 4, t.y + t.ny * 4, 3.2, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = rgba(t.ask ? PAL.wait : PAL.line, 0.42 * A + 0.4 * recent(t.t, 15000)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(t.x - t.nx * 4, t.y - t.ny * 4); ctx.lineTo(t.x + t.nx * 4, t.y + t.ny * 4); ctx.stroke();
    }

    // stones: files, searches, sources; edited ones are coral and keep a halo
    for (const n of g.nodes) {
      const edited = n.edits.length > 0;
      const lastEdit = edited ? Math.max(...n.edits) : 0;
      const fresh = recent(n.t, 12000);
      if (edited) {
        const flash = recent(lastEdit, 8000);
        if (flash > 0 && An) {
          const r = 8 + 26 * (1 - flash);
          const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
          gr.addColorStop(0, rgba(PAL.edit, 0.55 * flash)); gr.addColorStop(1, rgba(PAL.edit, 0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
        }
        if (!S) continue;
        ctx.strokeStyle = rgba(PAL.edit, 0.28 * A); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n.x, n.y, 8.5, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(PAL.edit, 0.95 * A + 0.05); ctx.beginPath(); ctx.arc(n.x, n.y, 3.6, 0, TAU); ctx.fill();
        continue;
      }
      if (!S) continue;
      if (n.kind === 'web') {
        ctx.fillStyle = rgba(PAL.web, 0.85 * A); ctx.beginPath(); ctx.arc(n.x, n.y, 3.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(PAL.web, 0.3 * A); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, TAU); ctx.stroke();
      } else if (n.query) {
        ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = rgba(PAL.node, 0.6 * A + 0.3 * fresh); ctx.lineWidth = 1; ctx.strokeRect(-2.2, -2.2, 4.4, 4.4); ctx.restore();
      } else {
        ctx.fillStyle = opts.bg || '#12151a'; ctx.strokeStyle = rgba(PAL.node, 0.66 * A + 0.3 * fresh); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, 3.1, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }

    // milestones from the task list, and the little dots where it wrote to you
    if (S) for (const m of g.miles) { ctx.strokeStyle = rgba(PAL.line, 0.7 * A); ctx.lineWidth = 1.1; ctx.fillStyle = opts.bg || '#12151a'; ctx.beginPath(); ctx.arc(m.x, m.y, 4.4, 0, TAU); ctx.fill(); ctx.stroke(); }
    if (S) for (const d of g.dots) { ctx.fillStyle = rgba(PAL.line, 0.75 * A); ctx.beginPath(); ctx.arc(d.x, d.y, 1.7, 0, TAU); ctx.fill(); }

    // the seed: where you asked
    const s0 = P[0];
    if (s0 && S) {
      ctx.strokeStyle = rgba(PAL.line, 0.8 * A); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(s0.x, s0.y, 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(PAL.line, 0.9 * A); ctx.beginPath(); ctx.arc(s0.x, s0.y, 2.2, 0, TAU); ctx.fill();
    }

    // the tip: what it is doing right now
    const tip = P[P.length - 1];
    if (tip && (st.kind === 'done' ? S : An)) {
      if (st.kind === 'think') {
        const el = (now - st.since) / 1000;
        const n = clamp(Math.floor(1 + 1.6 * Math.log2(1 + el / 1.5)), 1, 7);
        for (let j = 0; j < n; j++) {
          const ph = ((T / 4200) + j / n) % 1;
          const r = 4 + ph * (18 + Math.sqrt(el) * 5);
          ctx.strokeStyle = rgba(PAL.ripple, 0.32 * (1 - ph)); ctx.lineWidth = 1;
          ringPath(ctx, tip.x, tip.y, r, 0.37 + j * 0.11); ctx.stroke();
        }
        glow(ctx, tip, PAL.line, 20, 0.28); dot(ctx, tip, PAL.line, 2.6, 0.95);
      } else if (st.kind === 'work') {
        glow(ctx, tip, PAL.line, 16, 0.22 + 0.06 * Math.sin(T / 700)); dot(ctx, tip, PAL.line, 2.4, 0.95);
      } else if (st.kind === 'wait') {
        const b = 0.5 + 0.5 * Math.sin(T / 5000 * TAU);
        glow(ctx, tip, PAL.wait, 30 + 8 * b, 0.22 + 0.16 * b); dot(ctx, tip, PAL.wait, 3, 0.95);
        const ph = (T / 6000) % 1; ctx.strokeStyle = rgba(PAL.wait, 0.35 * (1 - ph)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tip.x, tip.y, 6 + ph * 34, 0, TAU); ctx.stroke();
      } else if (st.kind === 'stuck') {
        const a = T / 3000 * TAU;
        ctx.strokeStyle = rgba(PAL.stuck, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tip.x, tip.y, 9, 0, TAU); ctx.stroke();
        dot(ctx, { x: tip.x + Math.cos(a) * 9, y: tip.y + Math.sin(a) * 9 }, PAL.stuck, 2, 0.9);
        glow(ctx, tip, PAL.stuck, 22, 0.18); dot(ctx, tip, PAL.stuck, 2.4, 0.9);
      } else {
        ctx.strokeStyle = rgba(PAL.line, 0.7 * A); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tip.x, tip.y, 6.5, 0, TAU); ctx.stroke();
        dot(ctx, tip, PAL.line, 3, 0.85 * A);
        if (settle > 0) glow(ctx, tip, PAL.line, 26, 0.2 * settle);
      }
    }

    if (opts.text === false || !S) return st;
    // words, small and quiet: the request, the latest progress note, and file names
    // labels share one list across all sessions on screen, and stay near their own session's area
    const W = opts.w || 1e9, taken = opts.taken || [], bx = opts.box;
    const inBox = (r) => !bx || (r.x > bx.x - 60 && r.x + r.w < bx.x + bx.w + 60 && r.y > bx.y - 40 && r.y + r.h < bx.y + bx.h + 40);
    const free = (r) => r.x > 4 && r.x + r.w < W - 4 && inBox(r) && !taken.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    // place a label beside a point, trying right, left, above, below; skip it if every spot is taken
    function put(s, x, y, size, alpha, maxW, lines) {
      s = String(s); if (!s) return;
      const w = Math.min(maxW, measure(ctx, s, size)), h = size * 1.35 * Math.min(lines || 1, Math.ceil(measure(ctx, s, size) / maxW) || 1);
      for (const [lx, ly] of [[x + 8, y - h / 2], [x - 8 - w, y - h / 2], [x - w / 2, y - h - 7], [x - w / 2, y + 7]]) {
        const r = { x: lx - 2, y: ly - 2, w: w + 4, h: h + 4 };
        if (!free(r)) continue;
        taken.push(r); text(ctx, s, lx, ly + size * 0.68, size, alpha, maxW); return true;
      }
    }
    const short = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    // the request comes first; a brief handed over from another session reads better as that session's title
    const ask = /^(Task|Background) \(from the session/.test(g.task.prompt) && g.task.title ? g.task.title : clean(g.task.prompt);
    for (let i = 0; i < P.length; i += 4) taken.push({ x: P[i].x - 3, y: P[i].y - 3, w: 6, h: 6 }); // never cover the line
    if (s0 && !opts.noPrompt) for (const dy of [-18, 18, -38, 38, -60, 60]) if (put(short(ask, 60), s0.x - 6, s0.y + dy, 12.5, 0.5 * A + 0.1, 330, 2)) break;
    for (const n of g.nodes) taken.push({ x: n.x - 5, y: n.y - 5, w: 10, h: 10 }); // nor a stone
    for (const m of g.miles) if (m.n) put(String(m.n), m.x, m.y, 9.5, 0.45 * A, 20);
    const lastSay = opts.noPrompt ? null : g.dots[g.dots.length - 1];
    if (lastSay && tip) { const fresh = recent(lastSay.t, 120000); put(clean(lastSay.text), tip.x, tip.y + 20, 11.5, live ? 0.34 + 0.24 * fresh : 0.3 * A, 290, 2); }
    for (const br of g.branches) if (br.geo && br.geo.label) { const p = br.geo.bz(0.5); put(short(br.geo.label, 30), p.x, p.y, 10, 0.36 * A, 200); }
    const rank = (n) => (n.edits.length ? 3 : 0) + (n.kind === 'web' ? 1 : 0) + recent(n.t, 300000) * 2;
    for (const n of [...g.nodes].sort((a, b) => rank(b) - rank(a))) if (n.label) put(short(n.label, 28), n.x, n.y, 10, (n.edits.length ? 0.44 : n.kind === 'web' ? 0.32 : 0.26) * A, 190);
    return st;
  }
  function glow(ctx, p, c, r, a) { const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }
  function dot(ctx, p, c, r, a) { ctx.fillStyle = rgba(c, a); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }

  // background: deep ink, a soft light where work is happening, faint paper grain
  function backdrop(ctx, w, h, focus) {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0f1216'); g.addColorStop(1, '#151920');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (focus) { const r = Math.max(w, h) * 0.55; const gr = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, r); gr.addColorStop(0, 'rgba(120,132,150,0.10)'); gr.addColorStop(1, 'rgba(120,132,150,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    if (!backdrop.grain) {
      const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); const id = x.createImageData(160, 160);
      for (let i = 0; i < id.data.length; i += 4) { const v2 = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v2; id.data[i + 3] = 10; }
      x.putImageData(id, 0, 0); backdrop.grain = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = backdrop.grain; ctx.fillRect(0, 0, w, h);
  }

  // --- the progress and activity block beside each path --------------------------------------
  const FONT = '"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif';
  function fitText(ctx, s, size, maxW, weight) {
    ctx.font = `${weight || 400} ${size}px ${FONT}`;
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function line(ctx, s, x, y, size, color, alpha, maxW, weight, align) {
    const t = fitText(ctx, s, size, maxW, weight);
    ctx.fillStyle = rgba(color, alpha); ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  const dur = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    if (m < 60) return m < 10 && s % 60 ? `${m} 分 ${s % 60} 秒` : `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  };
  const ago = (ms) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} 秒前` : ms < 3600e3 ? `${Math.round(ms / 60000)} 分钟前` : `${Math.round(ms / 3600e3)} 小时前`);
  const GREEN = [150, 196, 150];
  // what it is doing right now, in words
  function nowLine(st, now) {
    const t = st.tool;
    switch (st.kind) {
      case 'think': return { c: PAL.ripple, s: `正在思考 · ${dur(now - st.since)}` };
      case 'work': return { c: PAL.line, s: t.op + (now - t.t > 4000 ? ` · ${dur(now - t.t)}` : ''), d: t };
      case 'wait':
        if (st.why === 'approve') return { c: PAL.wait, s: `等你批准：${String(t.op || '').replace(/^运行：/, '运行 ')}` };
        if (t && t.kind === 'wrap') return { c: PAL.wait, s: t.target ? `做完了，在等你决定：${t.target}` : '做完了，在等你回复' };
        if (t && t.kind === 'session') return { c: PAL.wait, s: `在等你决定：${t.op}` };
        return { c: PAL.wait, s: t && t.target ? `等你回答：${t.target}` : '在等你回复' };
      case 'stuck':
        if (st.why === 'retry') return { c: PAL.stuck, s: '连不上服务器，正在重试' };
        if (st.why === 'errors') return { c: PAL.stuck, s: `可能卡住了：最近 ${st.n} 步出错` };
        if (st.why === 'slow') return { c: PAL.stuck, s: `${t.op} · 已经 ${dur(now - t.t)}` };
        return { c: PAL.stuck, s: `${dur(now - st.since)}没有动静` };
      default:
        if (st.why === 'interrupted') return { c: PAL.node, s: '被你中断了' };
        if (st.why === 'abandoned') return { c: PAL.node, s: '已停下' };
        return { c: PAL.node, s: '已完成' };
    }
  }

  // box: {x, y, w}. Returns the height used. opts.text=false keeps only the bar and the dot.
  function card(ctx, task, now, box, opts) {
    opts = opts || {};
    const A = opts.alpha == null ? 1 : opts.alpha, T = opts.anim || now, words = opts.text !== false;
    const st = stateOf(task, now);
    const ev = task.ev.filter((e) => e.t <= now);
    const fade = st.kind === 'done' ? clamp(1 - Math.max(0, now - st.since - 3600e3) / (11 * 3600e3), 0.25, 1) * 0.8 : 1;
    const a = A * fade;
    const x = box.x, w = box.w;
    let y = box.y;
    // 1. the request
    if (words) {
      const ask = /^(Task|Background) \(from the session/.test(task.prompt || '') && task.title ? task.title : clean(task.prompt) || task.title || '';
      y += 18; line(ctx, ask, x, y, 17, PAL.text, 0.85 * a, w, 600);
      if (task.title && task.title !== ask) { y += 20; line(ctx, task.title, x, y, 12, PAL.text, 0.36 * a, w); }
      y += 16;
    }
    // 2. the task list as a segmented bar, with the current step
    const pe = [...ev].reverse().find((e) => e.plan && e.plan.length);
    const plan = pe && pe.plan;
    if (plan) {
      const n = plan.length, gap = 4, cw = (w - 40 - gap * (n - 1)) / n, doneN = plan.filter((i) => i.status === 'completed').length;
      const cur = plan.findIndex((i) => i.status === 'in_progress');
      for (let i = 0; i < n; i++) {
        const it = plan[i], bx = x + i * (cw + gap);
        let al = 0.16, c = PAL.line;
        if (it.status === 'completed') al = 0.78;
        else if (it.status === 'in_progress') { c = st.kind === 'wait' ? PAL.wait : PAL.line; al = st.kind === 'done' ? 0.4 : 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(T / 650)); }
        ctx.fillStyle = rgba(c, al * a);
        rr(ctx, bx, y + 2, cw, 5, 2.5); ctx.fill();
      }
      if (words) line(ctx, `${doneN}/${n}`, x + w, y + 9, 13, PAL.text, 0.65 * a, 40, 600, 'right');
      y += 18;
      if (words) {
        const it = cur >= 0 ? plan[cur] : null;
        // when did the current step start? the first plan update that showed it in progress
        let since = null;
        if (it) for (const e of ev) if (e.plan && e.plan[cur] && e.plan[cur].status === 'in_progress') { since = e.t; break; }
        const tail = since && st.kind !== 'done' ? `  · ${dur(now - since)}` : '';
        const label = it ? `第 ${cur + 1} 步 · ${it.active || it.text}` : doneN === n ? '清单上的步骤都做完了' : `下一步 · ${(plan.find((i) => i.status === 'pending') || {}).text || ''}`;
        y += 14;
        const tw = tail ? line(ctx, tail, x + w, y, 12, PAL.text, 0.4 * a, 90, 400, 'right') : 0;
        line(ctx, label, x, y, 13, PAL.text, 0.66 * a, w - tw - 6);
        y += 8;
      }
    }
    // 3. right now
    const nl = nowLine(st, now);
    y += 18;
    const live = st.kind !== 'done';
    const pulse = live ? 0.65 + 0.35 * Math.sin(T / (st.kind === 'wait' ? 800 : 500)) : 0.6;
    ctx.fillStyle = rgba(nl.c, pulse * a); ctx.beginPath(); ctx.arc(x + 4, y - 4.5, 3.6, 0, TAU); ctx.fill();
    if (live) { ctx.strokeStyle = rgba(nl.c, 0.25 * a); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 4, y - 4.5, 7, 0, TAU); ctx.stroke(); }
    if (words) {
      const wd = line(ctx, nl.s, x + 16, y, 15.5, nl.c, (live ? 0.95 : 0.6) * a, w - 16 - (nl.d && nl.d.plus != null ? 70 : 0), 600);
      if (nl.d && nl.d.plus != null) diff(ctx, nl.d, x + 16 + wd + 8, y, 12.5, a);
      // what it last wrote to you
      const say = [...ev].reverse().find((e) => e.k === 'say');
      const said = say && (clean(say.text) || String(say.text).replace(/[*`#>]/g, '').split(String.fromCharCode(10)).map((l) => l.trim()).find(Boolean) || '');
      if (said && live) { y += 21; line(ctx, '“' + said + '”', x + 16, y, 13, PAL.text, 0.45 * a, w - 16); }
    }
    // 4. the last few steps
    if (words) {
      const cur = st.tool;
      const steps = ev.filter((e) => e.k === 'tool' && e.op && e !== cur && !/^(更新任务清单|加载工具|收尾总结)$/.test(e.op)).slice(-4).reverse();
      y += 8;
      steps.forEach((e, i) => {
        y += 19;
        const al = (0.5 - i * 0.09) * a, c = e.err ? PAL.stuck : PAL.text;
        const right = ago(now - e.t) + (e.err ? ' · 出错' : '');
        const rw = line(ctx, right, x + w, y, 11, c, al * 0.8, 90, 400, 'right');
        const wd = line(ctx, e.op, x + 16, y, 12, c, al, w - 16 - rw - 12 - (e.plus != null ? 64 : 0));
        if (e.plus != null) diff(ctx, e, x + 16 + wd + 7, y, 11.5, al / 0.5 * 0.8);
        ctx.fillStyle = rgba(c, al * 0.8); ctx.fillRect(x + 2, y - 4, 5, 1);
      });
      // 5. totals
      const tools = ev.filter((e) => e.k === 'tool');
      const count = (k) => tools.filter((e) => e.kind === k).length;
      const thinkS = ev.filter((e) => e.k === 'think').reduce((s2, e) => s2 + (e.dur || 0), 0);
      const parts = [`已用 ${dur((st.kind === 'done' ? st.since : now) - task.t0)}`, thinkS > 1000 ? `思考 ${dur(thinkS)}` : null,
        count('read') ? `读 ${count('read')}` : null, count('edit') ? `改 ${count('edit')}` : null, count('run') ? `运行 ${count('run')}` : null,
        count('search') ? `搜索 ${count('search')}` : null, count('web') ? `网页 ${count('web')}` : null, count('agent') ? `子代理 ${count('agent')}` : null].filter(Boolean);
      y += 24; line(ctx, parts.join(' · '), x, y, 11, PAL.text, 0.34 * a, w);
    }
    return y - box.y;
  }
  function diff(ctx, e, x, y, size, a) {
    const p = `+${e.plus}`, m = e.minus ? ` −${e.minus}` : '';
    const wp = line(ctx, p, x, y, size, GREEN, 0.75 * a, 60, 600);
    if (m) line(ctx, m, x + wp, y, size, PAL.edit, 0.75 * a, 60, 600);
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  root.Scene = { layout, fit, project, draw, card, backdrop, stateOf, PAL };
})(typeof window !== 'undefined' ? window : globalThis);
