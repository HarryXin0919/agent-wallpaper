// Glass view: the task and its progress in a panel at the top, the latest actions as a flow strip below.
// Builds plain DOM (styled by glass.css) from Flow.model; needs scene.js and flow.js first.
(function (root) {
  const ICON = {
    read: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    write: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    run: '<path d="M5 7l5 5-5 5"/><path d="M12.5 18h6.5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.6-4.6"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.6 3.2 14.4 0 18M12 3c-3.2 3.6-3.2 14.4 0 18"/>',
    agent: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="12" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8.4 7.2l7.2 3.6M8.4 16.8l7.2-3.6"/>',
    ask: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
    think: '<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/><path d="M10 20.5h4"/>',
    stuck: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.3"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  };
  const svg = (k, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.8}" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ICON.run}</svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const L = () => root.I18N.t, dur = (ms) => root.I18N.dur(ms), tr = (s) => root.I18N.op(s);
  // which assistant a task belongs to: its name and color (from the settings) on every panel
  const BR = (task) => (task && task.brand) || (task && task.src === 'codex' ? { name: 'Codex', color: '#8fc1ff' } : { name: 'Claude', color: '#f4a98c' });
  const cvar = (b) => `--c:${esc(b.color)}`;
  const brand = (b) => `<span class="brand" style="${cvar(b)}">${esc(b.name)}</span>`;
  const strip = (s) => String(s || '').replace(/<\/?[a-zA-Z_][^>]*>/g, '\n').replace(/[*`#>]/g, '').split('\n').map((l) => l.trim())
    .find((l) => l && !/^(Task|Background) \(from the session/.test(l) && !/[:：]$/.test(l)) || String(s || '').replace(/[*`#>]/g, '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  // privacy mode: only what kind of action it is, never a file name, command or request text
  let PRIV = false;
  const pkind = (k, op) => (k === 'edit' && /^写入/.test(op || '') ? 'write' : k);
  const opText = (o) => (PRIV ? L().pk[pkind(o.kind, o.op || o.title)] || L().pk.other : tr(o.op || o.title || ''));

  function status(st, now) {
    const t = st.tool, l = L();
    const label = () => (PRIV ? l.pk[pkind(t.kind, t.op)] || l.pk.other : tr(t.op || ''));
    switch (st.kind) {
      case 'think': return ['', l.thinking(dur(now - st.since))];
      case 'work': { const s = label(); return ['', PRIV ? s : s.replace(/^(运行：|Run: )/, l.running)]; }
      case 'wait':
        if (st.why === 'approve') return ['wait', t ? l.approve(label().replace(/^运行：/, '运行 ')) : l.approveAny];
        if (t && t.kind === 'wrap') return ['wait', t.target ? l.doneDecide : l.doneReply];
        return ['wait', t && t.target ? l.waitAnswer : l.waitReply];
      case 'stuck':
        if (st.why === 'retry') return ['stuck', l.retry];
        if (st.why === 'errors') return ['stuck', l.errors(st.n)];
        return ['stuck', l.idle(dur(now - st.since))];
      default: return ['done', st.why === 'interrupted' ? l.interrupted : l.done];
    }
  }

  function cardHTML(op, now, vertical) {
    const k = op.kind, l = L();
    const raw = String(op.title || '');
    let title = (PRIV && k !== 'think' && k !== 'stuck' && !(k === 'ask' && op.live) ? opText({ kind: k, op: raw }) : tr(raw)).replace(/^(运行：|派出子代理：|Run: |Subagent: )/, ''), d = '';
    const e = op.e || {};
    if (k === 'think') { title = op.live ? l.thinkNow : l.thought; d = op.live ? `<span class="dots"><i></i><i></i><i></i></span>${dur(op.dur || 0)}` : dur(op.dur || 0); }
    else if (k === 'ask' && op.live) { d = l.waitingYou; }
    else if (k === 'stuck') { d = l.needsLook; }
    else {
      const verb = /^运行：/.test(raw) ? l.run : /^派出子代理/.test(raw) ? l.sub : '';
      const spent = (op.tEnd || now) - op.t;
      if (op.wait) d = l.needsApproval;
      else if (op.err) d = (verb ? verb + ' · ' : '') + l.error;
      else if (op.live) d = `${verb ? verb + ' · ' : ''}${l.inProgress} · ${dur(now - op.t)}`;
      else if (e.plus != null) d = `<span class="p">+${e.plus}</span>${e.minus ? `<span class="m">−${e.minus}</span>` : ''}`;
      else d = (verb ? verb + ' · ' : '') + (spent > 1500 ? dur(spent) : l.finished);
      if (op.sub) d = l.subOps(op.sub.length, e.subDone ? dur((e.subEnd || now) - op.t) : '');
    }
    const cls = ['card', 'k-' + k, op.live ? 'live' : '', op.wait ? 'wait' : '', op.err ? 'err' : ''].join(' ');
    const tag = op.thought > 1500 && k !== 'think' ? `<div class="tag"><i></i><i></i><i></i>&nbsp;${esc(l.thoughtFor(dur(op.thought)))}</div>` : '';
    let branch = '';
    if (op.sub && op.sub.length) {
      const chips = op.sub.slice(-3).map((c, i, a) => `<div class="mini${i === a.length - 1 && !(e.subDone) ? ' live' : ''}">${svg(c.kind)}<span>${esc((c.kind === 'think' ? l.thought : opText({ kind: c.kind, op: c.title })).replace(/^(运行：|Run: )/, '').slice(0, 20))}</span></div>`).join('');
      branch = `<div class="branch${vertical ? '' : ' panel'}" data-k="b${op.t}"><span class="lb">${esc(l.sub)}</span>${chips}</div>`;
    }
    const body = `<div class="${cls}" data-k="c${op.t}${k}">${tag}<div class="ic">${svg(k === 'stuck' ? 'stuck' : k)}</div><div class="tx"><div class="t">${esc(title)}</div><div class="d">${d}</div></div>${vertical ? '' : branch}</div>`;
    return vertical ? body + branch : body;
  }
  // the request as shown: in privacy mode only the session's title
  const titleOf = (m, task) => (PRIV ? task.title || L().task : m.title);

  function render(el, task, now, opts) {
    opts = opts || {}; PRIV = !!opts.privacy;
    const l = L(), m = root.Flow.model(task, now), st = m.st, b = BR(task);
    const [scls, stext] = status(st, now);
    const pr = progress(task, m, now, scls);
    const sayEv = [...task.ev].reverse().find((e) => e.k === 'say' && e.t <= now);
    const ended = st.kind === 'done', title = titleOf(m, task);
    const hero = `<div class="hero panel ${scls} src" style="${cvar(b)}" data-k="hero"${opts.sid ? ` data-sid="${esc(opts.sid)}"` : ''}>
      <div class="top"><div class="status ${scls}"><span class="dot"></span><span>${esc(stext)}</span></div>${brand(b)}
        ${task.tok ? `<div class="ttok">${esc(l.taskTok(fmtTok(task.tok.total)))}</div>` : ''}<div class="open">${esc(l.openIn(b.name))}</div>${opts.sid && (st.kind === 'done' || (st.kind === 'wait' && !st.approval)) ? `<span class="x" data-sid="x|${esc(opts.sid)}" title="${esc(l.clear)}">×</span>` : ''}</div>
      <div class="title">${esc(title)}</div>
      ${!PRIV && task.title && task.title !== title ? `<div class="sub">${esc(task.title)}</div>` : ''}
      ${pr.track}${pr.meta}
      ${sayEv && !ended && !PRIV ? `<div class="said">“${esc(strip(sayEv.text))}”</div>` : ''}
    </div>`;
    // the flow: the latest actions across steps, a divider where a new step began
    const all = [];
    for (const s of m.steps) for (const op of s.ops) all.push(op);
    // lay out inside the largest empty part of the desktop: a wide area gets a strip, a narrow one a column
    const free = opts.free || { x: 110, y: 40, w: (opts.w || 1707) - 220, h: (opts.h || 1067) - 140 };
    const vertical = free.w < 1250, n = (m.plan || []).length;
    const others = (opts.others || []).slice(0, vertical ? 3 : 2).sort(byStart);
    const maxCards = opts.maxCards || (vertical ? clampN(Math.floor((free.h - 360 - others.length * 74) / 92), 2, 7) : 5);
    const shown = all.slice(-maxCards), hidden = all.length - shown.length;
    const parts = [];
    if (hidden > 0) parts.push(`<div class="chip" data-k="chip">${esc(l.earlier(hidden))}</div>`, '<div class="arrow" data-k="achip"></div>');
    shown.forEach((op, i) => {
      const prev = i ? shown[i - 1] : hidden ? all[hidden - 1] : null;
      if (prev && prev.step !== op.step && op.step.i >= 0 && op.step.i < n) parts.push(`<div class="sep" data-k="s${op.step.i}">${esc(l.step(op.step.i + 1))}</div>`);
      if (i) parts.push(`<div class="arrow${op.live ? ' live' : ''}" data-k="a${op.t}"></div>`);
      parts.push(cardHTML(op, now, vertical));
    });
    const flow = shown.length ? `<div class="flow panel" data-k="flow">${parts.join('')}</div>` : '';
    const rest = others.length ? `<div class="others" data-k="others">${others.map((o) => mini(o, now)).join('')}</div>` : '';
    el.className = 'stage' + (opts.text === false ? ' notext' : '');
    el.innerHTML = `<div class="col ${vertical ? 'v' : 'h'}" data-k="col" style="left:${free.x}px;top:${free.y}px;width:${free.w}px;height:${free.h}px">${hero}${flow}${rest}</div>`;
    return { st, vertical, free };
  }

  // the progress bar and step line shared by the full view and the lanes
  // Progress, kept quiet: a thin bar with one segment per step of the task list (a single segment when the stage is
  // inferred from the actions), the percentage at its end, and under it what is being done now, with how long the
  // task has run at the right (whole minutes; when it has ended, how long it took).
  // An inferred percentage is marked with "~".
  function progress(task, m, now, scls) {
    const l = L(), st = m.st, plan = m.plan || [], g = root.Flow.progress(task, now, m);
    const pct = Math.max(0, Math.min(100, g.pct)), live = !(st.kind === 'done' || (st.kind === 'wait' && !st.approval));
    const n = g.plan ? plan.length : 1;
    let segs = '';
    for (let i = 0; i < n; i++) {
      const f = Math.max(0, Math.min(1, (pct * n) / 100 - i));
      segs += `<div class="seg${live && f > 0 && f < 1 ? ' cur' : ''}"><i style="width:${(f * 100).toFixed(1)}%"></i></div>`;
    }
    const label = !live ? '' : g.plan ? (g.cur >= 0 ? (PRIV ? l.step(g.cur + 1) : plan[g.cur].active || plan[g.cur].text) : '') : l.stages[g.stage];
    const ran = (live ? now : Math.min(now, st.since || now)) - task.t0;
    const time = ran > 0 ? (live ? root.I18N.mins(ran) : l.took(root.I18N.mins(ran))) : '';
    return {
      track: `<div class="prog${n > 10 ? ' many' : ''}"><div class="track">${segs}</div><div class="pct">${!g.plan && pct < 100 ? '<small class="ab">~</small>' : ''}${Math.round(pct)}<small>%</small></div></div>`,
      meta: `<div class="meta"><div class="step">${esc(label)}</div><div class="time">${esc(time)}</div></div>`,
      pct,
    };
  }

  // Several tasks at once: one lane each, side by side (wide space) or stacked (narrow space).
  function renderLanes(el, items, now, opts) {
    opts = opts || {}; PRIV = !!opts.privacy;
    const l = L();
    const free = opts.free || { x: 110, y: 40, w: (opts.w || 1707) - 220, h: (opts.h || 1067) - 140 };
    const n = items.length, wide = free.w >= 1250;
    const others = (opts.others || []).slice(0, wide ? 2 : 3).sort(byStart);
    const gap = 18, minis = others.length ? others.length * (wide ? 0 : 68) + (wide ? 76 : 0) : 0;
    const laneH = wide ? free.h - 40 - minis : (free.h - 30 - minis - gap * (n - 1)) / n;
    const k = clampN(Math.floor((laneH - 162) / 64), 1, 6); // a lane is ~176px plus 64px per card
    const lanes = items.map((it) => {
      const task = it.task, m = root.Flow.model(task, now), [scls, stext] = status(m.st, now), pr = progress(task, m, now, scls), b = BR(task);
      const all = []; for (const s of m.steps) for (const op of s.ops) all.push(op);
      const cards = all.slice(-k).map((op) => cardHTML(op, now, true)).join('');
      return `<div class="lane panel ${scls} src" style="${cvar(b)}" data-k="l${esc(it.id)}" data-sid="${esc(it.id)}">
        <div class="top"><div class="status ${scls}"><span class="dot"></span><span>${esc(stext)}</span></div>${brand(b)}${task.tok ? `<div class="ttok">${esc(l.laneTok(fmtTok(task.tok.total)))}</div>` : ''}<div class="open">${esc(l.openIn(b.name))}</div></div>
        <div class="ltitle">${esc(titleOf(m, task))}</div>${pr.track}${pr.meta}
        <div class="lflow" data-k="lf">${cards}</div></div>`;
    }).join('');
    const rest = others.length ? `<div class="others" data-k="others">${others.map((o) => mini(o, now)).join('')}</div>` : '';
    el.className = 'stage' + (opts.text === false ? ' notext' : '');
    el.innerHTML = `<div class="col ${wide ? 'h' : 'v'} lanes" data-k="col" style="left:${free.x}px;top:${free.y}px;width:${free.w}px;height:${free.h}px;--lanes:${n}"><div class="lanebox" data-k="lb">${lanes}</div>${rest}</div>`;
    return { lanes: n, free };
  }

  // another session, kept small: its request, a thin progress bar and what it is doing
  function mini(o, now) {
    const l = L(), st = root.Scene.stateOf(o.task, now), b = BR(o.task);
    const [scls, stext] = status(st, now);
    const pct = Math.round(Math.max(0, Math.min(100, root.Flow.progress(o.task, now).pct)));
    const t = PRIV ? o.title || l.task : /^(Task|Background) \(from the session/.test(o.task.prompt || '') && o.title ? o.title : strip(o.task.prompt) || o.title || '';
    // a finished task says so in words; the bar and the number are only for one still running
    const live = !(st.kind === 'done' || (st.kind === 'wait' && !st.approval));
    const bar = live ? `<div class="mtrack"><div class="mfill" style="width:${pct}%"></div></div>` : '';
    return `<div class="other panel ${scls} src" style="${cvar(b)}" data-k="o${o.id}" data-sid="${esc(o.id)}"><div class="orow"><span class="odot"></span>${brand(b)}<span class="ot">${esc(t)}</span><span class="os">${esc(stext)}${live ? ` · ${pct}%` : ''}</span><span class="x" data-sid="x|${esc(o.id)}" title="${esc(l.clear)}">×</span></div>${bar}</div>`;
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  // small cards are chosen by priority (the order given), then shown in the order their tasks began
  const byStart = (a, b) => ((a.task && a.task.t0) || 0) - ((b.task && b.task.t0) || 0);
  const fmtTok = (n) => root.I18N.tok(n);

  // plan usage and token use, kept compact: one gauge per quota, then a row of numbers.
  // Claude's figures between the desktop app's readings are estimates and say so.
  // opts: { brands: {claude, codex}, show: {h5, week, codex}, warm, hot }
  function usage(u, live, now, opts) {
    if (!u) return '';
    opts = opts || {};
    const l = L(), br = opts.brands || {}, sh = opts.show || {};
    const bc = br.claude || { name: 'Claude', color: '#f4a98c' }, bx = br.codex || { name: 'Codex', color: '#8fc1ff' };
    const gauge = (b, label, pct, resetS, est) => {
      const head = `<div class="ul"><span class="gl"><i class="bd"></i>${esc(b.name)} · ${esc(label)}</span><span>${resetS != null ? esc(root.I18N.reset(resetS)) : ''}</span></div>`;
      if (pct == null) return `<div class="ug" style="${cvar(b)}">${head}<div class="ub"><i style="width:0%"></i></div><div class="un"><b>—</b></div></div>`;
      const left = Math.max(0, 100 - pct), cls = pct >= (opts.hot || 95) ? ' hot' : pct >= (opts.warm || 80) ? ' warm' : '';
      return `<div class="ug${cls}" style="${cvar(b)}">${head}<div class="ub"><i style="width:${Math.min(100, pct)}%"></i></div><div class="un"><b>${est ? esc(l.about) : ''}${esc(l.left(Math.round(left)))}</b><small>${esc(l.used(Math.round(pct)))}</small></div></div>`;
    };
    const p = u.plan || {}, cx = u.codex || null, est = p.src === 'est';
    const days = (u.week && u.week.days) || [];
    const mx = Math.max(1, ...days);
    const spark = days.length ? `<div class="spark">${days.map((d, i) => `<i style="height:${Math.max(6, Math.round((d / mx) * 100))}%"${i === days.length - 1 ? ' class="now"' : ''}></i>`).join('')}</div>` : '';
    const stat = (v, lab, cls, b) => `<div class="us${cls ? ' ' + cls : ''}"${b ? ` style="${cvar(b)}"` : ''}><b>${v}</b><span>${b ? '<i class="bd"></i>' : ''}${esc(lab)}</span></div>`;
    const ago = p.t ? root.I18N.ago(now - p.t) : '';
    const note = p.src === 'live' ? '' : est ? (now - p.t > 6 * 3600e3 ? l.estOld(ago) : l.estNote(ago)) : p.t ? l.appNote(ago) : u.serviceErr ? l.noQuota : '';
    const gs = [];
    if (sh.h5 !== false) gs.push(gauge(bc, l.h5, p.fh, p.fhReset, est));
    if (sh.week !== false) gs.push(gauge(bc, l.week, p.sd, p.sdReset, est));
    if (cx && sh.codex !== false) {
      if (cx.short) gs.push(gauge(bx, l.h5, cx.short.pct, cx.short.resetS));
      gs.push(gauge(bx, l.week, cx.week ? cx.week.pct : null, cx.week ? cx.week.resetS : null));
    }
    return `<div class="usage panel" data-k="usage">
      <div class="uhead"><span class="ut">${esc(l.usage)}</span>${note ? `<span class="unote">${esc(note)}</span>` : ''}</div>
      ${gs.length ? `<div class="ugs" style="--g:${gs.length}">${gs.join('')}</div>` : ''}
      <div class="uss">
        ${stat(u.today ? fmtTok(u.today.tok) : '—', l.todayTok(bc.name), '', bc)}
        ${stat(u.today && u.today.cost != null ? '$' + Math.round(u.today.cost) : '—', l.apiToday)}
        ${cx ? stat(fmtTok(cx.today.tok), l.todayTok(bx.name), '', bx) : ''}
        ${stat(live.perMin > 0 ? fmtTok(live.perMin) + l.perMin : '0', l.live, live.perMin > 0 ? 'live' : '')}
        ${spark ? `<div class="us wk">${spark}<span>${esc(l.week7)}</span></div>` : ''}
      </div></div>`;
  }

  // Largest empty rectangle on the desktop that no icon touches (icons: [{x,y,w,h}] in CSS px).
  // Works on a coarse grid: mark cells under icons (plus a margin), then the classic largest-rectangle-in-histogram.
  function freeRect(icons, W, H, o) {
    o = o || {};
    const cell = o.cell || 16, pad = o.pad == null ? 18 : o.pad, top = o.top || 24, bottom = o.bottom || 70, side = o.side || 24;
    const cols = Math.floor(W / cell), rows = Math.floor(H / cell);
    const busy = Array.from({ length: rows }, () => new Uint8Array(cols));
    const mark = (x0, y0, x1, y1) => { for (let r = Math.max(0, Math.floor(y0 / cell)); r <= Math.min(rows - 1, Math.floor(y1 / cell)); r++) for (let c = Math.max(0, Math.floor(x0 / cell)); c <= Math.min(cols - 1, Math.floor(x1 / cell)); c++) busy[r][c] = 1; };
    mark(0, 0, W, top); mark(0, H - bottom, W, H); mark(0, 0, side, H); mark(W - side, 0, W, H);
    for (const i of icons || []) mark(i.x - pad, i.y - pad, i.x + i.w + pad, i.y + i.h + pad);
    const hgt = new Int32Array(cols);
    let best = { area: 0, x: 0, y: 0, w: W, h: H };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) hgt[c] = busy[r][c] ? 0 : hgt[c] + 1;
      const stack = [];
      for (let c = 0; c <= cols; c++) {
        const hc = c === cols ? 0 : hgt[c];
        let start = c;
        while (stack.length && stack[stack.length - 1][1] >= hc) {
          const [sc, sh] = stack.pop();
          // prefer usable shapes: weigh area, but not slivers
          const w = (c - sc) * cell, h = sh * cell, area = w * h * (w > 560 && h > 520 ? 1 : 0.2);
          if (area > best.area) best = { area, x: sc * cell, y: (r - sh + 1) * cell, w, h };
          start = sc;
        }
        stack.push([start, hc]);
      }
    }
    return { x: best.x, y: best.y, w: best.w, h: best.h };
  }
  root.Glass = { render, renderLanes, freeRect, mini, usage, fmtTok };
})(typeof window !== 'undefined' ? window : globalThis);
