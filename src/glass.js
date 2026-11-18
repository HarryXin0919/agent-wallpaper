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
  const dur = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    if (m < 60) return m < 10 && s % 60 ? `${m} 分 ${s % 60} 秒` : `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  };
  // which assistant a task belongs to: its color and name on every panel
  const SRC = (task) => (task && task.src === 'codex' ? 'codex' : 'claude');
  const NAME = { claude: 'Claude', codex: 'Codex' };
  const brand = (src) => `<span class="brand ${src}">${NAME[src]}</span>`;
  const strip = (s) => String(s || '').replace(/<\/?[a-zA-Z_][^>]*>/g, '\n').replace(/[*`#>]/g, '').split('\n').map((l) => l.trim())
    .find((l) => l && !/^(Task|Background) \(from the session/.test(l) && !/[:：]$/.test(l)) || String(s || '').replace(/[*`#>]/g, '').split('\n').map((l) => l.trim()).find(Boolean) || '';

  function status(st, now) {
    const t = st.tool;
    switch (st.kind) {
      case 'think': return ['', `正在思考 · ${dur(now - st.since)}`];
      case 'work': return ['', `${String(t.op || '').replace(/^运行：/, '正在运行：')}`];
      case 'wait':
        if (st.why === 'approve') return ['wait', `等你批准：${String(t.op || '').replace(/^运行：/, '运行 ')}`];
        if (t && t.kind === 'wrap') return ['wait', t.target ? `做完了，等你决定` : '做完了，等你回复'];
        return ['wait', t && t.target ? `等你回答` : '等你回复'];
      case 'stuck':
        if (st.why === 'retry') return ['stuck', '连不上服务器，正在重试'];
        if (st.why === 'errors') return ['stuck', `可能卡住了 · 最近 ${st.n} 步出错`];
        return ['stuck', `${dur(now - st.since)}没有动静`];
      default: return ['done', st.why === 'interrupted' ? '被你中断' : '已完成'];
    }
  }

  function cardHTML(op, now, vertical) {
    const k = op.kind;
    let title = String(op.title || '').replace(/^(运行：|派出子代理：)/, ''), d = '';
    const e = op.e || {};
    if (k === 'think') { title = op.live ? '正在思考' : '思考'; d = op.live ? `<span class="dots"><i></i><i></i><i></i></span>${dur(op.dur || 0)}` : dur(op.dur || 0); }
    else if (k === 'ask' && op.live) { d = '在等你'; }
    else if (k === 'stuck') { d = '需要你看一眼'; }
    else {
      const verb = /^运行：/.test(op.title) ? '运行' : /^派出子代理/.test(op.title) ? '子代理' : '';
      const spent = (op.tEnd || now) - op.t;
      if (op.wait) d = '等你批准';
      else if (op.err) d = (verb ? verb + ' · ' : '') + '出错';
      else if (op.live) d = `${verb ? verb + ' · ' : ''}进行中 · ${dur(now - op.t)}`;
      else if (e.plus != null) d = `<span class="p">+${e.plus}</span>${e.minus ? `<span class="m">−${e.minus}</span>` : ''}`;
      else d = (verb ? verb + ' · ' : '') + (spent > 1500 ? dur(spent) : '完成');
      if (op.sub) d = `子代理 · ${op.sub.length} 个操作${e.subDone ? ` · ${dur((e.subEnd || now) - op.t)}` : ' · 进行中'}`;
    }
    const cls = ['card', 'k-' + k, op.live ? 'live' : '', op.wait ? 'wait' : '', op.err ? 'err' : ''].join(' ');
    const tag = op.thought > 1500 && k !== 'think' ? `<div class="tag"><i></i><i></i><i></i>&nbsp;思考 ${dur(op.thought)}</div>` : '';
    let branch = '';
    if (op.sub && op.sub.length) {
      const chips = op.sub.slice(-3).map((c, i, a) => `<div class="mini${i === a.length - 1 && !(e.subDone) ? ' live' : ''}">${svg(c.kind)}<span>${esc(String(c.title).replace(/^运行：/, '').slice(0, 20))}</span></div>`).join('');
      branch = `<div class="branch${vertical ? '' : ' panel'}" data-k="b${op.t}"><span class="lb">子代理</span>${chips}</div>`;
    }
    const body = `<div class="${cls}" data-k="c${op.t}${k}">${tag}<div class="ic">${svg(k === 'stuck' ? 'stuck' : k)}</div><div class="tx"><div class="t">${esc(title)}</div><div class="d">${d}</div></div>${vertical ? '' : branch}</div>`;
    return vertical ? body + branch : body;
  }

  function render(el, task, now, opts) {
    opts = opts || {};
    const m = root.Flow.model(task, now);
    const st = m.st;
    const [scls, stext] = status(st, now);
    const plan = m.plan || [];
    const n = plan.length, done = plan.filter((p) => p.status === 'completed').length;
    const cur = plan.findIndex((p) => p.status === 'in_progress');
    // progress: finished steps, plus half of the one in progress
    const frac = n ? Math.min(1, (done + (cur >= 0 && st.kind !== 'done' ? 0.5 : 0)) / n) : 0;
    let since = null;
    if (cur >= 0) for (const e of task.ev) if (e.t <= now && e.plan && e.plan[cur] && e.plan[cur].status === 'in_progress') { since = e.t; break; }
    const nodes = plan.map((p, i) => {
      const left = n > 1 ? (i / (n - 1)) * 100 : 50;
      const c = p.status === 'completed' ? 'done' : p.status === 'in_progress' ? 'cur' + (scls === 'wait' ? ' wait' : '') : '';
      return `<div class="node ${c}" style="left:${left}%">${p.status === 'completed' ? svg('check', 3) : ''}</div>`;
    }).join('');
    const fillPct = n > 1 ? Math.min(100, ((done - 1 + (cur >= 0 && st.kind !== 'done' ? 0.5 : 0)) / (n - 1)) * 100) : frac * 100;
    const stepLabel = cur >= 0 ? `<b>第 ${cur + 1} 步</b>${esc(plan[cur].active || plan[cur].text)}${since && st.kind !== 'done' ? `<span>${dur(now - since)}</span>` : ''}` : n && done === n ? '<b>全部步骤</b>已完成' : '<b>还没有列出步骤</b>';
    const sayEv = [...task.ev].reverse().find((e) => e.k === 'say' && e.t <= now);
    const ended = st.kind === 'done';
    const src = SRC(task);
    const hero = `<div class="hero panel ${scls} src-${src}" data-k="hero"${opts.sid ? ` data-sid="${esc(opts.sid)}"` : ''}>
      <div class="top"><div class="status ${scls}"><span class="dot"></span><span>${esc(stext)}</span></div>${brand(src)}
        ${task.tok ? `<div class="ttok">本任务 ${fmtTok(task.tok.total)} tokens</div>` : ''}<div class="open">在 ${NAME[src]} 中打开 ›</div>${opts.sid && (st.kind === 'done' || (st.kind === 'wait' && !st.approval)) ? `<span class="x" data-sid="x|${esc(opts.sid)}" title="清除">×</span>` : ''}</div>
      <div class="title">${esc(m.title)}</div>
      ${task.title && task.title !== m.title ? `<div class="sub">${esc(task.title)}</div>` : ''}
      ${n ? `<div class="track"><div class="fill" style="width:${Math.max(0, fillPct)}%"></div>${nodes}</div>` : ''}
      <div class="meta"><div class="step">${stepLabel}</div>${n ? `<div class="count">${done} / ${n}<small>步</small></div>` : ''}</div>
      ${sayEv && !ended ? `<div class="said">“${esc(strip(sayEv.text))}”</div>` : ''}
    </div>`;
    // the flow: the latest actions across steps, a divider where a new step began
    const all = [];
    for (const s of m.steps) for (const op of s.ops) all.push(op);
    // lay out inside the largest empty part of the desktop: a wide area gets a strip, a narrow one a column
    const free = opts.free || { x: 110, y: 40, w: (opts.w || 1707) - 220, h: (opts.h || 1067) - 140 };
    const vertical = free.w < 1250;
    const others = (opts.others || []).slice(0, vertical ? 3 : 2);
    const maxCards = opts.maxCards || (vertical ? clampN(Math.floor((free.h - 360 - others.length * 74) / 92), 2, 7) : 5);
    const shown = all.slice(-maxCards), hidden = all.length - shown.length;
    let parts = [];
    if (hidden > 0) parts.push(`<div class="chip" data-k="chip">之前 ${hidden} 个操作</div>`, '<div class="arrow" data-k="achip"></div>');
    shown.forEach((op, i) => {
      const prev = i ? shown[i - 1] : hidden ? all[hidden - 1] : null;
      if (prev && prev.step !== op.step && op.step.i >= 0 && op.step.i < n) parts.push(`<div class="sep" data-k="s${op.step.i}">第 ${op.step.i + 1} 步</div>`);
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
  function progress(task, m, now, scls) {
    const st = m.st, plan = m.plan || [];
    const n = plan.length, done = plan.filter((p) => p.status === 'completed').length;
    const cur = plan.findIndex((p) => p.status === 'in_progress');
    let since = null;
    if (cur >= 0) for (const e of task.ev) if (e.t <= now && e.plan && e.plan[cur] && e.plan[cur].status === 'in_progress') { since = e.t; break; }
    const nodes = plan.map((p, i) => {
      const left = n > 1 ? (i / (n - 1)) * 100 : 50;
      const c = p.status === 'completed' ? 'done' : p.status === 'in_progress' ? 'cur' + (scls === 'wait' ? ' wait' : '') : '';
      return `<div class="node ${c}" style="left:${left}%">${p.status === 'completed' ? svg('check', 3) : ''}</div>`;
    }).join('');
    const fillPct = n > 1 ? Math.min(100, ((done - 1 + (cur >= 0 && st.kind !== 'done' ? 0.5 : 0)) / (n - 1)) * 100) : 0;
    const stepLabel = cur >= 0 ? `<b>第 ${cur + 1} 步</b>${esc(plan[cur].active || plan[cur].text)}${since && st.kind !== 'done' ? `<span>${dur(now - since)}</span>` : ''}` : n && done === n ? '<b>全部步骤</b>已完成' : '<b>还没有列出步骤</b>';
    return {
      track: n ? `<div class="track"><div class="fill" style="width:${Math.max(0, fillPct)}%"></div>${nodes}</div>` : '',
      meta: `<div class="meta"><div class="step">${stepLabel}</div>${n ? `<div class="count">${done} / ${n}<small>步</small></div>` : ''}</div>`,
    };
  }

  // Several tasks at once: one lane each, side by side (wide space) or stacked (narrow space).
  // Each lane: status, request, progress bar, current step, and its latest actions.
  function renderLanes(el, items, now, opts) {
    opts = opts || {};
    const free = opts.free || { x: 110, y: 40, w: (opts.w || 1707) - 220, h: (opts.h || 1067) - 140 };
    const n = items.length, wide = free.w >= 1250;
    const others = (opts.others || []).slice(0, wide ? 2 : 3);
    const gap = 18, minis = others.length ? others.length * (wide ? 0 : 68) + (wide ? 76 : 0) : 0;
    const laneH = wide ? free.h - 40 - minis : (free.h - 30 - minis - gap * (n - 1)) / n;
    const k = clampN(Math.floor((laneH - 162) / 64), 1, 6); // a lane is ~176px plus 64px per card
    const lanes = items.map((it) => {
      const task = it.task, m = root.Flow.model(task, now), [scls, stext] = status(m.st, now), pr = progress(task, m, now, scls), src = SRC(task);
      const all = []; for (const s of m.steps) for (const op of s.ops) all.push(op);
      const cards = all.slice(-k).map((op) => cardHTML(op, now, true)).join('');
      return `<div class="lane panel ${scls} src-${src}" data-k="l${esc(it.id)}" data-sid="${esc(it.id)}">
        <div class="top"><div class="status ${scls}"><span class="dot"></span><span>${esc(stext)}</span></div>${brand(src)}${task.tok ? `<div class="ttok">${fmtTok(task.tok.total)} tokens</div>` : ''}<div class="open">在 ${NAME[src]} 中打开 ›</div></div>
        <div class="ltitle">${esc(m.title)}</div>${pr.track}${pr.meta}
        <div class="lflow" data-k="lf">${cards}</div></div>`;
    }).join('');
    const rest = others.length ? `<div class="others" data-k="others">${others.map((o) => mini(o, now)).join('')}</div>` : '';
    el.className = 'stage' + (opts.text === false ? ' notext' : '');
    el.innerHTML = `<div class="col ${wide ? 'h' : 'v'} lanes" data-k="col" style="left:${free.x}px;top:${free.y}px;width:${free.w}px;height:${free.h}px;--lanes:${n}"><div class="lanebox" data-k="lb">${lanes}</div>${rest}</div>`;
    return { lanes: n, free };
  }

  // another session, kept small: its request, a thin progress bar and what it is doing
  function mini(o, now) {
    const st = root.Scene.stateOf(o.task, now);
    const [scls, stext] = status(st, now);
    const planEv = o.task.ev.filter((e) => e.t <= now && e.plan && e.plan.length).pop();
    const plan = planEv ? planEv.plan : [];
    const n = plan.length, done = plan.filter((p) => p.status === 'completed').length, cur = plan.some((p) => p.status === 'in_progress') && st.kind !== 'done' ? 0.5 : 0;
    const t = /^(Task|Background) \(from the session/.test(o.task.prompt || '') && o.title ? o.title : strip(o.task.prompt) || o.title || '';
    const bar = n ? `<div class="mtrack"><div class="mfill" style="width:${Math.min(100, ((done + cur) / n) * 100)}%"></div></div>` : '';
    const src = SRC(o.task);
    return `<div class="other panel ${scls} src-${src}" data-k="o${o.id}" data-sid="${esc(o.id)}"><div class="orow"><span class="odot"></span>${brand(src)}<span class="ot">${esc(t)}</span><span class="os">${esc(stext)}${n ? ` · ${done}/${n}` : ''}</span><span class="x" data-sid="x|${esc(o.id)}" title="清除">×</span></div>${bar}</div>`;
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  // token counts in Chinese units: 1.2 万, 2.78 亿
  const fmtTok = (n) => { n = n || 0; if (n < 1e4) return String(Math.round(n)); if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 1 : 0) + ' 万'; return (n / 1e8).toFixed(2) + ' 亿'; };
  const agoTxt = (ms) => (ms < 90e3 ? '刚刚' : ms < 3600e3 ? `${Math.round(ms / 60e3)} 分钟前` : ms < 48 * 3600e3 ? `${Math.round(ms / 3600e3)} 小时前` : `${Math.round(ms / 86400e3)} 天前`);
  const resetTxt = (s) => (s == null ? '' : s < 3600 ? `${Math.max(1, Math.round(s / 60))} 分钟后重置` : s < 86400 ? `${Math.round(s / 3600)} 小时后重置` : `${Math.round(s / 86400)} 天后重置`);

  // plan usage and token use, kept compact: one gauge per quota (Claude's two, Codex's own), then a row of numbers.
  // Claude's figures between the desktop app's readings are estimates and say so ("约").
  function usage(u, live, now) {
    if (!u) return '';
    const gauge = (src, label, pct, resetS, est) => {
      const head = `<div class="ul"><span class="gl"><i class="bd ${src}"></i>${NAME[src]} · ${label}</span><span>${resetS != null ? resetTxt(resetS) : ''}</span></div>`;
      if (pct == null) return `<div class="ug ${src}">${head}<div class="ub"><i style="width:0%"></i></div><div class="un"><b>—</b></div></div>`;
      const left = Math.max(0, 100 - pct), cls = pct >= 95 ? ' hot' : pct >= 80 ? ' warm' : '';
      return `<div class="ug ${src}${cls}">${head}<div class="ub"><i style="width:${Math.min(100, pct)}%"></i></div><div class="un"><b>${est ? '约' : ''}剩 ${Math.round(left)}%</b><small>已用 ${Math.round(pct)}%</small></div></div>`;
    };
    const p = u.plan || {}, cx = u.codex || null, est = p.src === 'est';
    const days = (u.week && u.week.days) || [];
    const mx = Math.max(1, ...days);
    const spark = days.length ? `<div class="spark">${days.map((d, i) => `<i style="height:${Math.max(6, Math.round((d / mx) * 100))}%"${i === days.length - 1 ? ' class="now"' : ''}></i>`).join('')}</div>` : '';
    const stat = (v, l, cls) => `<div class="us${cls ? ' ' + cls : ''}"><b>${v}</b><span>${l}</span></div>`;
    const ago = p.t ? agoTxt(now - p.t) : '';
    const note = p.src === 'live' ? '' : est ? (now - p.t > 6 * 3600e3 ? `Claude 为估算值，上次实测在 ${ago} · 点一下任务栏右下角的 Claude 图标可校准` : `Claude 为估算值，上次实测在 ${ago}`)
      : p.t ? `Claude 额度来自桌面端 ${ago}的记录` : u.serviceErr ? '暂时拿不到 Claude 额度' : '';
    const gs = [gauge('claude', '5 小时', p.fh, p.fhReset, est), gauge('claude', '本周', p.sd, p.sdReset, est)];
    if (cx && cx.short) gs.push(gauge('codex', '5 小时', cx.short.pct, cx.short.resetS));
    if (cx) gs.push(gauge('codex', '本周', cx.week ? cx.week.pct : null, cx.week ? cx.week.resetS : null));
    return `<div class="usage panel" data-k="usage">
      <div class="uhead"><span class="ut">AI 用量</span>${note ? `<span class="unote">${esc(note)}</span>` : ''}</div>
      <div class="ugs" style="--g:${gs.length}">${gs.join('')}</div>
      <div class="uss">
        ${stat(u.today ? fmtTok(u.today.tok) : '—', '<i class="bd claude"></i>Claude 今日 tokens')}
        ${stat(u.today && u.today.cost != null ? '$' + Math.round(u.today.cost) : '—', '今日折合 API 价')}
        ${cx ? stat(fmtTok(cx.today.tok), '<i class="bd codex"></i>Codex 今日 tokens') : ''}
        ${stat(live.perMin > 0 ? fmtTok(live.perMin) + '/分' : '0', '实时用量', live.perMin > 0 ? 'live' : '')}
        ${spark ? `<div class="us wk">${spark}<span>近 7 天</span></div>` : ''}
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
