// The pop-up panel from the tray icon: the quotas, then the tasks that wait for you, those at work, and those just
// finished. A click on a task opens it. For a look without going to the desktop (one screen, windows maximized).
(function () {
  const ZH = {
    h5: '5 小时', week: '本周', left: (p) => `剩 ${p}%`, runsOut: (d) => `约 ${d}后用完`,
    need: '等你', run: '进行中', done: '最近完成',
    approve: '等你批准', reply: '等你回复', stuck: '可能卡住了', think: '正在思考', work: '进行中', finished: '已完成',
    task: '任务', emptyT: '现在没有任务在进行', found: (l) => `已连接：${l}`, none: '还没有找到 AI 编程工具的记录。',
    peek: '全屏查看', settings: '设置',
  };
  const EN = {
    h5: '5-hour', week: 'Week', left: (p) => `${p}% left`, runsOut: (d) => `out in ~${d}`,
    need: 'Waiting for you', run: 'At work', done: 'Just finished',
    approve: 'Needs approval', reply: 'Waiting for reply', stuck: 'May be stuck', think: 'Thinking', work: 'At work', finished: 'Done',
    task: 'Task', emptyT: 'No tasks at work', found: (l) => `Connected: ${l}`, none: 'No AI coding tool logs found yet.',
    peek: 'Full view', settings: 'Settings',
  };
  let data = [], usage = null, view = { lang: 'zh', usage: {}, brands: {} }, keys = {}, found = [], T = ZH, lastH = 0;
  const el = document.getElementById('panel');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const firstLine = (s) => String(s || '').replace(/<\/?[a-zA-Z_][^>]*>/g, '\n').replace(/[*`#>]/g, '').split('\n').map((x) => x.trim()).find(Boolean) || '';

  function take(h) {
    if (!h) return;
    if (h.data) data = h.data;
    if ('usage' in h) usage = h.usage;
    if (h.view) setView(h.view);
    if (h.keys) keys = h.keys;
    if (h.found) found = h.found;
    draw();
  }
  function setView(v) {
    view = v; I18N.set(v.lang); T = v.lang === 'en' ? EN : ZH;
    document.documentElement.lang = v.lang === 'en' ? 'en' : 'zh-CN';
    const pre = FontSlots.apply(document, v.font, draw);
    document.documentElement.style.setProperty('--ff', pre + '"Segoe UI Variable Text", "Segoe UI", system-ui, "Microsoft YaHei UI", "PingFang SC", sans-serif');
  }

  // the quotas, one line each; when one runs out before it resets at the current pace, that is said instead
  function quotas(now) {
    if (!usage || (view.usage && view.usage.show === false)) return '';
    const p = usage.plan || {}, cx = usage.codex || {}, fc = usage.forecast || {}, b = view.brands || {}, u = view.usage || {};
    const cc = (b.claude && b.claude.color) || '#f4a98c', xc = (b.codex && b.codex.color) || '#8fc1ff';
    const rows = [];
    const row = (name, color, pct, f) => {
      if (pct == null) return;
      const cls = pct >= (u.hot || 95) ? ' hot' : pct >= (u.warm || 80) ? ' warm' : '';
      const v = f && f.beforeReset && pct < 100 ? `<span class="v fc">${esc(T.runsOut(I18N.mins(f.outAt - now)))}</span>` : `<span class="v">${esc(T.left(Math.round(Math.max(0, 100 - pct))))}</span>`;
      rows.push(`<div class="q${cls}" style="--c:${color}"><span class="n"><i></i>${esc(name)}</span><div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>${v}</div>`);
    };
    const claudeOn = !(b.claude && b.claude.on === false), codexOn = !(b.codex && b.codex.on === false);
    if (claudeOn && u.h5 !== false) row(`Claude · ${T.h5}`, cc, p.fh, fc.fh);
    if (claudeOn && u.week !== false) row(`Claude · ${T.week}`, cc, p.sd, fc.sd);
    if (codexOn && u.codex !== false) { if (cx.short) row(`Codex · ${T.h5}`, xc, cx.short.pct, fc.cxs); if (cx.week) row(`Codex · ${T.week}`, xc, cx.week.pct, fc.cxw); }
    return rows.length ? `<section>${rows.join('')}</section>` : '';
  }

  // one task: its name and what it is doing, then its progress, percentage and how long it has run
  function task(s, k, now) {
    const t = s.task, color = (t.brand && t.brand.color) || '#fff';
    const name = view.privacy ? s.title || T.task : /^(Task|Background) \(from the session/.test(t.prompt || '') && s.title ? s.title : firstLine(t.prompt) || s.title || T.task;
    let kind = k.kind === 'wait' ? (k.approval ? 'approve' : 'reply') : k.kind, what;
    if (kind === 'done') what = T.finished;
    else if (kind === 'approve' || kind === 'reply' || kind === 'stuck' || kind === 'think' || view.privacy) what = T[kind] || T.work;
    else {
      const m = Flow.model(t, now), g = Flow.progress(t, now, m);
      what = g.plan && g.cur >= 0 ? m.plan[g.cur].active || m.plan[g.cur].text : (k.tool && k.tool.op ? I18N.op(k.tool.op) : T.work);
    }
    let l2 = '';
    if (kind !== 'done') {
      const g = Flow.progress(t, now), pct = Math.round(Math.max(0, Math.min(100, g.pct)));
      l2 = `<div class="l2"><div class="bar"><i style="width:${pct}%"></i></div><span><b>${g.plan ? '' : '~'}${pct}%</b>${esc(I18N.mins(now - t.t0))}</span></div>`;
    }
    return `<button class="t ${kind}" data-id="${esc(s.id)}" style="--c:${color}"><div class="l1"><span class="dot"></span><span class="ti">${esc(name)}</span><span class="st">${esc(what)}</span></div>${l2}</button>`;
  }
  function tasks(now) {
    const need = [], run = [], done = [];
    for (const s of data) {
      let k = Scene.stateOf(s.task, now);
      if (k.kind === 'wait' && !k.approval && now - k.since > (view.waitDone || 2) * 3600e3) k = { kind: 'done', since: k.since };
      if (k.kind === 'done') { if (now - k.since < 3 * 3600e3) done.push({ s, k }); continue; }
      (k.kind === 'wait' ? need : run).push({ s, k });
    }
    const byStart = (a, b) => (a.s.task.t0 || 0) - (b.s.task.t0 || 0);
    need.sort((a, b) => a.k.since - b.k.since); run.sort(byStart); done.sort((a, b) => b.k.since - a.k.since);
    const group = (title, list) => (list.length ? `<h2>${esc(title)}</h2>${list.map((o) => task(o.s, o.k, now)).join('')}` : '');
    const body = group(T.need, need) + group(T.run, run) + group(T.done, done.slice(0, 3));
    if (body) return `<section>${body}</section>`;
    const sep = view.lang === 'en' ? ', ' : '、';
    return `<section><div class="empty"><b>${esc(T.emptyT)}</b>${esc(found.length ? T.found(found.join(sep)) : T.none)}</div></section>`;
  }
  function draw() {
    const now = Date.now();
    el.innerHTML = quotas(now) + tasks(now)
      + `<div class="acts"><button data-act="peek">${esc(T.peek)}${keys.peek ? `<kbd>${esc(keys.peek)}</kbd>` : ''}</button><button data-act="settings">${esc(T.settings)}</button></div>`;
    const h = el.offsetHeight;
    if (h !== lastH) { lastH = h; window.panel.size(h); }
  }
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (a) return window.panel.act(a.dataset.act);
    const t = e.target.closest('[data-id]'); if (t) window.panel.open(t.dataset.id);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') window.panel.act('none'); });
  window.panel.onAll(take);
  window.panel.onData((d) => { data = d; draw(); });
  window.panel.onUsage((u) => { usage = u; draw(); });
  window.panel.onView((v) => { setView(v); draw(); });
  window.panel.hello().then(take);
  setInterval(() => { if (!document.hidden) draw(); }, 1000);
})();
